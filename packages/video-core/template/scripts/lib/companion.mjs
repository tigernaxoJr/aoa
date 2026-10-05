// The local Companion (`pnpm run companion`, SPEC §2.1 mode B, §10.1). A WebSocket on 127.0.0.1 that
// the Web UI pairs with to push file changes and run whitelisted, deterministic actions. It keeps no
// state of its own: everything lives in the project files, so stopping it falls back to mode A.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { WebSocketServer } from 'ws'
import { PROJECT_FILE, findRoot } from './project.mjs'
import { assembleVideo, buildScene, runProcess, runScript, status } from './runner.mjs'

export const PORTS = [47831, 47840]
const BY = 'companion'
const HELLO_TIMEOUT_MS = 5000
const IGNORED = /(^|[\\/])(node_modules|\.tmp|\.git)([\\/]|$)/

/**
 * Actions the UI may request. Anything else is refused; there is no way to run arbitrary commands.
 * `target` is the id the action needs (a scene, or a cast member / narrator); `script` is the project
 * script it runs, so an action whose script the project lacks (the story template has no capture) is
 * not offered.
 */
export const ACTIONS = {
  status: {},
  validate: { script: 'validate' },
  tts: { target: 'scene', script: 'tts' },
  sample: { target: 'cast', script: 'tts' },
  capture: { target: 'scene', script: 'capture' },
  'render-scene': { target: 'scene', script: 'render-scene' },
  rebuild: { target: 'scene' },
  assemble: {},
  sync: {},
}

const TARGET = {
  scene: { field: 'scene', pattern: /^scene-[a-z0-9-]+$/, missing: 'a scene id is required' },
  cast: { field: 'cast', pattern: /^(narrator|[a-z][a-z0-9]*(-[a-z0-9]+)*)$/, missing: 'a cast id (or narrator) is required' },
}

/** The actions this project can run: those whose script it has. */
const available = (root) =>
  Object.keys(ACTIONS).filter((a) => !ACTIONS[a].script || existsSync(join(root, 'scripts', `${ACTIONS[a].script}.mjs`)))

function loadToken(persist) {
  if (!persist) return randomBytes(24).toString('base64url')
  const dir = join(homedir(), '.video-agent')
  const file = join(dir, 'token')
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  mkdirSync(dir, { recursive: true })
  const token = randomBytes(24).toString('base64url')
  writeFileSync(file, token, { mode: 0o600 })
  return token
}

/** Origins allowed to connect: the site itself, plus local development servers. */
function originAllowed(origin, site) {
  if (!origin) return false
  if (origin === new URL(site).origin) return true
  try {
    const { protocol, hostname } = new URL(origin)
    return protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')
  } catch {
    return false
  }
}

