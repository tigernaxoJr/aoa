import { computed, ref, shallowRef } from 'vue'
import type { SlideActivity, SlideCheck, SlideProject } from '../types/protocol'
import { ensurePermission, isSupported, listFiles, readText, tryFile, writeText } from '@aoa/web-shared/fsa'
import { type RecentFolder, recentFolders } from '@aoa/web-shared/recent'
import { parseSlides, type ParsedDeck } from './slide-parser'

export const dirHandle = shallowRef<FileSystemDirectoryHandle | null>(null)
export const project = ref<SlideProject | null>(null)
export const activity = ref<SlideActivity | null>(null)
export const slidesMarkdown = ref<string | null>(null)
/** When slides.md last changed, to tell whether the screenshots below still match it. */
export const slidesModified = ref<number | null>(null)
/** output/check.json, written by `pnpm run check`. */
export const check = ref<SlideCheck | null>(null)
/** Real renders by slide number: output/slides-png/<no>.png from `pnpm run check` or `pnpm run export:png`. */
export const slideImages = shallowRef<Map<number, SlideImage>>(new Map())
/** slide.start.json: what the user asked for, written by the web page before the Agent builds the project. */
export const start = ref<SlideStartConfig | null>(null)
export const pdfFile = shallowRef<File | null>(null)
export const pdfUrl = ref<string | null>(null)
export const htmlFile = shallowRef<File | null>(null)
export const htmlUrl = ref<string | null>(null)
/**
 * The HTML build loads nothing from next to it, so it plays from a blob: URL. Older templates built a
 * split SPA (index.html + assets/), which opens blank anywhere but a web server.
 */
export const htmlStandalone = ref(true)
export const isPolling = ref(false)
export const lastSync = ref<Date | null>(null)
export const syncError = ref<string | null>(null)
const loaded = ref(false)

const recent = recentFolders({ db: 'aoa-slide' })
/** Folders opened before, most recent first; the open one has `last` set. */
export const recentList = shallowRef<RecentFolder[]>([])
/** Why the last folder could not be opened; shown on the folder picker. */
export const folderError = ref<string | null>(null)
/** The title last written to the recent list for the open folder; null while it is not recorded. */
let recorded: string | null = null

let pollTimer: ReturnType<typeof setInterval> | null = null

export const parsedDeck = computed<ParsedDeck>(() => {
  return parseSlides(slidesMarkdown.value || '')
})

export interface SlideImage {
  url: string
  modified: number
}

export type SlideIssue = SlideCheck['slides'][number]['issues'][number]

export function issuesOf(no: number): SlideIssue[] {
  return check.value?.slides.find((s) => s.no === no)?.issues ?? []
}

/** slides.md changed after the newest screenshot or check: the renders show an older version. */
export const rendersStale = computed(() => {
  if (!slidesModified.value) return false
  const times = [...slideImages.value.values()].map((i) => i.modified)
  if (check.value) times.push(Date.parse(check.value.checkedAt))
  return times.length > 0 && slidesModified.value > Math.max(...times)
})

export const hasPdf = computed(() => !!pdfFile.value)
export const hasHtml = computed(() => !!htmlFile.value)

/** The folder is open but holds neither a project nor a start request: show the setup form. */
export const needsSetup = computed(() => !!dirHandle.value && loaded.value && !project.value && !start.value)

export async function setDirectory(handle: FileSystemDirectoryHandle) {
  // Polls keep the last good value when a file is missing, so another folder starts from a clean slate:
  // the previous project would otherwise hide the new folder's setup form.
  if (dirHandle.value !== handle) resetDirectory()
  stopPolling()
  dirHandle.value = handle
  await pollFiles()
  startPolling()
}

export function resetDirectory() {
  stopPolling()
  recorded = null
  if (pdfUrl.value) {
    URL.revokeObjectURL(pdfUrl.value)
    pdfUrl.value = null
  }
  if (htmlUrl.value) {
    URL.revokeObjectURL(htmlUrl.value)
    htmlUrl.value = null
  }
  for (const image of slideImages.value.values()) URL.revokeObjectURL(image.url)
  slideImages.value = new Map()
  check.value = null
  slidesModified.value = null
  dirHandle.value = null
  loaded.value = false
  project.value = null
  start.value = null
  activity.value = null
  slidesMarkdown.value = null
  pdfFile.value = null
  htmlFile.value = null
  htmlStandalone.value = true
  lastSync.value = null
  syncError.value = null
}

