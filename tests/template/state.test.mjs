import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { afterEach, test } from 'node:test'
import { makeProject, twoScenes } from './helpers.mjs'

const ffmpeg = createRequire(import.meta.url)('ffmpeg-static')

let p
afterEach(() => p?.cleanup())

/** A tiny real mp4, since --rendered probes the output. */
function fakeRender(file) {
  mkdirSync(dirname(file), { recursive: true })
  const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=s=64x36:d=0.2', '-pix_fmt', 'yuv420p', file])
  assert.equal(r.status, 0, String(r.stderr))
}

/** Walks a scene through the happy path up to `rendered`, creating a small output file. */
function renderScene(project, id, dir) {
  for (const status of ['assets_ready', 'rendering']) {
    const r = project.run('state.mjs', [id, '--status', status])
    assert.equal(r.code, 0, r.stderr)
  }
  fakeRender(project.path(dir, 'output', 'scene.mp4'))
  const r = project.run('state.mjs', [id, '--rendered'])
  assert.equal(r.code, 0, r.stderr)
  return r
}

test('legal transition is written with updatedAt/updatedBy', () => {
  p = makeProject({ scenes: twoScenes() })
  const r = p.run('state.mjs', ['scene-001', '--status', 'assets_ready', '--by', 'user'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /scene-001: draft → assets_ready/)
  const scene = p.read('scenes/001-hook/scene.json')
  assert.equal(scene.status, 'assets_ready')
  assert.equal(scene.updatedBy, 'user')
  assert.ok(Date.parse(scene.updatedAt))
})

test('illegal transition is rejected unless --force', () => {
  p = makeProject({ scenes: twoScenes() })
  let r = p.run('state.mjs', ['scene-001', '--status', 'approved'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /draft → approved is not allowed/)
  assert.equal(p.read('scenes/001-hook/scene.json').status, 'draft')

  r = p.run('state.mjs', ['scene-001', '--status', 'rendering', '--force'])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(p.read('scenes/001-hook/scene.json').status, 'rendering')
})

test('--force skips the transition check but never the schema', () => {
  p = makeProject({ scenes: twoScenes() })
  const r = p.run('state.mjs', ['scene-001', '--status', 'stale', '--force'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /must have required property 'render'/)
  assert.equal(p.read('scenes/001-hook/scene.json').status, 'draft')
})

test('--rendered requires the output file', () => {
  p = makeProject({ scenes: twoScenes() })
  p.run('state.mjs', ['scene-001', '--status', 'assets_ready'])
  p.run('state.mjs', ['scene-001', '--status', 'rendering'])
  const r = p.run('state.mjs', ['scene-001', '--rendered'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /does not exist; render the scene first/)
})

test('rendering all scenes derives project status', () => {
  p = makeProject({ scenes: twoScenes() })
  renderScene(p, 'scene-001', 'scenes/001-hook')
  assert.equal(p.read('video.project.json').status, 'producing')

  const r = renderScene(p, 'scene-002', 'scenes/002-cta')
  assert.match(r.stdout, /project: producing → ready_to_assemble/)
  const scene = p.read('scenes/002-cta/scene.json')
  assert.match(scene.render.inputHash, /^sha256:[0-9a-f]{64}$/)
  assert.equal(scene.render.renderer, 'remotion')
  assert.equal(scene.attempts, 0)
})

test('editing the script after render marks the scene outdated', () => {
  p = makeProject({ scenes: twoScenes() })
  renderScene(p, 'scene-001', 'scenes/001-hook')
  let r = p.run('validate.mjs', ['--report', '--json'])
  assert.equal(JSON.parse(r.stdout).report.scenes[0].outdated, false)

  writeFileSync(p.path('scenes/001-hook/script.md'), '改過的旁白。\n')
  r = p.run('validate.mjs', ['--report', '--json'])
  const out = JSON.parse(r.stdout)
  assert.equal(out.ok, true)
  assert.equal(out.report.scenes[0].outdated, true)
  assert.equal(out.report.next.command, '/video-sync')
  assert.ok(out.warnings.some((w) => /inputs changed since last render/.test(w)))
})

test('locking or approving a scene does not make it outdated', () => {
  p = makeProject({ scenes: twoScenes() })
  renderScene(p, 'scene-001', 'scenes/001-hook')
  assert.equal(p.run('state.mjs', ['scene-001', '--status', 'approved']).code, 0)
  const patch = JSON.stringify([{ op: 'replace', path: '/locked', value: true }])
  assert.equal(p.run('state.mjs', ['scene-001', '--patch', patch]).code, 0)
  const out = JSON.parse(p.run('validate.mjs', ['--report', '--json']).stdout)
  assert.equal(out.report.scenes[0].outdated, false)
  assert.equal(out.report.scenes[0].locked, true)
})

test('--failed records the error and counts attempts; recovery clears it', () => {
  p = makeProject({ scenes: twoScenes() })
  let r = p.run('state.mjs', ['scene-001', '--failed', 'tts', 'edge-tts timeout', '--hint', 'retry later'])
  assert.equal(r.code, 0, r.stderr)
  p.run('state.mjs', ['scene-001', '--failed', 'tts', 'edge-tts timeout again'])
  let scene = p.read('scenes/001-hook/scene.json')
  assert.equal(scene.status, 'failed')
  assert.equal(scene.attempts, 2)
  assert.equal(scene.error.step, 'tts')
  assert.equal(scene.error.message, 'edge-tts timeout again')

  r = p.run('state.mjs', ['scene-001', '--status', 'assets_ready'])
  assert.equal(r.code, 0, r.stderr)
  scene = p.read('scenes/001-hook/scene.json')
  assert.equal(scene.error, null)
  assert.equal(scene.attempts, 2)
})

test('patch file can set a required nullable field and keeps x- fields', () => {
  p = makeProject({ scenes: twoScenes() })
  p.write('.tmp/set.json', [
    { op: 'replace', path: '/durationSec', value: 6 },
    { op: 'add', path: '/x-note', value: 'from user' },
  ])
  assert.equal(p.run('state.mjs', ['scene-001', '--patch-file', '.tmp/set.json']).code, 0)
  p.write('.tmp/unset.json', [{ op: 'replace', path: '/durationSec', value: null }])
  const r = p.run('state.mjs', ['scene-001', '--patch-file', '.tmp/unset.json'])
  assert.equal(r.code, 0, r.stderr)
  const scene = p.read('scenes/001-hook/scene.json')
  assert.equal(scene.durationSec, null)
  assert.equal(scene['x-note'], 'from user')
})

test('a patch that breaks the schema is rejected and nothing is written', () => {
  p = makeProject({ scenes: twoScenes() })
  const before = p.read('scenes/001-hook/scene.json')
  const patch = JSON.stringify([{ op: 'replace', path: '/purpose', value: 'nonsense' }])
  const r = p.run('state.mjs', ['scene-001', '--patch', patch])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /validation failed/)
  assert.deepEqual(p.read('scenes/001-hook/scene.json'), before)
})

test('a patch changing status is checked against workflow transitions', () => {
  p = makeProject({ scenes: twoScenes() })
  const patch = JSON.stringify([{ op: 'replace', path: '/status', value: 'rendered' }])
  const r = p.run('state.mjs', ['scene-001', '--patch', patch])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /not allowed by workflow.json/)
})

test('project scenes can be registered with a patch', () => {
  p = makeProject({ scenes: twoScenes() })
  p.write('scenes/003-extra/scene.json', {
    id: 'scene-003', title: 'Extra', purpose: 'benefit', narration: { scriptFile: 'script.md' },
    visual: { type: 'motion-graphic', description: 'x' }, durationSec: null, status: 'draft', locked: false,
  })
  p.write('scenes/003-extra/script.md', '多一段。\n')
  const patch = JSON.stringify([{ op: 'add', path: '/scenes/1', value: { id: 'scene-003', dir: 'scenes/003-extra' } }])
  const r = p.run('state.mjs', ['project', '--patch', patch])
  assert.equal(r.code, 0, r.stderr)
  assert.deepEqual(p.read('video.project.json').scenes.map((s) => s.id), ['scene-001', 'scene-003', 'scene-002'])
})

test('a fresh lock blocks writers; a stale lock is taken over', () => {
  p = makeProject({ scenes: twoScenes() })
  p.write('.video-agent.lock', JSON.stringify({ writer: 'user', pid: 1 }))
  let r = p.run('state.mjs', ['scene-001', '--status', 'assets_ready'], { VIDEO_AGENT_LOCK_WAIT_MS: '300' })
  assert.equal(r.code, 1)
  assert.match(r.stderr, /project is locked/)

  const old = new Date(Date.now() - 60_000)
  utimesSync(p.path('.video-agent.lock'), old, old)
  r = p.run('state.mjs', ['scene-001', '--status', 'assets_ready'], { VIDEO_AGENT_LOCK_WAIT_MS: '300' })
  assert.equal(r.code, 0, r.stderr)
})

test('unknown scene and bad usage give clear errors', () => {
  p = makeProject({ scenes: twoScenes() })
  assert.match(p.run('state.mjs', ['scene-404', '--status', 'draft']).stderr, /scene-404 is not listed/)
  assert.match(p.run('state.mjs', ['scene-001']).stderr, /specify exactly one/)
  assert.match(p.run('state.mjs', ['scene-001', '--failed', 'tts']).stderr, /expects 2 value/)
})
