// The Companion (`pnpm run companion`): origin and token checks, the action whitelist, running deterministic work on
// the project, change notifications, and the restricted `claude -p /video-sync` invocation.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import WebSocket from 'ws'
import { startCompanion } from '../../templates/product-video/scripts/lib/companion.mjs'
import { FAKE_TTS, fullProject, motionScene } from './helpers.mjs'

const SITE = 'https://example.test/index-url-director'
Object.assign(process.env, FAKE_TTS)

async function companionFor(t, project) {
  const c = await startCompanion({ projectDir: project.root, port: 0, site: SITE, log: () => {} })
  t.after(() => c.close())
  return c
}

/** Opens a socket; resolves { ws, messages, next(type) } or rejects with the handshake error. */
function open(port, origin, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin })
    const messages = []
    const waiters = []
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw))
      messages.push(msg)
      for (const w of [...waiters]) if (w.match(msg)) waiters.splice(waiters.indexOf(w), 1) && w.resolve(msg)
    })
    const next = (match) =>
      new Promise((res) => {
        const found = messages.find(match)
        if (found) return res(found)
        waiters.push({ match, resolve: res })
      })
    ws.on('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)))
    ws.on('error', reject)
    ws.on('open', () => {
      if (token !== undefined) ws.send(JSON.stringify({ type: 'hello', token }))
      resolve({ ws, messages, next })
    })
  })
}

const closed = (ws) => new Promise((resolve) => ws.on('close', (code) => resolve(code)))

test('foreign origins are refused during the handshake; localhost dev servers are allowed', async (t) => {
  const p = fullProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene: motionScene('scene-001') }] })
  t.after(p.cleanup)
  const c = await companionFor(t, p)
  await assert.rejects(open(c.port, 'https://evil.test', c.token), /HTTP 403/)
  await assert.rejects(open(c.port, undefined, c.token), /HTTP 403/)
  const ok = await open(c.port, 'http://localhost:5173', c.token)
  assert.equal((await ok.next((m) => m.type === 'ready')).type, 'ready')
  ok.ws.close()
})

test('a wrong token closes the connection before any action runs', async (t) => {
  const p = fullProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene: motionScene('scene-001') }] })
  t.after(p.cleanup)
  const c = await companionFor(t, p)
  const { ws } = await open(c.port, 'https://example.test', 'not-the-token')
  assert.equal(await closed(ws), 4001)
  assert.match(c.pairUrl, new RegExp(`^${SITE}/#pair=${c.port}:[A-Za-z0-9_-]+$`))
})

test('only whitelisted actions run; rebuild produces the scene and change events follow', async (t) => {
  const p = fullProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene: motionScene('scene-001') }] })
  t.after(p.cleanup)
  const c = await companionFor(t, p)
  const s = await open(c.port, 'https://example.test', c.token)
  t.after(() => s.ws.close())
  await s.next((m) => m.type === 'ready')
  const run = (id, action, scene) => {
    s.ws.send(JSON.stringify({ type: 'run', id, action, scene }))
    return s.next((m) => m.id === id && m.type === 'result')
  }

  assert.match((await run('1', 'shell', undefined)).output, /not allowed/)
  assert.match((await run('2', 'rebuild', '../../etc')).output, /scene id is required/)
  const status = await run('3', 'status')
  assert.equal(status.ok, true)
  assert.equal(status.output.report.scenes[0].status, 'draft')

  const rebuilt = await run('4', 'rebuild', 'scene-001')
  assert.equal(rebuilt.ok, true, JSON.stringify(rebuilt.output))
  assert.ok(s.messages.some((m) => m.id === '4' && m.type === 'log'), 'progress lines are streamed')
  const scene = JSON.parse(readFileSync(p.path('scenes/001-hook/scene.json'), 'utf8'))
  assert.equal(scene.status, 'rendered')
  assert.equal(scene.updatedBy, 'companion')
  await s.next((m) => m.type === 'changed')

  const assembled = await run('5', 'assemble')
  assert.equal(assembled.ok, true, assembled.output)
  assert.equal(JSON.parse(readFileSync(p.path('video.project.json'), 'utf8')).status, 'completed')
})

test('sync runs claude -p /video-sync limited to pnpm scripts and file tools', async (t) => {
  const p = fullProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene: motionScene('scene-001') }] })
  t.after(p.cleanup)
  const fake = p.path('fake-claude.mjs')
  writeFileSync(fake, `import { writeFileSync } from 'node:fs'\nwriteFileSync('claude-args.json', JSON.stringify(process.argv.slice(2)))\nconsole.log('synced')\n`)
  process.env.VIDEO_AGENT_CLAUDE = fake
  t.after(() => delete process.env.VIDEO_AGENT_CLAUDE)
  const c = await companionFor(t, p)
  const s = await open(c.port, 'https://example.test', c.token)
  t.after(() => s.ws.close())
  await s.next((m) => m.type === 'ready')
  s.ws.send(JSON.stringify({ type: 'run', id: 's', action: 'sync' }))
  const result = await s.next((m) => m.id === 's' && m.type === 'result')
  assert.equal(result.ok, true)
  const args = JSON.parse(readFileSync(join(p.root, 'claude-args.json'), 'utf8'))
  assert.deepEqual(args.slice(0, 2), ['-p', '/video-sync'])
  assert.ok(args.includes('Bash(pnpm run:*)'))
  assert.ok(!args.some((a) => /dangerously|bypass/i.test(a)), 'never skips permission checks')
})
