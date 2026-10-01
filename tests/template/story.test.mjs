// Story projects (project.kind "story"): character voices, shared art in motion.uses, next steps.
import assert from 'node:assert/strict'
import { cpSync, existsSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import { suggestNext } from '../../templates/product-video/scripts/lib/core.mjs'
import { computeInputHash } from '../../templates/product-video/scripts/lib/hash.mjs'
import { blinking, cueAt, mouthOpen, poseTransform, speakerAt, tween } from '../../templates/product-video/src/lib/rig.js'
import { baseProject, baseScene, makeProject } from './helpers.mjs'

let p
afterEach(() => p?.cleanup())

const FAKE = { VIDEO_AGENT_FAKE_TTS: '1' }

function storyProject(overrides = {}) {
  const project = baseProject()
  Object.assign(project.project, {
    name: '小狐狸找月亮',
    kind: 'story',
    sources: { story: '小狐狸以為月亮掉進了池塘。' },
    cast: [
      { id: 'fox', name: '小狐狸', voice: 'zh-TW-HsiaoYuNeural', art: '@/assets/cast/fox/' },
      { id: 'owl', name: '貓頭鷹', voice: 'zh-TW-YunJheNeural' },
    ],
    ...overrides,
  })
  return project
}

const storyScene = (id, extra = {}) =>
  baseScene(id, {
    purpose: 'conflict',
    visual: { type: 'motion-graphic', description: '池塘邊', motion: { file: 'assets/motion.js', uses: ['@/assets/cast/fox/'] } },
    ...extra,
  })

function makeStory(script = '夜深了。\n【小狐狸】月亮掉進水裡了！\n【貓頭鷹】那只是倒影。\n') {
  p = makeProject({ project: storyProject(), scenes: [{ id: 'scene-001', dir: 'scenes/001-pond', scene: storyScene('scene-001'), script }] })
  p.write('scenes/001-pond/assets/motion.js', 'export default async () => () => {}\n')
  p.write('assets/cast/fox/body.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"><circle cx="5" cy="5" r="4" fill="#f97316"/></svg>\n')
  return p
}

test('tts voices each character and records who speaks in the captions', () => {
  makeStory()
  const r = p.run('tts.mjs', ['scene-001'], FAKE)
  assert.equal(r.code, 0, r.stderr)
  const cues = p.read('scenes/001-pond/assets/captions.json')
  assert.deepEqual(
    cues.map((c) => [c.text, c.speaker ?? null]),
    [
      ['夜深了。', null],
      ['月亮掉進水裡了！', '小狐狸'],
      ['那只是倒影。', '貓頭鷹'],
    ],
  )
  assert.ok(cues.every((c, i) => i === 0 || c.start >= cues[i - 1].end - 0.001))
})

test('a character missing from the cast fails validation and tts', () => {
  makeStory('【大野狼】我來了。\n')
  const v = p.run('validate.mjs', [])
  assert.notEqual(v.code, 0)
  assert.match(v.stdout + v.stderr, /【大野狼】 is not in project\.cast/)
  assert.notEqual(p.run('tts.mjs', ['scene-001'], FAKE).code, 0)
})

test('a character voice still needs online TTS consent', () => {
  makeStory()
  const project = p.read('video.project.json')
  project.project.tts = { provider: 'piper', voice: 'zh_CN-huayan-medium' }
  project.project.cast[0].provider = 'edge-tts'
  p.write('video.project.json', project)
  const r = p.run('tts.mjs', ['scene-001'])
  assert.notEqual(r.code, 0)
  assert.match(r.stderr, /gate onlineTtsConsent/)
})

test('tts --sample writes a voice preview for a cast member', () => {
  makeStory()
  const r = p.run('tts.mjs', ['--sample', 'fox'], FAKE)
  assert.equal(r.code, 0, r.stderr)
  assert.ok(existsSync(p.path('brief/voices/fox.mp3')))
  assert.notEqual(p.run('tts.mjs', ['--sample', 'nobody'], FAKE).code, 0)
})

test('changing shared art in motion.uses or a cast voice changes the input hash', () => {
  makeStory()
  const ref = { id: 'scene-001', dir: 'scenes/001-pond' }
  const hash = () => computeInputHash(p.root, p.read('video.project.json'), ref, p.read('scenes/001-pond/scene.json'))
  const before = hash()
  p.write('assets/cast/fox/body.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"/>\n')
  const afterArt = hash()
  assert.notEqual(afterArt, before)
  p.write('assets/cast/owl/body.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>\n')
  assert.equal(hash(), afterArt, 'art the scene does not use is not hashed')
  const project = p.read('video.project.json')
  project.project.cast.push({ id: 'bear', name: '熊', voice: 'zh-TW-YunJheNeural' })
  p.write('video.project.json', project)
  assert.equal(hash(), afterArt, 'a character who does not speak in the scene does not count')
  project.project.cast[1].voice = 'zh-TW-HsiaoChenNeural'
  p.write('video.project.json', project)
  assert.notEqual(hash(), afterArt, 'the owl speaks here, so its voice does')
})

test('motion.uses must exist', () => {
  makeStory()
  const scene = p.read('scenes/001-pond/scene.json')
  scene.visual.motion.uses.push('@/assets/sets/pond.svg')
  p.write('scenes/001-pond/scene.json', scene)
  const v = p.run('validate.mjs', [])
  assert.notEqual(v.code, 0)
  assert.match(v.stdout + v.stderr, /motion\.uses @\/assets\/sets\/pond\.svg not found/)
})

test('suggestNext walks a story project through story, design and storyboard', () => {
  const at = (status) => suggestNext({ status, project: { kind: 'story' } }, []).command
  assert.equal(at('initialized'), '/video-story')
  assert.equal(at('analyzed'), '/video-design')
  assert.equal(at('designed'), '/video-storyboard')
  assert.equal(suggestNext({ status: 'analyzed', project: {} }, []).command, '/video-storyboard')
  assert.equal(suggestNext({ status: 'initialized', project: { kind: 'product' } }, []).command, '/video-analyze')
})

test('rig helpers are pure functions of t', () => {
  const cues = [
    { start: 0, end: 1, text: '夜深了。' },
    { start: 1, end: 2, text: '月亮！', speaker: '小狐狸' },
  ]
  assert.equal(speakerAt(cues, 0.5), null)
  assert.equal(speakerAt(cues, 1.5), '小狐狸')
  assert.equal(cueAt(cues, 2.5), null)
  assert.equal(mouthOpen(0.01, false), false)
  assert.notEqual(mouthOpen(0.01, true), mouthOpen(0.08, true))
  const blinks = Array.from({ length: 300 }, (_, i) => blinking(i / 30, 7))
  assert.deepEqual(blinks, Array.from({ length: 300 }, (_, i) => blinking(i / 30, 7)), 'same seed, same blinks')
  assert.ok(blinks.some(Boolean) && blinks.filter(Boolean).length < 20)
  assert.equal(tween(-1, 0, 2, 10, 20), 10)
  assert.equal(tween(5, 0, 2, 10, 20), 20)
  assert.equal(poseTransform({ rotate: 15 }, { x: 4, y: 6 }), 'rotate(15 4 6)')
  assert.equal(poseTransform(), '')
})

test('a story scene renders with a motion module that sees the cues and the shared art', async (t) => {
  makeStory()
  const project = p.read('video.project.json')
  project.project.format = { aspectRatio: '16:9', width: 640, height: 360, fps: 24 }
  p.write('video.project.json', project)
  cpSync(new URL('../../templates/product-video/src', import.meta.url), p.path('src'), { recursive: true })
  p.write(
    'assets/cast/fox/fox.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300" width="200" height="300">
  <g id="body"><ellipse cx="100" cy="210" rx="60" ry="80" fill="#f97316"/></g>
  <g id="arm-r" data-pivot="140 180"><rect x="140" y="175" width="50" height="14" rx="7" fill="#ea580c"/></g>
  <g id="head" data-pivot="100 130">
    <circle cx="100" cy="90" r="55" fill="#fb923c"/>
    <g id="eye-open"><circle cx="80" cy="85" r="6"/><circle cx="120" cy="85" r="6"/></g>
    <g id="eye-closed"><path d="M74 85h12M114 85h12" stroke="#000" stroke-width="3"/></g>
    <g id="mouth-closed"><path d="M90 115h20" stroke="#000" stroke-width="3"/></g>
    <g id="mouth-open"><ellipse cx="100" cy="117" rx="10" ry="7"/></g>
  </g>
</svg>
`,
  )
  const scene = p.read('scenes/001-pond/scene.json')
  scene.visual.motion.uses = ['@/assets/cast/fox/']
  p.write('scenes/001-pond/scene.json', scene)
  p.write(
    'scenes/001-pond/assets/motion.js',
    `import { blinking, loadSvg, mouthOpen, rig, speakerAt, tween, wave } from '../../../src/lib/rig.js'

export default async function setup({ root, width, height, cues, cast }) {
  if (!cues.some((c) => c.speaker === '小狐狸')) throw new Error('cues without speakers')
  if (!cast.some((m) => m.id === 'fox')) throw new Error('no cast')
  const svg = await loadSvg(new URL('../../../assets/cast/fox/fox.svg', import.meta.url))
  svg.setAttribute('height', String(height * 0.6))
  svg.style.position = 'absolute'
  svg.style.bottom = '0'
  root.append(svg)
  const fox = rig(svg)
  return (t) => {
    const talking = speakerAt(cues, t) === '小狐狸'
    svg.style.left = tween(t, 0, 1, 0, width * 0.4) + 'px'
    fox.pose('head', { rotate: wave(t, 4, 0.6) })
    fox.pose('arm-r', { rotate: talking ? -30 : 0 })
    fox.only(['mouth-open', 'mouth-closed'], mouthOpen(t, talking) ? 'mouth-open' : 'mouth-closed')
    fox.only(['eye-open', 'eye-closed'], blinking(t, 1) ? 'eye-closed' : 'eye-open')
  }
}
`,
  )
  assert.equal(p.run('tts.mjs', ['scene-001'], FAKE).code, 0)
  const r = await p.runAsync('render-scene.mjs', ['scene-001'])
  if (/no usable browser/.test(r.stderr)) return t.skip('no browser available')
  assert.equal(r.code, 0, r.stderr)
  assert.ok(existsSync(p.path('scenes/001-pond/output/scene.mp4')))
})