export async function pollFiles() {
  const root = dirHandle.value
  if (!root) return
  /** False once the user has switched folders while this poll was reading. */
  const live = () => dirHandle.value === root

  try {
    // 1. Read slide.project.json
    try {
      const text = await readText(root, 'slide.project.json')
      if (live()) project.value = JSON.parse(text) as SlideProject
    } catch {
      // not yet created
    }

    try {
      const config = JSON.parse(await readText(root, 'slide.start.json')) as SlideStartConfig
      if (live()) start.value = config
    } catch {
      // the folder was not prepared by this page
    }

    // 2. Read slide.activity.json
    try {
      const text = await readText(root, 'slide.activity.json')
      if (live()) activity.value = JSON.parse(text) as SlideActivity
    } catch {
      // not yet created
    }

    // 3. Read slides.md
    try {
      const file = await tryFile(root, 'slides.md')
      if (!live()) return
      slidesMarkdown.value = file ? await file.text() : null
      slidesModified.value = file?.lastModified ?? null
    } catch {
      slidesMarkdown.value = null
    }

    // 3b. Render check and per-slide screenshots
    try {
      const file = await tryFile(root, 'output/check.json')
      if (!live()) return
      check.value = file ? (JSON.parse(await file.text()) as SlideCheck) : null
    } catch {
      // being rewritten; keep the last good report
    }
    try {
      await pollImages(root)
    } catch {
      // keep the previous screenshots
    }

    // 4. Check output/slides.pdf
    try {
      const file = await tryFile(root, 'output/slides.pdf')
      if (!live()) return
      if (file && (!pdfFile.value || file.lastModified !== pdfFile.value.lastModified)) {
        if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value)
        pdfFile.value = file
        pdfUrl.value = URL.createObjectURL(file)
      } else if (!file && pdfFile.value) {
        if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value)
        pdfFile.value = null
        pdfUrl.value = null
      }
    } catch {
      // Ignore PDF read error
    }

    // 5. Check dist/index.html or output/dist/index.html
    try {
      let hFile = await tryFile(root, 'dist/index.html')
      if (!hFile) hFile = await tryFile(root, 'output/dist/index.html')
      if (!hFile) hFile = await tryFile(root, 'output/index.html')
      if (!live()) return
      if (hFile && (!htmlFile.value || hFile.lastModified !== htmlFile.value.lastModified)) {
        if (htmlUrl.value) URL.revokeObjectURL(htmlUrl.value)
        htmlFile.value = hFile
        htmlUrl.value = URL.createObjectURL(hFile)
        htmlStandalone.value = !/<(script|link)\b[^>]*\b(src|href)="(?!data:|https?:|#)[^"]*\.(js|css)"/i.test(await hFile.text())
      } else if (!hFile && htmlFile.value) {
        if (htmlUrl.value) URL.revokeObjectURL(htmlUrl.value)
        htmlFile.value = null
        htmlUrl.value = null
      }
    } catch {
      // Ignore HTML read error
    }

    if (!live()) return
    lastSync.value = new Date()
    loaded.value = true
    syncError.value = null
    // The Agent may create or retitle the project while the folder is open: keep the recent list in step.
    const title = project.value?.title || start.value?.title || ''
    if (recorded !== null && recorded !== title && dirHandle.value === root) await record(root, title)
  } catch (err: any) {
    syncError.value = err.message || '讀取本機檔案失敗'
  }
}

/** Refreshes slideImages, creating object URLs only for screenshots that are new or changed. */
async function pollImages(root: FileSystemDirectoryHandle) {
  const next = new Map<number, SlideImage>()
  let changed = false
  for (const path of await listFiles(root, 'output/slides-png')) {
    const no = Number(/\/(\d+)\.png$/.exec(path)?.[1])
    if (!no) continue
    const file = await tryFile(root, path)
    if (!file) continue
    const old = slideImages.value.get(no)
    if (old && old.modified === file.lastModified) {
      next.set(no, old)
      continue
    }
    next.set(no, { url: URL.createObjectURL(file), modified: file.lastModified })
    changed = true
  }
  for (const [no, image] of slideImages.value) {
    if (next.get(no) !== image) {
      URL.revokeObjectURL(image.url)
      changed = true
    }
  }
  if (dirHandle.value !== root) {
    for (const [no, image] of next) if (slideImages.value.get(no) !== image) URL.revokeObjectURL(image.url)
  } else if (changed) slideImages.value = next
}

async function record(handle: FileSystemDirectoryHandle, title: string) {
  recorded = title
  await recent.remember(handle, { projectName: title || null, kind: 'slide' })
  await refreshRecent()
}

async function refreshRecent() {
  recentList.value = await recent.load()
}

