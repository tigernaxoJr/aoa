// assemble.mjs against temp projects whose scene outputs are solid-color clips made with FFmpeg
// (fast; render-scene is covered by render.test.mjs), plus the pure timeline functions.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { afterEach, describe, test } from 'node:test'
import { filterGraph, layout, mergeCaptions, toAss, toSrt } from '../../templates/product-video/scripts/lib/timeline.mjs'
import { baseProject, baseScene, makeProject } from './helpers.mjs'

const require = createRequire(import.meta.url)
const ffmpegBin = require('ffmpeg-static')
const ffprobe = require('ffprobe-static').path

const ff = (...args) => {
  const r = spawnSync(ffmpegBin, ['-v', 'error', '-y', ...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 })
  assert.equal(r.status, 0, String(r.stderr))
  return r.stdout
}
const info = (file) =>
  JSON.parse(spawnSync(ffprobe, ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,nb_read_frames:format=duration', '-of', 'json', file], { encoding: 'utf8' }).stdout)
/** RGB bytes of a region of the frame at time t. */
const region = (file, t, x, y, w = 1, h = 1) => [...ff('-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `format=rgb24,crop=${w}:${h}:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-')]
const near = (actual, expected, label) =>
  assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) < 48), `${label}: got rgb(${actual}) expected ~rgb(${expected})`)

const FPS = 24
let p
afterEach(() => p?.cleanup())

/**
 * Project with scenes [{ color, transition, captions }], each 1 s, already marked rendered.
 * Returns the project helpers.
 */
function renderedProject(specs, { project = baseProject(), render = true } = {}) {
  project.project.format = { aspectRatio: '16:9', width: 640, height: 360, fps: FPS, targetDurationSec: 10 }
  const scenes = specs.map((s, i) => {
    const id = `scene-00${i + 1}`
    return {
      id,
      dir: `scenes/00${i + 1}-${s.color}`,
      scene: baseScene(id, { durationSec: 1, visual: { type: 'motion-graphic', description: s.color, transitionIn: s.transition ?? 'none' } }),
    }
  })
  p = makeProject({ project, scenes })
  specs.forEach((s, i) => {
    const { id, dir } = scenes[i]
    if (s.captions) writeFileSync(p.path(dir, 'assets/captions.json'), JSON.stringify(s.captions))
    if (!render) return
    mkdirSync(p.path(dir, 'output'), { recursive: true })
    ff(
      '-f', 'lavfi', '-i', `color=c=${s.color}:s=640x360:r=${FPS}:d=1`,
      '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000:duration=1',
      '-ac', '2', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', p.path(dir, 'output/scene.mp4'),
    )
    for (const args of [['--status', 'assets_ready'], ['--status', 'rendering'], ['--rendered']]) {
      const r = p.run('state.mjs', [id, ...args])
      assert.equal(r.code, 0, r.stderr)
    }
  })
  return p
}

