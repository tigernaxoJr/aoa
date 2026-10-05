import { computed, ref, shallowRef } from 'vue'
import type { SlideActivity, SlideProject } from '../types/protocol'
import { readText, tryFile, writeText } from '@aoa/web-shared/fsa'
import { parseSlides, type ParsedDeck } from './slide-parser'

export const dirHandle = shallowRef<FileSystemDirectoryHandle | null>(null)
export const project = ref<SlideProject | null>(null)
export const activity = ref<SlideActivity | null>(null)
export const slidesMarkdown = ref<string | null>(null)
/** slide.start.json: what the user asked for, written by the web page before the Agent builds the project. */
export const start = ref<SlideStartConfig | null>(null)
export const pdfFile = shallowRef<File | null>(null)
export const pdfUrl = ref<string | null>(null)
export const htmlFile = shallowRef<File | null>(null)
export const htmlUrl = ref<string | null>(null)
export const isPolling = ref(false)
export const lastSync = ref<Date | null>(null)
export const syncError = ref<string | null>(null)
const loaded = ref(false)

let pollTimer: ReturnType<typeof setInterval> | null = null

export const parsedDeck = computed<ParsedDeck>(() => {
  return parseSlides(slidesMarkdown.value || '')
})

export const hasPdf = computed(() => !!pdfFile.value)
export const hasHtml = computed(() => !!htmlFile.value)

/** The folder is open but holds neither a project nor a start request: show the setup form. */
export const needsSetup = computed(() => !!dirHandle.value && loaded.value && !project.value && !start.value)

export async function setDirectory(handle: FileSystemDirectoryHandle) {
  stopPolling()
  dirHandle.value = handle
  await pollFiles()
  startPolling()
}

export function resetDirectory() {
  stopPolling()
  if (pdfUrl.value) {
    URL.revokeObjectURL(pdfUrl.value)
    pdfUrl.value = null
  }
  if (htmlUrl.value) {
    URL.revokeObjectURL(htmlUrl.value)
    htmlUrl.value = null
  }
  dirHandle.value = null
  loaded.value = false
  project.value = null
  start.value = null
  activity.value = null
  slidesMarkdown.value = null
  pdfFile.value = null
  htmlFile.value = null
  lastSync.value = null
  syncError.value = null
}

export async function pollFiles() {
  const root = dirHandle.value
  if (!root) return

  try {
    // 1. Read slide.project.json
    try {
      const text = await readText(root, 'slide.project.json')
      project.value = JSON.parse(text) as SlideProject
    } catch {
      // not yet created
    }

    try {
      start.value = JSON.parse(await readText(root, 'slide.start.json')) as SlideStartConfig
    } catch {
      // the folder was not prepared by this page
    }

    // 2. Read slide.activity.json
    try {
      const text = await readText(root, 'slide.activity.json')
      activity.value = JSON.parse(text) as SlideActivity
    } catch {
      // not yet created
    }

    // 3. Read slides.md
    try {
      slidesMarkdown.value = await readText(root, 'slides.md')
    } catch {
      slidesMarkdown.value = null
    }

    // 4. Check output/slides.pdf
    try {
      const file = await tryFile(root, 'output/slides.pdf')
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
      if (hFile && (!htmlFile.value || hFile.lastModified !== htmlFile.value.lastModified)) {
        if (htmlUrl.value) URL.revokeObjectURL(htmlUrl.value)
        htmlFile.value = hFile
        htmlUrl.value = URL.createObjectURL(hFile)
      } else if (!hFile && htmlFile.value) {
        if (htmlUrl.value) URL.revokeObjectURL(htmlUrl.value)
        htmlFile.value = null
        htmlUrl.value = null
      }
    } catch {
      // Ignore HTML read error
    }

    lastSync.value = new Date()
    loaded.value = true
    syncError.value = null
  } catch (err: any) {
    syncError.value = err.message || '讀取本機檔案失敗'
  }
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
