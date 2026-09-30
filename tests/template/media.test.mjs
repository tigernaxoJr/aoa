// tts.mjs and capture.mjs against temp projects. TTS uses the offline fake provider; capture
// serves a page from a child process and skips when no browser is available.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { afterEach, test } from 'node:test'
import { baseProject, baseScene, makeProject } from './helpers.mjs'

const require = createRequire(import.meta.url)
const ffprobe = require('ffprobe-static').path
const duration = (file) =>
  Number(spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout)

const FAKE = { VIDEO_AGENT_FAKE_TTS: '1' }
let p
afterEach(() => p?.cleanup())

test('tts writes narration and captions, pauses add silence', () => {
  p = makeProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', script: '一二三四。\n<!-- pause 1 -->\n五六七八。\n' }] })
  const r = p.run('tts.mjs', ['scene-001'], FAKE)
  assert.equal(r.code, 0, r.stderr)
  const audio = p.path('scenes/001-hook/assets/narration.mp3')
  // fake TTS: 0.25 s per character → 1.25 s + 1 s pause + 1.25 s
  assert.ok(Math.abs(duration(audio) - 3.5) < 0.15, `duration ${duration(audio)}`)
  const cues = p.read('scenes/001-hook/assets/captions.json')
  assert.equal(cues.length, 2)
  assert.ok(cues[1].start >= cues[0].end + 0.9, JSON.stringify(cues))
})

test('online provider without consent is blocked by the gate', () => {
  const project = baseProject()
  project.project.tts.consent = { onlineTts: false }
  p = makeProject({ project, scenes: [{ id: 'scene-001', dir: 'scenes/001-hook' }] })
  const r = p.run('tts.mjs', ['scene-001'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /gate onlineTtsConsent/)
  assert.equal(existsSync(p.path('scenes/001-hook/assets/narration.mp3')), false)
})

test('manual narration requires the recording and estimates captions', () => {
  const scene = baseScene('scene-001', { narration: { scriptFile: 'script.md', provider: 'manual' } })
  p = makeProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene, script: '第一句。\n第二句比較長一點。\n' }] })
  let r = p.run('tts.mjs', ['scene-001'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /record scenes\/001-hook\/assets\/narration.mp3 first/)

  // Produce a "recording" with the fake provider, then switch back to manual.
  assert.equal(p.run('tts.mjs', ['scene-001'], FAKE).code, 0)
  r = p.run('tts.mjs', ['scene-001'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /manual narration/)
  assert.equal(p.read('scenes/001-hook/assets/captions.json').length, 2)
})

test('empty script produces no audio and empty captions', () => {
  const scene = baseScene('scene-001', { durationSec: 3 })
  p = makeProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene, script: '' }] })
  const r = p.run('tts.mjs', ['scene-001'], FAKE)
  assert.equal(r.code, 0, r.stderr)
  assert.deepEqual(p.read('scenes/001-hook/assets/captions.json'), [])
  assert.equal(existsSync(p.path('scenes/001-hook/assets/narration.mp3')), false)
})

const PAGE = `<html><body style="margin:0;font:40px sans-serif"><h1>Hello</h1><div style="height:1500px"></div>
<section id="features"><div class="card" style="width:300px;height:200px;background:#eee">Card</div></section>
<div style="height:800px"></div></body></html>`

async function withServer(fn) {
  const code = `const s=require('http').createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(${JSON.stringify(PAGE)})}).listen(0,'127.0.0.1',()=>console.log(s.address().port))`
  const server = spawn(process.execPath, ['-e', code])
  try {
    const port = await new Promise((resolve) => server.stdout.once('data', (d) => resolve(String(d).trim())))
    return await fn(`http://127.0.0.1:${port}/`)
  } finally {
    server.kill()
  }
}

test('capture records a web-capture scene at the project format', async (t) => {
  await withServer(async (url) => {
    const scene = baseScene('scene-001', {
      visual: {
        type: 'web-capture',
        description: 'scroll to the card',
        capture: { url, actions: [{ do: 'scroll', selector: '#features' }, { do: 'highlight', selector: '#features .card' }] },
      },
    })
    p = makeProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene }] })
    const r = await p.runAsync('capture.mjs', ['scene-001'])
    if (/no usable browser/.test(r.stderr)) return t.skip('no browser available')
    assert.equal(r.code, 0, r.stderr)
    const out = p.path('scenes/001-hook/assets/capture.mp4')
    const info = spawnSync(ffprobe, ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'csv=p=0', out], { encoding: 'utf8' }).stdout.trim()
    assert.equal(info, '1920,1080,30/1')
    assert.ok(duration(out) > 1)
  })
})

test('capture --url saves screenshots and page text for analyze', async (t) => {
  await withServer(async (url) => {
    p = makeProject()
    const r = await p.runAsync('capture.mjs', ['--url', url, '--out', 'brief/screens'])
    if (/no usable browser/.test(r.stderr)) return t.skip('no browser available')
    assert.equal(r.code, 0, r.stderr)
    for (const f of ['127-0-0-1-top.png', '127-0-0-1-full.png', '127-0-0-1.txt']) {
      assert.ok(existsSync(p.path('brief/screens', f)), f)
    }
  })
})

test('capture --out cannot leave the project', async () => {
  p = makeProject()
  const r = await p.runAsync('capture.mjs', ['--url', 'https://example.com', '--out', '../elsewhere'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /--out must be inside the project/)
})
