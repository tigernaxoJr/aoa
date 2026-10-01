// render-scene.mjs, plus the motion math. Scenes use solid-color
// sources at a small format (640×360, 24 fps), so layout can be checked by sampling pixels of the output.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { afterEach, describe, test } from 'node:test'
import { probeDuration } from '../../templates/product-video/scripts/lib/media.mjs'
import { anchor, elementState, visibleText } from '../../templates/product-video/src/lib/motion.js'
import { baseProject, baseScene, makeProject } from './helpers.mjs'

const require = createRequire(import.meta.url)
const ffmpegBin = require('ffmpeg-static')
const ffprobe = require('ffprobe-static').path
const templateSrc = new URL('../../templates/product-video/src', import.meta.url)

const ff = (...args) => {
  const r = spawnSync(ffmpegBin, ['-v', 'error', '-y', ...args], { encoding: 'buffer' })
  assert.equal(r.status, 0, String(r.stderr))
  return r.stdout
}
const probe = (file, entries) =>
  spawnSync(ffprobe, ['-v', 'error', '-count_frames', '-show_entries', entries, '-of', 'json', file], { encoding: 'utf8' })
const streams = (file) => JSON.parse(probe(file, 'stream=codec_type,width,height,nb_read_frames,pix_fmt').stdout).streams
/** RGB of one output pixel at time t. */
const pixel = (file, t, x, y) => [...ff('-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `format=rgb24,crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-')]
/** Brightest channel-minimum in a w×h region at time t: high only where something is near white. */
const whitest = (file, t, x, y, w, h) => {
  const px = [...ff('-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `format=rgb24,crop=${w}:${h}:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-')]
  let best = 0
  for (let i = 0; i < px.length; i += 3) best = Math.max(best, Math.min(px[i], px[i + 1], px[i + 2]))
  return best
}
const near = (actual, expected, label) =>
  assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) < 48), `${label}: got rgb(${actual}) expected ~rgb(${expected})`)

let p
afterEach(() => p?.cleanup())

function smallProject() {
  const project = baseProject()
  project.project.format = { aspectRatio: '16:9', width: 640, height: 360, fps: 24, targetDurationSec: 10 }
  return project
}

/**
 * Background: red user-asset video, 1 s long but trimmed to 0.2–0.8 s, in a 1.5 s scene (so it
 * must hold its last frame). Blue image centered, green video top-left, a text element, no narration.
 */
function layeredProject() {
  const scene = baseScene('scene-001', {
    durationSec: 1.5,
    visual: {
      type: 'user-asset',
      description: 'layers',
      asset: { src: 'assets/bg.mp4', kind: 'video', trimStartSec: 0.2, trimEndSec: 0.8, fit: 'cover' },
      elements: [
        { type: 'image', src: '@/assets/blue.png', at: 0, animation: 'none', position: 'center' },
        { type: 'video', src: 'assets/green.mp4', at: 0.5, animation: 'none', position: 'top-left' },
        { type: 'text', content: '測試', at: 0.2, animation: 'typewriter', position: 'bottom' },
      ],
    },
  })
  p = makeProject({ project: smallProject(), scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene, script: '' }] })
  cpSync(templateSrc, p.path('src'), { recursive: true })
  const assets = p.path('scenes/001-hook/assets')
  ff('-f', 'lavfi', '-i', 'color=c=red:s=640x360:r=25:d=1', '-pix_fmt', 'yuv420p', join(assets, 'bg.mp4'))
  ff('-f', 'lavfi', '-i', 'color=c=lime:s=160x90:r=25:d=2', '-pix_fmt', 'yuv420p', join(assets, 'green.mp4'))
  p.write('assets/.keep', '')
  ff('-f', 'lavfi', '-i', 'color=c=blue:s=200x200', '-frames:v', '1', p.path('assets/blue.png'))
  return p
}

function checkLayered(out) {
  const s = streams(out)
  const video = s.find((x) => x.codec_type === 'video')
  assert.equal(video.width, 640)
  assert.equal(video.height, 360)
  assert.equal(Number(video.nb_read_frames), 36) // 1.5 s × 24 fps
  assert.equal(video.pix_fmt, 'yuv420p')
  assert.ok(s.some((x) => x.codec_type === 'audio'), 'silent scenes still carry an audio stream')

  const RED = [255, 0, 0]
  near(pixel(out, 0.1, 600, 340), RED, 'background at start')
  near(pixel(out, 1.4, 600, 340), RED, 'background holds its last frame after the trimmed clip ends')
  near(pixel(out, 0.1, 320, 180), [0, 0, 255], 'centered image')
  near(pixel(out, 0.2, 100, 60), RED, 'video element not yet visible')
  near(pixel(out, 1.0, 100, 60), [0, 255, 0], 'top-left video element after at=0.5')
  assert.ok(whitest(out, 1.4, 200, 260, 240, 90) > 200, 'text is drawn with the bundled font')
}