/**
 * Opens a slide project folder, or an empty one for a new project. A folder holding other files is
 * refused (the Agent unpacks the template there) and is not added to the recent list.
 */
export async function openFolder(handle: FileSystemDirectoryHandle) {
  const previous = dirHandle.value
  await setDirectory(handle)
  if (needsSetup.value) {
    const names = await folderEntries(handle)
    if (names.length) {
      resetDirectory()
      // Picked from the header menu: keep working on the project that was open.
      if (previous && previous !== handle) {
        await setDirectory(previous)
        recorded = project.value?.title || start.value?.title || ''
      }
      throw new Error(`「${handle.name}」不是空的資料夾，也不是簡報專案（找到 ${names.slice(0, 3).join('、')}${names.length > 3 ? ' 等' : ''}）。請選擇空資料夾開始新專案，或選擇既有的簡報專案資料夾。`)
    }
  }
  await record(handle, project.value?.title || start.value?.title || '')
}

/** Reopens a folder from the recent list; asks for access again when the browser no longer has it. */
export async function reopen(handle: FileSystemDirectoryHandle) {
  folderError.value = null
  try {
    if (!(await ensurePermission(handle, true))) throw new Error(`沒有取得「${handle.name}」的存取權限。`)
    await openFolder(handle)
  } catch (err) {
    folderError.value = (err as Error).message
  }
}

/** Lets the user pick a folder and opens it; cancelling the picker changes nothing. */
export async function pickFolder() {
  folderError.value = null
  try {
    await openFolder(await window.showDirectoryPicker!({ mode: 'readwrite', id: 'slide-project' }))
  } catch (err) {
    if ((err as DOMException).name !== 'AbortError') folderError.value = (err as Error).message || '無法開啟目錄'
  }
}

/** The empty folder picked for a new project is not wanted after all: drop it from the list too. */
export async function abandonFolder() {
  const handle = dirHandle.value
  resetDirectory()
  if (handle) await forgetRecent(handle)
}

/**
 * On start: reopen the folder from last time when the browser still allows it (Chrome keeps the
 * grant when the user chose "allow on every visit"); otherwise list it, since re-granting needs a click.
 */
export async function restore() {
  if (!isSupported()) return
  await refreshRecent()
  const last = recentList.value.find((r) => r.last)
  if (!last) return
  try {
    if (await ensurePermission(last.handle, false)) await openFolder(last.handle)
  } catch {
    // Moved or emptied since last time: it stays in the list for the user to remove.
  }
}

/** Closes the project: it stays in the recent list but is not reopened on the next visit. */
export async function closeProject() {
  folderError.value = null
  resetDirectory()
  await recent.forgetLast()
  await refreshRecent()
}

export async function forgetRecent(handle: FileSystemDirectoryHandle) {
  await recent.remove(handle)
  await refreshRecent()
}

export function startPolling(intervalMs = 2500) {
  stopPolling()
  isPolling.value = true
  pollTimer = setInterval(pollFiles, intervalMs)
}

export function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  isPolling.value = false
}

export interface SlideStartConfig {
  title: string
  /** What the deck should say, in the user's words; empty means the Agent asks before outlining. */
  content?: string
  description?: string
  audience?: string
  pagesCount?: number
  theme?: string
  aspectRatio?: string
  notes?: string
  createdAt?: string
}

/** Names in the folder, ignoring hidden entries (.git, .DS_Store, ...). */
export async function folderEntries(handle: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = []
  for await (const name of (handle as any).keys() as AsyncIterable<string>) if (!name.startsWith('.')) names.push(name)
  return names
}

/**
 * Writes slide.start.json (the user's request) and a first activity. The Agent unpacks the template and
 * writes slide.project.json from it; the page never writes the project file, so the template's copy is
 * not overwritten and the project stays valid against the schema.
 */
export async function initializeProject(config: SlideStartConfig) {
  const root = dirHandle.value
  if (!root) throw new Error('No directory selected')

  const startData: SlideStartConfig = { ...config, createdAt: new Date().toISOString() }
  await writeText(root, 'slide.start.json', JSON.stringify(startData, null, 2) + '\n')
  start.value = startData

  const starterActivity: SlideActivity = {
    message: '資料夾已準備好，等待 Agent 讀取 slide.start.json 開始製作',
    step: 'init',
    currentSlide: null,
    totalSlides: config.pagesCount ?? null,
    waitingForUser: false,
    updatedAt: new Date().toISOString(),
  }
  await writeText(root, 'slide.activity.json', JSON.stringify(starterActivity, null, 2) + '\n')
  activity.value = starterActivity

  await pollFiles()
}