const sameToken = (a, b) => {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Runs `claude -p "/video-sync"` in the project with only pnpm scripts and file tools allowed. */
function claudeSync(root, onLine) {
  const command = process.env.VIDEO_AGENT_CLAUDE || 'claude'
  const args = ['-p', '/video-sync', '--allowedTools', 'Bash(pnpm run:*)', 'Read', 'Edit', 'Write', 'Glob', 'Grep']
  // VIDEO_AGENT_CLAUDE may name a Node script (a stand-in used by tests, or a wrapper).
  if (/\.m?js$/.test(command)) return runProcess(process.execPath, [command, ...args], { cwd: root, onLine })
  return runProcess(command, args, { cwd: root, onLine })
}

export async function startCompanion({ projectDir = process.cwd(), port, persistToken = false, site, log = console.log } = {}) {
  const root = findRoot(projectDir)
  const token = loadToken(persistToken)
  const http = createServer((req, res) => res.writeHead(404).end())
  const wss = new WebSocketServer({
    server: http,
    verifyClient: ({ origin }, done) => done(originAllowed(origin, site), 403, 'origin not allowed'),
  })

  const clients = new Set()
  const broadcast = (msg) => {
    const data = JSON.stringify(msg)
    for (const ws of clients) ws.send(data)
  }

  // One job at a time: project writes are serialized here as well as by the lock file.
  let queue = Promise.resolve()
  const enqueue = (job) => (queue = queue.then(job, job))

  async function perform(action, id, onLine) {
    switch (action) {
      case 'status':
        return { ok: true, output: await status(root) }
      case 'validate':
      case 'tts':
      case 'capture':
      case 'render-scene': {
        const r = await runScript(root, action, id ? [id] : [], { onLine })
        return { ok: r.code === 0, output: `${r.stdout}${r.stderr}`.trim() }
      }
      case 'sample': {
        const r = await runScript(root, 'tts', ['--sample', id], { onLine })
        return { ok: r.code === 0, output: `${r.stdout}${r.stderr}`.trim() }
      }
      case 'rebuild': {
        const r = await buildScene(root, id, { by: BY, onLine })
        return { ok: r.ok, output: r.log }
      }
      case 'assemble':
        return assembleVideo(root, { by: BY, onLine })
      case 'sync': {
        const r = await claudeSync(root, onLine)
        return { ok: r.code === 0, output: `${r.stdout}${r.stderr}`.trim() || (r.code ? 'claude could not be started' : '') }
      }
    }
    return { ok: false, output: `unknown action ${action}` }
  }

  wss.on('connection', (ws) => {
    let paired = false
    const timer = setTimeout(() => !paired && ws.close(4001, 'pairing timeout'), HELLO_TIMEOUT_MS)
    ws.on('close', () => {
      clearTimeout(timer)
      clients.delete(ws)
    })
    ws.on('message', async (raw) => {
      let msg
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return ws.close(4000, 'bad message')
      }
      if (!paired) {
        if (msg.type !== 'hello' || !sameToken(msg.token, token)) return ws.close(4001, 'bad token')
        paired = true
        clearTimeout(timer)
        clients.add(ws)
        return ws.send(JSON.stringify({ type: 'ready', project: root, actions: available(root) }))
      }
      if (msg.type !== 'run') return
      const reply = (m) => ws.readyState === ws.OPEN && ws.send(JSON.stringify({ id: msg.id, ...m }))
      const spec = ACTIONS[msg.action]
      if (!spec) return reply({ type: 'result', ok: false, output: `action ${msg.action} is not allowed` })
      if (!available(root).includes(msg.action)) return reply({ type: 'result', ok: false, output: `action ${msg.action} is not available in this project` })
      const target = spec.target && TARGET[spec.target]
      const id = target ? msg[target.field] : null
      if (target && !target.pattern.test(id ?? '')) return reply({ type: 'result', ok: false, output: target.missing })
      reply({ type: 'queued' })
      await enqueue(async () => {
        reply({ type: 'started' })
        try {
          const result = await perform(msg.action, id, (line) => reply({ type: 'log', line }))
          reply({ type: 'result', ...result })
        } catch (err) {
          reply({ type: 'result', ok: false, output: err.message })
        }
      })
    })
  })

  // Push file changes so the UI reloads at once instead of waiting for its poll.
  let debounce = null
  const watcher = watch(root, { recursive: true }, (_event, file) => {
    if (file && IGNORED.test(file)) return
    clearTimeout(debounce)
    debounce = setTimeout(() => broadcast({ type: 'changed' }), 300)
  })

  const candidates = port !== undefined ? [port] : Array.from({ length: PORTS[1] - PORTS[0] + 1 }, (_, i) => PORTS[0] + i)
  let bound = null
  for (const p of candidates) {
    try {
      await new Promise((resolve, reject) => {
        http.once('error', reject)
        http.listen(p, '127.0.0.1', () => {
          http.off('error', reject)
          resolve()
        })
      })
      bound = http.address().port // differs from p when p is 0 (any free port)
      break
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err
    }
  }
  if (!bound) {
    watcher.close()
    throw new Error(`ports ${candidates.join(', ')} are all in use; pass --port`)
  }

  const pairUrl = `${site}/${workbenchSlug(root)}/#pair=${bound}:${token}`
  log(`companion for ${root}\nlistening on 127.0.0.1:${bound}\nopen this link to pair the web UI:\n  ${pairUrl}`)
  return {
    port: bound,
    token,
    pairUrl,
    close: () =>
      new Promise((resolve) => {
        watcher.close()
        clearTimeout(debounce)
        for (const ws of wss.clients) ws.terminate()
        wss.close(() => http.close(() => resolve()))
      }),
  }
}

/** Story projects open in the story workbench, everything else in the product one. */
function workbenchSlug(root) {
  try {
    return JSON.parse(readFileSync(join(root, PROJECT_FILE), 'utf8')).project?.kind === 'story' ? 'story' : 'product'
  } catch {
    return 'product'
  }
}