async function render(t) {
  layeredProject()
  // Hide the system fonts (Linux), so the text can only come from src/fonts.
  p.write('fonts.conf', '<?xml version="1.0"?><fontconfig></fontconfig>')
  const r = await p.runAsync('render-scene.mjs', ['scene-001'], { FONTCONFIG_FILE: p.path('fonts.conf') })
  if (/no usable browser/.test(r.stderr)) {
    t.skip('no browser available')
    return null
  }
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /rendered scenes\/001-hook\/output\/scene\.mp4/)
  assert.equal(existsSync(p.path('.tmp/render-scene-001')), false, 'scratch files are removed')
  return p.path('scenes/001-hook/output/scene.mp4')
}

describe('render-scene', () => {
  test('draws every layer at the planned time', async (t) => {
    const out = await render(t)
    if (out) checkLayered(out)
  })

  test('duration follows the narration plus 0.5 s', async (t) => {
    const scene = baseScene('scene-001', {
      visual: { type: 'code', description: 'code', code: { language: 'js', content: 'const a = 1\nconsole.log(a)\n', highlightLines: [2] } },
    })
    p = makeProject({ project: smallProject(), scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene, script: '一二三四。\n' }] })
    cpSync(templateSrc, p.path('src'), { recursive: true })
    assert.equal(p.run('tts.mjs', ['scene-001'], { VIDEO_AGENT_FAKE_TTS: '1' }).code, 0)
    const r = await p.runAsync('render-scene.mjs', ['scene-001'])
    if (/no usable browser/.test(r.stderr)) return t.skip('no browser available')
    assert.equal(r.code, 0, r.stderr)
    // Same ffprobe as the pipeline: versions disagree on MP3 length (newer ones drop encoder padding).
    const audioSec = probeDuration(p.path('scenes/001-hook/assets/narration.mp3'))
    const expected = Math.round((audioSec + 0.5) * 24)
    const [, frames] = /(\d+) frames/.exec(r.stdout)
    assert.equal(Number(frames), expected, r.stdout)

    // The scene can then be marked rendered; state records the actual duration.
    const s = p.run('state.mjs', ['scene-001', '--status', 'assets_ready'])
    assert.equal(s.code, 0, s.stderr)
    assert.equal(p.run('state.mjs', ['scene-001', '--status', 'rendering']).code, 0)
    const done = p.run('state.mjs', ['scene-001', '--rendered'])
    assert.equal(done.code, 0, done.stderr)
    const render = p.read('scenes/001-hook/scene.json').render
    assert.ok(Math.abs(render.actualDurationSec - expected / 24) < 0.05, `actualDurationSec ${render.actualDurationSec}`)
  })

  test('without narration audio, durationSec must be set', async () => {
    p = makeProject({ project: smallProject(), scenes: [{ id: 'scene-001', dir: 'scenes/001-hook' }] })
    const r = await p.runAsync('render-scene.mjs', ['scene-001'])
    assert.equal(r.code, 1)
    assert.match(r.stderr, /durationSec is null and there is no narration audio/)
  })

  test('a failed render keeps the previous output', async () => {
    const scene = baseScene('scene-001', { durationSec: 1, visual: { type: 'screenshot', description: 's', capture: { url: 'https://example.com' } } })
    p = makeProject({ project: smallProject(), scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene }] })
    p.write('scenes/001-hook/output/scene.mp4', 'previous render')
    const r = await p.runAsync('render-scene.mjs', ['scene-001'])
    assert.equal(r.code, 1)
    assert.match(r.stderr, /screenshot \(run pnpm run capture\) not found/)
    assert.equal(readFileSync(p.path('scenes/001-hook/output/scene.mp4'), 'utf8'), 'previous render')
  })
})

describe('motion', () => {
  test('preset anchors keep a safe margin and align the box edge', () => {
    assert.deepEqual(anchor('center'), { left: 50, top: 50, tx: -50, ty: -50 })
    assert.deepEqual(anchor('top-left'), { left: 8, top: 8, tx: 0, ty: 0 })
    assert.deepEqual(anchor('bottom-right'), { left: 92, top: 92, tx: -100, ty: -100 })
    assert.deepEqual(anchor({ x: 30, y: 70 }), { left: 30, top: 70, tx: -50, ty: -50 })
  })

  test('elements appear at `at`, animate in, and fade out when they have a duration', () => {
    const el = { at: 1, end: 3, exitAt: 3, animation: 'fadeIn' }
    assert.equal(elementState(el, 0.99), null)
    assert.equal(elementState(el, 3), null)
    assert.ok(elementState(el, 1.1).opacity < 1)
    assert.equal(elementState(el, 2).opacity, 1)
    assert.ok(elementState(el, 2.9).opacity < 1)
    const slide = elementState({ at: 0, end: 5, exitAt: null, animation: 'slideInLeft' }, 0.1)
    assert.ok(slide.dx < 0)
  })

  test('typewriter reveals whole characters', () => {
    const el = { at: 0, end: 5, exitAt: null, animation: 'typewriter', content: '一鍵部署完成' }
    assert.equal(visibleText(el, elementState(el, 0)), '')
    assert.equal(visibleText(el, elementState(el, 0.25)), '一鍵部')
    assert.equal(visibleText(el, elementState(el, 4)), '一鍵部署完成')
  })
})
