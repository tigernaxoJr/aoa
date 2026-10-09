// App state: the open project folder, the loaded project, polling (SPEC §9.1), and a single path
// for running writes so conflicts and lock waits are reported the same way everywhere.
import { reactive, shallowRef } from 'vue'
import { ensurePermission, isSupported, tryFile } from '@aoa/web-shared/fsa'
import { type RecentFolder, recent } from './idb'
import { PROJECT_FILE, fingerprint, loadActivity, loadProject, readyForNewProject, type ProjectState } from './project'
import { type TemplateDiff, templateDiff, updateTemplate } from './template'
import type { VideoActivityJson } from '../types/protocol'
import { LockedError } from './writes'
import { VIDEO_KIND } from './site'

const POLL_MS = 2000

export const root = shallowRef<FileSystemDirectoryHandle | null>(null)
export const state = shallowRef<ProjectState | null>(null)
/** What the agent says it is doing (SPEC §9.2); shown before and after the project exists. */
export const activity = shallowRef<VideoActivityJson | null>(null)
/** The project's tools differ from this site's template (checked once per opened folder). */
export const outdated = shallowRef<TemplateDiff | null>(null)
export const ui = reactive({
  supported: isSupported(),
  /** Folders opened before (this workbench's kind), most recent first; reopening one may need a click to re-grant access. */
  recent: [] as RecentFolder[],
  /** The folder is open but holds no project yet: the page waits for the agent to create it. */
  waiting: false,
  loading: false,
  error: null as string | null,
  notice: null as { kind: 'ok' | 'warn' | 'error'; text: string } | null,
  saving: false,
  /** The tools update changed dependencies: the agent must install them before running anything. */
  needsInstall: false,
})

let print = ''
/** The project name and kind last written to the recent list for the open folder. */
let recorded = ''
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
    // Taken before reading: a file written while this reload runs still differs on the next poll.
    // (It covers the files known so far; a changed scene list makes the next poll reload once more.)
    const before = await fingerprint(root.value, state.value)
    const next = await loadProject(root.value)
    // The agent may create or rename the project while the folder is open: keep the recent list in step.
    // Saved before the page shows the project, so a reload from then on reopens this one.
    const info = { projectName: next?.project.project.name ?? null, kind: next?.project.project.kind ?? null }
    const changed = JSON.stringify(info) !== recorded
    if (changed) {
      recorded = JSON.stringify(info)
      await recent.remember(root.value, info)
    }
    state.value = next
    activity.value = await loadActivity(root.value)
    ui.waiting = !next
    print = before
    ui.error = null
    if (changed) await refreshRecent()
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

/**
 * Opens a project folder, or prepares an empty one for a new project (SPEC §9.2). A folder with
 * other files is refused before anything changes, so a wrong pick keeps the previous folder.
 */
export async function openHandle(handle: FileSystemDirectoryHandle) {
  ui.loading = true
  try {
    if (!(await tryFile(handle, PROJECT_FILE)) && !(await readyForNewProject(handle))) {
      ui.error = `「${handle.name}」裡已經有其他檔案。請在選擇資料夾的視窗按「新增資料夾」，建立一個空的資料夾來放影片專案。`
      return
    }
    root.value = handle
    recorded = ''
    state.value = null
    activity.value = null
    await reload()
    if (ui.error) {
      root.value = null
      return
    }
    timer ??= setInterval(poll, POLL_MS)
    outdated.value = state.value ? await templateDiff(handle) : null
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

async function refreshRecent() {
  // Folders without a project yet (kind unknown) belong to whichever workbench opens them.
  ui.recent = (await recent.load()).filter((r) => !r.kind || r.kind === VIDEO_KIND)
}

/**
 * On start: reopen the folder from last time when the browser still allows it (Chrome keeps the
 * grant when the user chose "allow on every visit"); otherwise list it, since re-granting needs a click.
 */
export async function restore() {
  if (!ui.supported) return
  await refreshRecent()
  const last = ui.recent.find((r) => r.last)
  if (last && (await ensurePermission(last.handle, false))) await openHandle(last.handle)
}

export async function reconnect(handle: FileSystemDirectoryHandle) {
  try {
    if (await ensurePermission(handle, true)) await openHandle(handle)
    else notify('warn', '沒有取得資料夾的存取權限。')
  } catch (err) {
    // The folder was moved or deleted since it was opened.
    notify('error', `無法開啟「${handle.name}」：${(err as Error).message}`)
  }
}

/**
 * Switches the open project to another recent folder. A folder that cannot be opened leaves the
 * current project open and says why in a notice (the home page error is not visible from here).
 */
export async function switchTo(handle: FileSystemDirectoryHandle) {
  const before = root.value
  await reconnect(handle)
  if (root.value === before && ui.error) {
    notify('error', ui.error)
    ui.error = null
  }
}

export async function forgetRecent(handle: FileSystemDirectoryHandle) {
  await recent.remove(handle)
  await refreshRecent()
}

export async function close() {
  // Saved before the page leaves the project, so a reload from then on does not reopen it.
  await recent.forgetLast()
  root.value = null
  state.value = null
  activity.value = null
  outdated.value = null
  ui.waiting = false
  ui.needsInstall = false
  if (timer) clearInterval(timer)
  timer = null
  await refreshRecent()
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

/** Updates the project's tools to this site's template; the agent only needs to reinstall when package.json changed. */
export async function syncTemplate() {
  if (!root.value || !outdated.value) return
  ui.saving = true
  try {
    const { dropped, needsInstall } = await updateTemplate(root.value, outdated.value)
    outdated.value = null
    const parts = ['專案工具已更新到最新版']
    if (dropped.length) parts.push(`已移除新版不再使用的欄位：${dropped.join('、')}`)
    ui.needsInstall = needsInstall
    notify('ok', parts.join('。'))
  } catch (err) {
    notify(err instanceof LockedError ? 'warn' : 'error', (err as Error).message)
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

