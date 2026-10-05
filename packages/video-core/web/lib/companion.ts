// Client for the local Companion (`video-agent serve`, SPEC §2.1 mode B, §10.1). Pairing comes from
// the link it prints (#pair=<port>:<token>, never sent to the site); the UI never scans ports.
// Without a Companion everything still works in mode A (polling + commands in the terminal).
import { reactive } from 'vue'

const KEY = 'avp-companion'

export const companion = reactive({
  state: 'off' as 'off' | 'connecting' | 'ready' | 'error',
  error: null as string | null,
  /** Label of the action currently running, and its latest output line. */
  running: null as string | null,
  lastLine: '',
  /** Actions this project's Companion offers (an older Companion sends none). */
  actions: [] as string[],
})

/** The Companion is connected and offers `action`. */
export const canRun = (action: string) => companion.state === 'ready' && companion.actions.includes(action)

type Pairing = { port: number; token: string }
type Pending = { resolve: (r: { ok: boolean; output: unknown }) => void; label: string }

let socket: WebSocket | null = null
let seq = 0
const pending = new Map<string, Pending>()
let onChanged: () => void = () => {}
/** Reconnects after the Companion restarts or starts late; backs off so a stopped one costs little. */
const RETRY_MS = [1000, 2000, 5000, 10000, 30000]
let retries = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null

function loadPairing(): Pairing | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
}

/** Reads #pair=<port>:<token>, stores it, and removes it from the address bar. */
export function takePairingFromUrl(): boolean {
  const m = /[#&]pair=(\d{2,5}):([A-Za-z0-9_-]{16,})/.exec(location.hash)
  if (!m) return false
  try {
    localStorage.setItem(KEY, JSON.stringify({ port: Number(m[1]), token: m[2] }))
  } catch {
    // storage blocked: pair for this visit only
    connect({ port: Number(m[1]), token: m[2] })
  }
  history.replaceState(null, '', location.pathname + location.search)
  return true
}

export function connect(pairing: Pairing | null = loadPairing(), changed?: () => void) {
  if (changed) onChanged = changed
  if (!pairing) return
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  socket?.close()
  companion.state = 'connecting'
  companion.error = null
  const ws = new WebSocket(`ws://127.0.0.1:${pairing.port}`)
  socket = ws
  ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', token: pairing.token }))
  ws.onmessage = (event) => {
    const msg = JSON.parse(String(event.data))
    if (msg.type === 'ready') {
      companion.state = 'ready'
      companion.actions = Array.isArray(msg.actions) ? msg.actions : []
      retries = 0
      onChanged() // changes made while disconnected were never pushed
    } else if (msg.type === 'changed') onChanged()
    else if (msg.type === 'log' && msg.line) companion.lastLine = msg.line
    else if (msg.type === 'result') {
      const job = pending.get(msg.id)
      pending.delete(msg.id)
      if (!pending.size) companion.running = null
      job?.resolve({ ok: msg.ok, output: msg.output })
    }
  }
  ws.onclose = (event) => {
    if (socket !== ws) return
    socket = null
    for (const job of pending.values()) job.resolve({ ok: false, output: '與本機助手的連線中斷' })
    pending.clear()
    companion.running = null
    if (event.code === 4001) {
      companion.state = 'error'
      companion.error = '配對已失效，請重新開啟 video-agent serve 印出的連結。'
      forget()
    } else {
      companion.state = companion.state === 'ready' ? 'off' : 'error'
      companion.error = companion.state === 'error' ? '連不上本機助手，請確認 video-agent serve 正在執行。' : null
      retryTimer = setTimeout(() => connect(pairing), RETRY_MS[Math.min(retries++, RETRY_MS.length - 1)])
    }
  }
}

export function forget() {
  try {
    localStorage.removeItem(KEY)
  } catch {}
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  socket?.close()
  socket = null
  companion.state = 'off'
}

export const hasPairing = () => loadPairing() !== null

/** Runs a whitelisted Companion action on a scene or cast member (or narrator); resolves when it finishes. */
export function run(action: string, label: string, target: { scene?: string; cast?: string } = {}): Promise<{ ok: boolean; output: unknown }> {
  if (!socket || companion.state !== 'ready') return Promise.resolve({ ok: false, output: '尚未連上本機助手' })
  const id = String(++seq)
  companion.running = label
  companion.lastLine = ''
  return new Promise((resolve) => {
    pending.set(id, { resolve, label })
    socket!.send(JSON.stringify({ type: 'run', id, action, ...target }))
  })
}
