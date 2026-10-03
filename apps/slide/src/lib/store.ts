import { computed, ref, shallowRef } from 'vue'
import type { SlideActivity, SlideProject } from '../types/protocol'
import { readText, tryFile, writeText } from './fsa'
import { parseSlides, type ParsedDeck } from './slide-parser'

export const dirHandle = shallowRef<FileSystemDirectoryHandle | null>(null)
export const project = ref<SlideProject | null>(null)
export const activity = ref<SlideActivity | null>(null)
export const slidesMarkdown = ref<string | null>(null)
export const pdfFile = shallowRef<File | null>(null)
export const pdfUrl = ref<string | null>(null)
export const isPolling = ref(false)
export const lastSync = ref<Date | null>(null)
export const syncError = ref<string | null>(null)

let pollTimer: ReturnType<typeof setInterval> | null = null

export const parsedDeck = computed<ParsedDeck>(() => {
  return parseSlides(slidesMarkdown.value || '')
})

export const hasPdf = computed(() => !!pdfFile.value)

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
  dirHandle.value = null
  project.value = null
  activity.value = null
  slidesMarkdown.value = null
  pdfFile.value = null
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

    lastSync.value = new Date()
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
}

/** Writes slide.start.json and initial slide.project.json into the directory */
export async function initializeProject(config: SlideStartConfig) {
  const root = dirHandle.value
  if (!root) throw new Error('No directory selected')

  // 1. Write slide.start.json
  const startData = {
    ...config,
    createdAt: new Date().toISOString(),
  }
  await writeText(root, 'slide.start.json', JSON.stringify(startData, null, 2) + '\n')

  // 2. If slide.project.json does not exist, write a starter one
  if (!project.value) {
    const starterProject: SlideProject = {
      specVersion: '1.0.0',
      id: config.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'my-slide',
      title: config.title,
      description: config.description || '',
      theme: config.theme || 'default',
      aspectRatio: config.aspectRatio || '16/9',
      status: 'initialized',
      pagesCount: config.pagesCount || 5,
      updatedAt: new Date().toISOString(),
      updatedBy: 'user',
    }
    await writeText(root, 'slide.project.json', JSON.stringify(starterProject, null, 2) + '\n')
    project.value = starterProject
  }

  // 3. Write initial activity if none exists
  if (!activity.value) {
    const starterActivity: SlideActivity = {
      message: '專案已建立，等待 Agent 讀取 slide.start.json 開始製作',
      step: 'init',
      totalSlides: config.pagesCount || 5,
      waitingForUser: false,
      updatedAt: new Date().toISOString(),
    }
    await writeText(root, 'slide.activity.json', JSON.stringify(starterActivity, null, 2) + '\n')
    activity.value = starterActivity
  }

  await pollFiles()
}
