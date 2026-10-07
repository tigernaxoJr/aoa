// tts.mjs and capture.mjs against temp projects. TTS uses the offline fake provider; capture
// serves a page from a child process and skips when no browser is available.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { locate } from '../../template/scripts/lib/media.mjs'
import { baseProject, baseScene, makeProject } from './helpers.mjs'

const require = createRequire(import.meta.url)
const ffprobe = require('ffprobe-static').path
const ffmpegBin = require('ffmpeg-static')
const duration = (file) =>
  Number(spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout)

const FAKE = { VIDEO_AGENT_FAKE_TTS: '1' }
let p
afterEach(() => p?.cleanup())

test('ffprobe is the bundled copy even when the system has one, so durations match across machines', () => {
  assert.equal(locate('ffprobe').path, ffprobe)
})

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

test('cosyvoice with remote endpoint requires online consent', () => {
  const project = baseProject()
  project.project.tts.provider = 'cosyvoice3'
  project.project.tts.consent = { onlineTts: false }
  p = makeProject({ project, scenes: [{ id: 'scene-001', dir: 'scenes/001-hook' }] })
  const r = p.run('tts.mjs', ['scene-001'], { COSYVOICE_URL: 'https://api.example.com/cosyvoice' })
  assert.equal(r.code, 1)
  assert.match(r.stderr, /gate onlineTtsConsent/)
})

test('cosyvoice with local endpoint does not require online consent and hints setup', () => {
  const project = baseProject()
  project.project.tts.provider = 'cosyvoice3'
  project.project.tts.consent = { onlineTts: false }
  p = makeProject({ project, scenes: [{ id: 'scene-001', dir: 'scenes/001-hook' }] })
  const r = p.run('tts.mjs', ['scene-001'], { COSYVOICE_URL: 'http://127.0.0.1:50000/api/tts' })
  assert.equal(r.code, 1)
  assert.match(r.stderr, /CosyVoice 3.*(service unavailable|model weights not ready)/)
  assert.match(r.stderr, /pnpm run cosyvoice:setup/)
})

test('cosyvoice sends clone prompts as absolute paths, since one local server serves every project', async () => {
  const project = baseProject()
  project.project.tts.provider = 'cosyvoice3'
  project.project.tts.voice = '@/assets/voices/star.wav <用英語說>'
  p = makeProject({ project, scenes: [{ id: 'scene-001', dir: 'scenes/001-hook' }] })
  let payload
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c)).on('end', () => {
      payload = JSON.parse(body)
      res.writeHead(503).end('not loaded')
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const r = await p.runAsync('tts.mjs', ['scene-001'], { COSYVOICE_URL: `http://127.0.0.1:${server.address().port}/api/tts` })
    assert.equal(r.code, 1)
    assert.equal(payload.speaker, join(p.root, 'assets', 'voices', 'star.wav'))
    assert.equal(payload.instruct, '用英語說')
  } finally {
    server.close()
  }
})

