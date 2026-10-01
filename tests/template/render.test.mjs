// render-scene.mjs, plus the motion math. Scenes use solid-color
// sources at a small format (640×360, 24 fps), so layout can be checked by sampling pixels of the output.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { afterEach, describe, test } from 'node:test'
import { keyframes, probeDuration } from '../../templates/product-video/scripts/lib/media.mjs'
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

/** Bounding box { top, bottom, left, right } of the near-white pixels in a 640×360 frame at t, or null. */
const whiteBox = (file, t) => {
  const px = ff('-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'format=rgb24', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-')
  let box = null
  for (let y = 0; y < 360; y++) {
    for (let x = 0; x < 640; x++) {
      const i = (y * 640 + x) * 3
      if (Math.min(px[i], px[i + 1], px[i + 2]) <= 200) continue
      box ??= { top: y, bottom: y, left: x, right: x }
      box.bottom = y
      box.left = Math.min(box.left, x)
      box.right = Math.max(box.right, x)
    }
  }
  return box
}

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
    if (!out) return
    checkLayered(out)
    // 1.5 s at 24 fps: keyframes 0.5 s from each end, where assemble's transitions begin and end.
    assert.deepEqual(keyframes(out, 24), [0, 12, 24])
  })

  test('enlarged text is bigger, but shrinks to two lines inside the frame', async (t) => {
    const text = (content, size, at) => ({ type: 'text', content, size, at, duration: 0.5, animation: 'none' })
    const scene = baseScene('scene-001', {
      durationSec: 1.5,
      visual: {
        type: 'motion-graphic',
        description: 'text sizes',
        elements: [
          text('大字', 'normal', 0),
          text('大字', 'xl', 0.5),
          text('這是一段很長很長的畫面文字，放大之後一定會超過兩行，所以要自動縮小回來', 'xl', 1.0),
        ],
      },
    })
    p = makeProject({ project: smallProject(), scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene, script: '' }] })
    cpSync(templateSrc, p.path('src'), { recursive: true })
    const r = await p.runAsync('render-scene.mjs', ['scene-001'])
    if (/no usable browser/.test(r.stderr)) return t.skip('no browser available')
    assert.equal(r.code, 0, r.stderr)
    const out = p.path('scenes/001-hook/output/scene.mp4')

    const height = (b) => b.bottom - b.top
    const normal = whiteBox(out, 0.1)
    const xl = whiteBox(out, 0.6)
    assert.ok(height(xl) > height(normal) * 1.5, `xl ${height(xl)}px vs normal ${height(normal)}px`)

    // Unshrunk, the long text would wrap to 4 lines at xl (~190 px); fitted it is 2 short lines.
    const long = whiteBox(out, 1.2)
    assert.ok(height(long) < 2 * 1.3 * 360 * 0.062 * 1.3, `long text is ${height(long)}px tall`)
    assert.ok(long.top > 0 && long.bottom < 359 && long.left > 0 && long.right < 639, 'long text stays inside the frame')
  })

  test('a motion module draws the background frame by frame; shared SVGs overlay it', async (t) => {
    const scene = baseScene('scene-001', {
      durationSec: 1.5,
      visual: {
        type: 'motion-graphic',
        description: 'moving square',
        motion: { file: 'assets/motion.js' },
        elements: [{ type: 'image', src: '@/assets/svg/mark.svg', at: 0, animation: 'none', position: 'bottom-right' }],
      },
    })
    p = makeProject({ project: smallProject(), scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene, script: '' }] })
    cpSync(templateSrc, p.path('src'), { recursive: true })
    // Blue canvas with a white 40 px square that moves 200 px per second; driven only by seek(t).
    p.write('scenes/001-hook/assets/motion.js', `export default function setup({ root, width, height }) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  root.append(canvas)
  const g = canvas.getContext('2d')
  return (t) => {
    g.fillStyle = '#0000ff'
    g.fillRect(0, 0, width, height)
    g.fillStyle = '#ffffff'
    g.fillRect(100 + t * 200, 40, 40, 40)
  }
}
`)
    p.write('assets/svg/mark.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#00ff00"/></svg>')
    const r = await p.runAsync('render-scene.mjs', ['scene-001'])
    if (/no usable browser/.test(r.stderr)) return t.skip('no browser available')
    assert.equal(r.code, 0, r.stderr)
    const out = p.path('scenes/001-hook/output/scene.mp4')

    near(pixel(out, 0.1, 20, 340), [0, 0, 255], 'the module replaces the gradient')
    const early = whiteBox(out, 0.25)
    const late = whiteBox(out, 1.0)
    assert.ok(Math.abs(early.left - 150) <= 3, `square at 0.25 s starts at x=${early.left}`)
    assert.ok(Math.abs(late.left - 300) <= 3, `square at 1.0 s starts at x=${late.left}`)
    near(pixel(out, 0.5, 560, 300), [0, 255, 0], 'SVG element in the bottom-right corner')
  })

  test('a motion module that does not return seek(t) fails the render', async (t) => {
    const scene = baseScene('scene-001', { durationSec: 0.5, visual: { type: 'motion-graphic', description: 'x', motion: { file: 'assets/motion.js' } } })
    p = makeProject({ project: smallProject(), scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene, script: '' }] })
    cpSync(templateSrc, p.path('src'), { recursive: true })
    p.write('scenes/001-hook/assets/motion.js', 'export default function setup() {}\n')
    const r = await p.runAsync('render-scene.mjs', ['scene-001'])
    if (/no usable browser/.test(r.stderr)) return t.skip('no browser available')
    assert.equal(r.code, 1)
    assert.match(r.stderr, /must return seek\(t\)/)
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
    // Same ffprobe as the pipeline (the bundled one): versions disagree on MP3 length.
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

  test('captions.mode burn draws the scene captions with the bundled font', async (t) => {
    const project = smallProject()
    project.project.captions = { mode: 'burn', style: { fontSize: 28, position: 'bottom' } }
    const scene = baseScene('scene-001', { durationSec: 1, visual: { type: 'motion-graphic', description: 'blank' } })
    p = makeProject({ project, scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene }] })
    cpSync(templateSrc, p.path('src'), { recursive: true })
    p.write('scenes/001-hook/assets/captions.json', [{ start: 0, end: 0.5, text: '字幕燒入測試' }])
    // Hide the system fonts from libass, so the captions can only come from src/fonts.
    p.write('fonts.conf', '<?xml version="1.0"?><fontconfig></fontconfig>')
    const r = await p.runAsync('render-scene.mjs', ['scene-001'], { FONTCONFIG_FILE: p.path('fonts.conf') })
    if (/no usable browser/.test(r.stderr)) return t.skip('no browser available')
    assert.equal(r.code, 0, r.stderr)
    const out = p.path('scenes/001-hook/output/scene.mp4')
    assert.ok(whitest(out, 0.25, 0, 260, 640, 80) > 200, 'captions are burned into the bottom of the frame')
    assert.ok(whitest(out, 0.75, 0, 260, 640, 80) < 100, 'the cue ends at 0.5 s')
  })

  test('several scenes render in parallel; one failure does not stop the others', async (t) => {
    const code = (id) => baseScene(id, { durationSec: 0.5, visual: { type: 'code', description: 'code', code: { language: 'js', content: `// ${id}\n` } } })
    const broken = baseScene('scene-003', { durationSec: 0.5, visual: { type: 'screenshot', description: 's', capture: { url: 'https://example.com' } } })
    p = makeProject({
      project: smallProject(),
      scenes: [
        { id: 'scene-001', dir: 'scenes/001-a', scene: code('scene-001') },
        { id: 'scene-002', dir: 'scenes/002-b', scene: code('scene-002') },
        { id: 'scene-003', dir: 'scenes/003-c', scene: broken },
      ],
    })
    cpSync(templateSrc, p.path('src'), { recursive: true })
    assert.match((await p.runAsync('render-scene.mjs', ['scene-001', 'scene-009'])).stderr, /scene-009/, 'unknown ids fail up front')
    const r = await p.runAsync('render-scene.mjs', ['scene-001', 'scene-002', 'scene-003', '--jobs', '2'])
    if (/no usable browser/.test(r.stderr)) return t.skip('no browser available')
    assert.equal(r.code, 1)
    assert.match(r.stdout, /rendering 3 scenes, 2 at a time/)
    assert.match(r.stdout, /rendered: scene-001, scene-002; failed: scene-003/)
    assert.ok(existsSync(p.path('scenes/001-a/output/scene.mp4')))
    assert.ok(existsSync(p.path('scenes/002-b/output/scene.mp4')))
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
