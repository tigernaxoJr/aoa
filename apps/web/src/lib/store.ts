// App state: the open project folder, the loaded project, polling (SPEC §9.1), and a single path
// for running writes so conflicts and lock waits are reported the same way everywhere.
import { reactive, shallowRef } from 'vue'
import { ensurePermission, isSupported } from './fsa'
import { forgetHandle, loadHandle, saveHandle } from './idb'
import { fingerprint, loadProject, type ProjectState } from './project'
import { LockedError } from './writes'

const POLL_MS = 2000

export const root = shallowRef<FileSystemDirectoryHandle | null>(null)
export const state = shallowRef<ProjectState | null>(null)
export const ui = reactive({
  supported: isSupported(),
  /** A folder remembered from last visit that still needs the user to re-grant access. */
  remembered: null as FileSystemDirectoryHandle | null,
  loading: false,
  error: null as string | null,
  notice: null as { kind: 'ok' | 'warn' | 'error'; text: string } | null,
  saving: false,
})

let print = ''
let timer: ReturnType<typeof setInterval> | null = null

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
    print = await fingerprint(root.value, next)
    ui.error = null
  } catch (err) {
    ui.error = (err as Error).message
  }
}

async function poll() {
  if (!root.value || ui.saving || document.hidden) return
  try {
    if ((await fingerprint(root.value, state.value)) !== print) await reload()
  } catch {
    // folder temporarily unavailable; try again next tick
  }
}

export async function openHandle(handle: FileSystemDirectoryHandle, remember = true) {
  ui.loading = true
  try {
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
    __avp?: { open(handle: FileSystemDirectoryHandle): Promise<void> }
  }
}
window.__avp = { open: (handle) => openHandle(handle, false) }