test('cosyvoice listVoices lists available speakers and custom voice prompt option', () => {
  const project = baseProject()
  project.project.tts.provider = 'cosyvoice3'
  p = makeProject({ project, scenes: [{ id: 'scene-001', dir: 'scenes/001-hook' }] })
  const r = p.run('tts.mjs', ['--list-voices'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /中文女/)
  assert.match(r.stdout, /聲音克隆/)
  assert.match(r.stdout, /Instruct Control/)
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
<section id="features"><div class="card" style="width:300px;height:200px;background:#eee">Card</div>
<button data-testid="start">Start free</button><a href="/pricing">Pricing</a></section>
<div style="height:800px"></div></body></html>`

async function withServer(fn) {
  const code = `const s=require('http').createServer((q,r)=>{setTimeout(()=>{r.writeHead(200,{'content-type':'text/html'});r.end(${JSON.stringify(PAGE)})},q.url.includes('slow')?2000:0)}).listen(0,'127.0.0.1',()=>console.log(s.address().port))`
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
        capture: {
          url,
          actions: [
            { do: 'scroll', selector: '#features' },
            { do: 'highlight', selector: '#features .card', ms: 300 },
            { do: 'highlight', selector: '#missing' },
            { do: 'highlight', selector: 'a:has-text("Pricing")', ms: 300 },
          ],
        },
      },
    })
    p = makeProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene }] })
    const r = await p.runAsync('capture.mjs', ['scene-001'])
    if (/no usable browser/.test(r.stderr)) return t.skip('no browser available')
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stderr, /warning: highlight #missing: no visible element; skipped/)
    const out = p.path('scenes/001-hook/assets/capture.mp4')
    const info = spawnSync(ffprobe, ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'csv=p=0', out], { encoding: 'utf8' }).stdout.trim()
    assert.equal(info, '1920,1080,30/1')
    assert.ok(duration(out) > 1)
  })
})

test('capture cuts page loads and cut actions out of the recording', async (t) => {
  await withServer(async (url) => {
    const scene = baseScene('scene-001', {
      visual: {
        type: 'web-capture',
        description: 'open a slow page',
        capture: { url, actions: [{ do: 'navigate', url: `${url}slow` }, { do: 'wait', ms: 1500, cut: true }, { do: 'wait', ms: 500 }] },
      },
    })
    p = makeProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene }] })
    const r = await p.runAsync('capture.mjs', ['scene-001'])
    if (/no usable browser/.test(r.stderr)) return t.skip('no browser available')
    assert.equal(r.code, 0, r.stderr)
    // Uncut it would be ≥ 2 s (server delay) + 2 s of waits + settle; kept: the 0.5 s wait and the final settle.
    const sec = duration(p.path('scenes/001-hook/assets/capture.mp4'))
    assert.ok(sec > 0.5 && sec < 1.5, `duration ${sec}`)
  })
})

test('script actions need consent, then change the page before the screenshot', async (t) => {
  await withServer(async (url) => {
    const capture = { url, actions: [{ do: 'script', file: 'demo-data.js' }] }
    const scene = baseScene('scene-001', { durationSec: 2, visual: { type: 'screenshot', description: 'demo data', capture } })
    p = makeProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene }] })
    p.write('scenes/001-hook/demo-data.js', "await Promise.resolve()\ndocument.body.style.background = 'rgb(255, 0, 0)'\n")
    let r = await p.runAsync('capture.mjs', ['scene-001'])
    assert.equal(r.code, 1)
    assert.match(r.stderr, /gate domEditConsent/)

    scene.visual.capture.domEditConsent = { granted: true, grantedAt: '2026-10-01T00:00:00Z' }
    p.write('scenes/001-hook/scene.json', scene)
    assert.equal(p.run('validate.mjs').code, 0)
    r = await p.runAsync('capture.mjs', ['scene-001'])
    if (/no usable browser/.test(r.stderr)) return t.skip('no browser available')
    assert.equal(r.code, 0, r.stderr)
    const rgb = spawnSync(ffmpegBin, ['-v', 'error', '-i', p.path('scenes/001-hook/assets/capture.png'), '-vf', 'format=rgb24,crop=1:1:1900:1060', '-f', 'rawvideo', '-'], { encoding: 'buffer' }).stdout
    assert.deepEqual([...rgb], [255, 0, 0])
  })
})

test('capture --url saves screenshots and page text for analyze', async (t) => {
  await withServer(async (url) => {
    p = makeProject()
    const r = await p.runAsync('capture.mjs', ['--url', url, '--out', 'brief/screens'])
    if (/no usable browser/.test(r.stderr)) return t.skip('no browser available')
    assert.equal(r.code, 0, r.stderr)
    for (const f of ['127-0-0-1-top.png', '127-0-0-1-full.png', '127-0-0-1.txt', '127-0-0-1.elements.txt']) {
      assert.ok(existsSync(p.path('brief/screens', f)), f)
    }
    const elements = readFileSync(p.path('brief/screens/127-0-0-1.elements.txt'), 'utf8')
    assert.match(elements, /^\[data-testid="start"\]\tStart free$/m)
    assert.match(elements, /^a:has-text\("Pricing"\)\tPricing$/m)
    assert.match(elements, /^h1:has-text\("Hello"\)\tHello$/m)
  })
})

test('capture --out cannot leave the project', async () => {
  p = makeProject()
  const r = await p.runAsync('capture.mjs', ['--url', 'https://example.com', '--out', '../elsewhere'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /--out must be inside the project/)
})
