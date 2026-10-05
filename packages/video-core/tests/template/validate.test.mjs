import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { baseProject, baseScene, makeProject, twoScenes } from './helpers.mjs'

let p
afterEach(() => p?.cleanup())

test('valid project passes', () => {
  p = makeProject({ scenes: twoScenes() })
  const r = p.run('validate.mjs')
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /ok/)
})

test('template placeholder id is rejected', () => {
  const project = baseProject()
  project.project.id = '00000000-0000-0000-0000-000000000000'
  p = makeProject({ project, scenes: twoScenes() })
  const r = p.run('validate.mjs')
  assert.equal(r.code, 1)
  assert.match(r.stderr, /template placeholder/)
})

test('format must match aspect ratio', () => {
  const project = baseProject()
  project.project.format = { aspectRatio: '9:16', width: 1920, height: 1080, fps: 30 }
  p = makeProject({ project, scenes: twoScenes() })
  const r = p.run('validate.mjs')
  assert.equal(r.code, 1)
  assert.match(r.stderr, /does not match aspectRatio/)
})

test('scene id must match its project entry', () => {
  p = makeProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene: baseScene('scene-009') }] })
  const r = p.run('validate.mjs')
  assert.equal(r.code, 1)
  assert.match(r.stderr, /does not match video.project.json entry scene-001/)
})

test('missing scene.json and duplicate ids are reported', () => {
  p = makeProject({ scenes: twoScenes() })
  const project = p.read('video.project.json')
  project.scenes.push({ id: 'scene-001', dir: 'scenes/003-extra' })
  p.write('video.project.json', project)
  const r = p.run('validate.mjs')
  assert.equal(r.code, 1)
  assert.match(r.stderr, /duplicate scene id scene-001/)
  assert.match(r.stderr, /scenes\/003-extra\/scene.json: missing/)
})

test('empty narration requires durationSec', () => {
  p = makeProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', script: '<!-- pause 1 -->\n\n' }] })
  let r = p.run('validate.mjs')
  assert.equal(r.code, 1)
  assert.match(r.stderr, /durationSec must be set/)

  p.write('scenes/001-hook/scene.json', baseScene('scene-001', { durationSec: 3 }))
  r = p.run('validate.mjs')
  assert.equal(r.code, 0, r.stderr)
})

test('unknown fields are rejected, x- fields are allowed', () => {
  p = makeProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene: baseScene('scene-001', { 'x-note': 'keep', colour: 'red' }) }] })
  const r = p.run('validate.mjs')
  assert.equal(r.code, 1)
  assert.match(r.stderr, /unknown field "colour"/)
  assert.doesNotMatch(r.stderr, /x-note/)
})

test('status report suggests the next step as JSON', () => {
  p = makeProject({ scenes: twoScenes() })
  const r = p.run('validate.mjs', ['--report', '--json'])
  assert.equal(r.code, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.equal(out.ok, true)
  assert.equal(out.report.scenes.length, 2)
  assert.equal(out.report.next.command, '/video-scene all')
})

test('status report before storyboard suggests analyze', () => {
  p = makeProject({ project: baseProject({ status: 'initialized' }) })
  const r = p.run('validate.mjs', ['--report'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /next: \/video-analyze/)
})
