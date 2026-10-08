<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import ActivityBanner from './components/ActivityBanner.vue'
import PdfViewer from './components/PdfViewer.vue'
import ProjectPicker from './components/ProjectPicker.vue'
import ProjectSwitcher from './components/ProjectSwitcher.vue'
import PromptLauncher from './components/PromptLauncher.vue'
import SlideDeckView from './components/SlideDeckView.vue'
import {
  dirHandle,
  folderError,
  hasHtml,
  hasPdf,
  isPolling,
  lastSync,
  needsSetup,
  pollFiles,
  project,
  restore,
  slidesMarkdown,
  start,
} from './lib/store'

const activeTab = ref<'slides' | 'pdf'>('slides')

const folderName = computed(() => dirHandle.value?.name || '')
const projectTitle = computed(() => project.value?.title || start.value?.title || folderName.value || '未命名簡報')

const syncTimeStr = computed(() => {
  if (!lastSync.value) return ''
  return lastSync.value.toLocaleTimeString('zh-TW', { hour12: false })
})

async function reload() {
  await pollFiles()
}

onMounted(restore)
// Another project opened: start from its slides.
watch(dirHandle, () => (activeTab.value = 'slides'))
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
    <!-- Navbar -->
    <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
      <div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div class="flex min-w-0 items-center gap-3">
          <a
            href="../"
            class="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            title="返回平台總覽"
          >
            <span>←</span>
            <span>平台總覽</span>
          </a>
          <span class="text-slate-300 dark:text-slate-700" aria-hidden="true">/</span>
          <span class="flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight whitespace-nowrap">
            <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 font-mono text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs" aria-hidden="true">S</span>
            <span class="hidden sm:inline">Slide Studio</span>
            <span class="hidden rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 md:inline text-[11px] font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
              Slidev + AOA
            </span>
          </span>
          <template v-if="dirHandle">
            <span class="text-slate-300 dark:text-slate-700" aria-hidden="true">/</span>
            <ProjectSwitcher :name="projectTitle" />
          </template>
        </div>

        <!-- Right Side: Directory status & Actions -->
        <div v-if="dirHandle" class="flex shrink-0 items-center gap-3">
          <div class="hidden sm:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span
              class="h-2 w-2 rounded-full"
              :class="isPolling ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'"
              title="本機檔案即時輪詢中"
            ></span>
            <span class="font-mono truncate max-w-[150px]">{{ folderName }}</span>
            <span v-if="syncTimeStr" class="text-[11px] text-slate-400">({{ syncTimeStr }})</span>
          </div>

          <button
            type="button"
            title="手動重新整理本機檔案"
            @click="reload"
            class="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="mx-auto max-w-7xl px-4 py-5 sm:py-6">
      <!-- No folder yet, or an empty folder that still needs the setup form -->
      <ProjectPicker v-if="!dirHandle || needsSetup" />

      <!-- Workspace when folder is selected -->
      <div v-else class="space-y-6">
        <div v-if="folderError" class="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300" role="alert">
          <span>{{ folderError }}</span>
          <button type="button" class="shrink-0 text-xs font-medium underline cursor-pointer" @click="folderError = null">關閉</button>
        </div>
        <!-- Project Title Header -->
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 class="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              {{ projectTitle }}
            </h2>
            <p v-if="project?.description" class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {{ project.description }}
            </p>
          </div>

          <div class="flex items-center gap-2">
            <span
              v-if="hasHtml"
              class="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 dark:bg-sky-950/60 dark:text-sky-400"
            >
              ✓ HTML 已匯出
            </span>
            <span
              v-if="hasPdf"
              class="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
            >
              ✓ PDF 已匯出
            </span>
          </div>
        </div>

        <!-- Activity & Step Progress -->
        <ActivityBanner />

        <!-- Awaiting Agent setup: show PromptLauncher prominently -->
        <div v-if="!project && !slidesMarkdown" class="space-y-4">
          <PromptLauncher />
        </div>

        <!-- Agent has initialized project or generated slides: show workbench tabs -->
        <div v-else class="space-y-4">
          <!-- Navigation Tabs -->
          <div class="border-b border-slate-200 dark:border-slate-800">
            <nav class="flex gap-6">
              <button
                type="button"
                @click="activeTab = 'slides'"
                class="border-b-2 py-3 text-sm font-semibold transition-colors cursor-pointer"
                :class="[
                  activeTab === 'slides'
                    ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                ]"
              >
                簡報內容預覽 (Slides)
              </button>

              <button
                type="button"
                @click="activeTab = 'pdf'"
                class="border-b-2 py-3 text-sm font-semibold transition-colors cursor-pointer"
                :class="[
                  activeTab === 'pdf'
                    ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                ]"
              >
                成果放映 (PDF &amp; HTML)
                <span
                  v-if="hasPdf || hasHtml"
                  class="ml-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500"
                ></span>
              </button>
            </nav>
          </div>

          <!-- Tab Panels -->
          <div>
            <SlideDeckView v-if="activeTab === 'slides'" />
            <PdfViewer v-else-if="activeTab === 'pdf'" />
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