describe('assemble', () => {
  test('joins scenes in order with cuts and a fade, and writes shifted captions', () => {
    renderedProject([
      { color: 'red', captions: [{ start: 0.1, end: 0.8, text: '紅色' }] },
      { color: 'lime', transition: 'none', captions: [{ start: 0.2, end: 0.9, text: '綠色' }] },
      { color: 'blue', transition: 'fade', captions: [{ start: 0.1, end: 0.9, text: '藍色' }] },
    ])
    const r = p.run('assemble.mjs')
    assert.equal(r.code, 0, r.stderr)
    const out = p.path('output/final.mp4')
    const { streams, format } = info(out)
    // 1 + 1 + 1 − 0.5 s fade overlap
    assert.ok(Math.abs(Number(format.duration) - 2.5) < 0.05, `duration ${format.duration}`)
    assert.equal(Number(streams.find((s) => s.codec_type === 'video').nb_read_frames), 60)
    assert.ok(streams.some((s) => s.codec_type === 'audio'))

    near(region(out, 0.5, 320, 180), [255, 0, 0], 'scene 1')
    near(region(out, 1.2, 320, 180), [0, 255, 0], 'scene 2 after a cut')
    near(region(out, 2.3, 320, 180), [0, 0, 255], 'scene 3 after the fade')
    const mid = region(out, 1.75, 320, 180)
    assert.ok(mid[1] > 60 && mid[2] > 60, `mid-fade mixes both scenes: rgb(${mid})`)

    // Scene 3 starts at 1.5 s (fade overlaps the end of scene 2); scene 2's cue is cut at 1.5 s.
    const srt = readFileSync(p.path('output/final.srt'), 'utf8')
    assert.equal(
      srt,
      '1\n00:00:00,100 --> 00:00:00,800\n紅色\n\n2\n00:00:01,200 --> 00:00:01,500\n綠色\n\n3\n00:00:01,600 --> 00:00:02,400\n藍色\n',
    )
  })

  test('stops and lists scenes that are not rendered or have changed', () => {
    renderedProject([{ color: 'red' }, { color: 'blue' }])
    writeFileSync(p.path('scenes/002-blue/script.md'), '改過的旁白。\n')
    let r = p.run('assemble.mjs')
    assert.equal(r.code, 1)
    assert.match(r.stderr, /scene-002: inputs changed since render/)
    assert.equal(existsSync(p.path('output/final.mp4')), false)

    renderedProject([{ color: 'red' }], { render: false })
    r = p.run('assemble.mjs')
    assert.equal(r.code, 1)
    assert.match(r.stderr, /scene-001: status draft/)
  })

  test('mixes looped BGM under the narration and burns captions', () => {
    const project = baseProject()
    project.project.audio = { bgm: 'assets/bgm.mp3', bgmVolume: 0.3, ducking: true }
    project.project.captions = { mode: 'burn', style: { fontSize: 28, position: 'bottom' } }
    renderedProject([{ color: 'black', captions: [{ start: 0, end: 1, text: '字幕燒入測試' }] }, { color: 'black', transition: 'wipe' }], { project })
    mkdirSync(p.path('assets'), { recursive: true })
    ff('-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.4', p.path('assets/bgm.mp3')) // shorter than the video: must loop
    const r = p.run('assemble.mjs')
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stdout, /with BGM, burning captions/)
    const out = p.path('output/final.mp4')
    assert.ok(Math.abs(Number(info(out).format.duration) - 1.5) < 0.05)
    // Burned text: some bright pixels in the bottom band of an otherwise black frame.
    const band = region(out, 0.25, 0, 260, 640, 80) // the cue ends at 0.5 s, where the wipe begins
    assert.ok(band.reduce((m, v) => Math.max(m, v), 0) > 200, 'captions are burned into the bottom of the frame')
    assert.ok(existsSync(p.path('output/final.srt')), 'burn mode still writes the srt')
  })

  test('missing BGM is skipped with a warning; captions.mode none writes no srt', () => {
    const project = baseProject()
    project.project.audio = { bgm: 'assets/missing.mp3', bgmVolume: 0.25, ducking: true }
    project.project.captions = { mode: 'none' }
    renderedProject([{ color: 'red' }], { project })
    const r = p.run('assemble.mjs')
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stderr, /audio.bgm assets\/missing.mp3 not found/)
    assert.equal(existsSync(p.path('output/final.srt')), false)
  })

  test('a failed assemble keeps the previous final video', () => {
    renderedProject([{ color: 'red' }])
    p.write('output/final.mp4', 'previous final')
    writeFileSync(p.path('scenes/001-red/output/scene.mp4'), 'corrupt') // output is not part of inputHash
    const r = p.run('assemble.mjs')
    assert.equal(r.code, 1)
    assert.equal(readFileSync(p.path('output/final.mp4'), 'utf8'), 'previous final')
  })

  test('the project can be marked completed afterwards', () => {
    renderedProject([{ color: 'red' }, { color: 'blue', transition: 'slide-left' }])
    assert.equal(p.read('video.project.json').status, 'ready_to_assemble')
    assert.equal(p.run('assemble.mjs').code, 0)
    const r = p.run('state.mjs', ['project', '--status', 'completed'])
    assert.equal(r.code, 0, r.stderr)
    assert.equal(p.read('video.project.json').status, 'completed')
  })
})

describe('timeline', () => {
  test('transitions overlap the previous scene and snap to whole frames', () => {
    const { items, total } = layout(
      [{ duration: 2, transition: 'fade' }, { duration: 2, transition: 'none' }, { duration: 0.6, transition: 'zoom' }],
      25,
    )
    assert.deepEqual(items.map((i) => i.xfade), [null, null, 'zoomin'])
    // 0.6 s scene limits the overlap to 0.3 s, snapped down to 7 frames at 25 fps.
    assert.equal(items[2].overlap, 7 / 25)
    assert.equal(items[2].start, 4 - 7 / 25)
    assert.equal(total, 4 - 7 / 25 + 0.6)
    assert.equal(items[0].xfade, null, 'the first scene never has a transition')
  })

  test('filter graph uses xfade/acrossfade for transitions and concat for cuts', () => {
    const graph = filterGraph(layout([{ duration: 1, transition: 'none' }, { duration: 1, transition: 'slide-right' }, { duration: 1, transition: 'none' }], 30), { fps: 30 })
    assert.match(graph, /\[v0\]\[v1\]xfade=transition=slideright:duration=0\.5:offset=0\.5\[vx1\]/)
    assert.match(graph, /\[a0\]\[a1\]acrossfade=d=0\.5/)
    assert.match(graph, /\[vx1\]\[v2\]concat=n=2:v=1:a=0\[vx2\]/)
    assert.match(graph, /\[vx2\]null\[vout\]/)
  })

  test('captions are clipped at the next scene start and formatted as SRT / ASS', () => {
    const t = layout([{ duration: 2, transition: 'none' }, { duration: 2, transition: 'fade' }], 30)
    const cues = mergeCaptions(t, [[{ start: 1.0, end: 2.0, text: '甲' }, { start: 1.6, end: 1.9, text: '丙' }], [{ start: 0, end: 1, text: '乙' }]])
    assert.deepEqual(cues.map((c) => [c.text, c.start, c.end]), [['甲', 1, 1.5], ['乙', 1.5, 2.5]])
    assert.equal(toSrt([{ start: 3661.5, end: 3662, text: 'x' }]), '1\n01:01:01,500 --> 01:01:02,000\nx\n')
    const ass = toAss([{ start: 1.25, end: 2, text: 'a{b}\nc' }], { width: 1920, height: 1080 }, { position: 'top' })
    assert.match(ass, /PlayResY: 1080/)
    assert.match(ass, /Style: Default,Noto Sans TC,48,.*,8,/)
    assert.match(ass, /Dialogue: 0,0:00:01\.25,0:00:02\.00,Default,,0,0,0,,ab\\Nc/)
  })
})
