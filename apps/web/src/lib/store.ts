// App state: the open project folder, the loaded project, polling (SPEC §9.1), and a single path
// for running writes so conflicts and lock waits are reported the same way everywhere.
import { reactive, shallowRef } from 'vue'
import { companion, run as runAction } from './companion'
import { ensurePermission, isSupported, tryFile } from './fsa'
import { forgetHandle, loadHandle, saveHandle } from './idb'
import { PROJECT_FILE, fingerprint, loadActivity, loadProject, readyForNewProject, type ProjectState } from './project'
import type { VideoActivityJson } from '../types/protocol'
import { LockedError } from './writes'

const POLL_MS = 2000
/** With the Companion pushing changes, polling only backs up a missed file-watch event. */
const POLL_PUSHED_MS = 10_000

export const root = shallowRef<FileSystemDirectoryHandle | null>(null)
export const state = shallowRef<ProjectState | null>(null)
/** What the agent says it is doing (SPEC §9.2); shown before and after the project exists. */
export const activity = shallowRef<VideoActivityJson | null>(null)
export const ui = reactive({
  supported: isSupported(),
  /** A folder remembered from last visit that still needs the user to re-grant access. */
  remembered: null as FileSystemDirectoryHandle | null,
  /** The folder is open but holds no project yet: the page waits for the agent to create it. */
  waiting: false,
  loading: false,
  error: null as string | null,
  notice: null as { kind: 'ok' | 'warn' | 'error'; text: string } | null,
  saving: false,
})

let print = ''
let timer: ReturnType<typeof setInterval> | null = null
let polled = 0

export function notify(kind: 'ok' | 'warn' | 'error', text: string) {
  ui.notice = { kind, text }
  setTimeout(() => {
    if (ui.notice?.text === text) ui.notice = null
  }, kind === 'error' ? 8000 : 4000)
}

export async function reload() {
  if (!root.value) return
  try {
    const next = await loadProject(root.value)
    state.value = next
    activity.value = await loadActivity(root.value)
    ui.waiting = !next
    print = await fingerprint(root.value, next)
    ui.error = null
  } catch (err) {
    ui.error = (err as Error).message
  }
}

async function poll() {
  if (!root.value || ui.saving || document.hidden) return
  if (companion.state === 'ready' && Date.now() - polled < POLL_PUSHED_MS) return
  polled = Date.now()
  try {
    if ((await fingerprint(root.value, state.value)) !== print) await reload()
  } catch {
    // folder temporarily unavailable; try again next tick
  }
}

/**
 * Opens a project folder, or prepares an empty one for a new project (SPEC §9.2). A folder with
 * other files is refused before anything changes, so a wrong pick keeps the previous folder.
 */
export async function openHandle(handle: FileSystemDirectoryHandle, remember = true) {
  ui.loading = true
  try {
    if (!(await tryFile(handle, PROJECT_FILE)) && !(await readyForNewProject(handle))) {
      ui.error = `「${handle.name}」裡已經有其他檔案。請在選擇資料夾的視窗按「新增資料夾」，建立一個空的資料夾來放影片專案。`
      return
    }
    root.value = handle
    ui.remembered = null
    await reload()
    if (ui.error) {
      root.value = null
      return
    }
    if (remember) await saveHandle(handle)
    timer ??= setInterval(poll, POLL_MS)
  } finally {
    ui.loading = false
  }
}

export async function pickFolder() {
  if (!window.showDirectoryPicker) return
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'video-project' })
    await openHandle(handle)
  } catch (err) {
    if ((err as DOMException).name !== 'AbortError') ui.error = (err as Error).message
  }
}

/** On start: offer the folder from last time (permission needs a click, so only remember it here). */
export async function restore() {
  if (!ui.supported) return
  const handle = await loadHandle()
  if (!handle) return
  if (await ensurePermission(handle, false)) await openHandle(handle, false)
  else ui.remembered = handle
}

export async function reconnect() {
  const handle = ui.remembered
  if (!handle) return
  if (await ensurePermission(handle, true)) await openHandle(handle, false)
  else notify('warn', '沒有取得資料夾的存取權限。')
}

export async function close() {
  root.value = null
  state.value = null
  activity.value = null
  ui.waiting = false
  if (timer) clearInterval(timer)
  timer = null
  await forgetHandle()
}

/** Runs a write against the current snapshot, then reloads. Returns true on success. */
export async function write(action: (root: FileSystemDirectoryHandle, state: ProjectState) => Promise<void>, done = '已儲存') {
  if (!root.value || !state.value) return false
  ui.saving = true
  try {
    await action(root.value, state.value)
    notify('ok', done)
    return true
  } catch (err) {
    // A lock is a wait-and-retry; a conflict or invalid edit is an error. The reload below shows fresh data either way.
    notify(err instanceof LockedError ? 'warn' : 'error', (err as Error).message)
    return false
  } finally {
    ui.saving = false
    await reload()
  }
}

// Test hook: lets automated tests open an OPFS directory without the native folder picker.
declare global {
  interface Window {
    __avp?: { open(handle: FileSystemDirectoryHandle): Promise<void>; pickSource?(handle: FileSystemDirectoryHandle): Promise<void> }
  }
}
window.__avp = { open: (handle) => openHandle(handle) }

/** Runs a Companion action and reports the outcome the same way writes do. */
export async function runCompanion(action: string, label: string, scene?: string) {
  const result = await runAction(action, label, scene)
  notify(result.ok ? 'ok' : 'error', result.ok ? `${label}：完成` : `${label}：失敗。${summarize(result.output)}`)
  await reload()
  return result.ok
}

function summarize(output: unknown): string {
  if (typeof output === 'string') return output.split('\n').filter(Boolean).at(-1) ?? ''
  if (Array.isArray(output)) {
    const failed = output.find((s: { code?: number }) => s.code)
    return failed ? `${failed.step}：${String(failed.output).split('\n').filter(Boolean).at(-1) ?? ''}` : ''
  }
  return ''
}
