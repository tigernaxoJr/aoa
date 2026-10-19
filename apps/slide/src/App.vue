<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { portalHome } from '@aoa/web-shared/lang'
import ReferencesPanel from '@aoa/web-shared/ReferencesPanel.vue'
import ActivityBanner from './components/ActivityBanner.vue'
import PdfViewer from './components/PdfViewer.vue'
import ProjectPicker from './components/ProjectPicker.vue'
import ProjectSwitcher from './components/ProjectSwitcher.vue'
import PromptLauncher from './components/PromptLauncher.vue'
import SlideDeckView from './components/SlideDeckView.vue'
import {
  activity,
  dirHandle,
  folderError,
  hasHtml,
  hasPdf,
  isPolling,
  lastSync,
  needsSetup,
  parsedDeck,
  pollFiles,
  project,
  referenceCount,
  restore,
  slidesMarkdown,
  start,
  STARTER_MESSAGE,
} from './lib/store'

type Tab = 'slides' | 'pdf' | 'references'
const activeTab = ref<Tab>('slides')

const folderName = computed(() => dirHandle.value?.name || '')
const projectTitle = computed(() => project.value?.title || start.value?.title || folderName.value || '未命名簡報')

const syncTimeStr = computed(() => {
  if (!lastSync.value) return ''
  return lastSync.value.toLocaleTimeString('zh-TW', { hour12: false })
})

const tabs = computed(() => [
  { id: 'slides' as const, label: '投影片', count: parsedDeck.value.slides.length || null, ready: false },
  { id: 'pdf' as const, label: '成果', count: null, ready: hasPdf.value || hasHtml.value },
  { id: 'references' as const, label: '參考資料', count: referenceCount.value || null, ready: false },
])

async function reload() {
  await pollFiles()
}

onMounted(restore)
// Another project opened: start from its slides.
watch(dirHandle, () => (activeTab.value = 'slides'))
</script>

<template>
  <div class="min-h-screen">
    <header class="sticky top-0 z-30 border-b border-stone-200 bg-paper/90 backdrop-blur-sm dark:border-stone-800">
      <div class="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div class="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <a :href="portalHome()" class="flex shrink-0 items-baseline gap-2" title="回到 AOA 首頁">
            <span class="font-serif text-lg font-bold tracking-tight">AOA</span>
            <span class="font-mono text-[11px] text-stone-500">/ slide</span>
          </a>
          <template v-if="dirHandle">
            <span class="text-stone-300 dark:text-stone-700" aria-hidden="true">/</span>
            <ProjectSwitcher :name="projectTitle" />
          </template>
        </div>

        <div v-if="dirHandle" class="flex shrink-0 items-center gap-2 sm:gap-3">
          <span class="hidden items-center gap-2 font-mono text-[11px] text-stone-500 sm:flex" :title="`本機資料夾「${folderName}」，每幾秒自動讀取一次`">
            <span class="h-1.5 w-1.5 rounded-full" :class="isPolling ? 'animate-pulse bg-emerald-500' : 'bg-stone-400'" aria-hidden="true" />
            <span class="max-w-[160px] truncate">{{ folderName }}</span>
            <span v-if="syncTimeStr" class="text-stone-400">{{ syncTimeStr }}</span>
          </span>
          <button type="button" class="icon-btn" title="重新讀取資料夾" aria-label="重新讀取資料夾" @click="reload">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2M21 4v5h-5M3 20v-5h5" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <!-- No folder yet, or an empty folder that still needs the setup form -->
      <ProjectPicker v-if="!dirHandle || needsSetup" />

      <div v-else class="space-y-6">
        <div v-if="folderError" class="flex items-start justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300" role="alert">
          <span>{{ folderError }}</span>
          <button type="button" class="shrink-0 cursor-pointer text-xs font-medium underline" @click="folderError = null">關閉</button>
        </div>

        <div>
          <p class="eyebrow"><span class="text-accent">Slide</span> · 簡報專案</p>
          <h1 class="mt-2 font-serif text-2xl font-bold tracking-tight sm:text-3xl">{{ projectTitle }}</h1>
          <p v-if="project?.description" class="mt-1.5 text-sm text-stone-600 dark:text-stone-400">{{ project.description }}</p>
        </div>

        <!-- Before the project exists the Agent may already be asking something (e.g. what the deck is about). -->
        <ActivityBanner v-if="project || slidesMarkdown || (activity && activity.message !== STARTER_MESSAGE)" />

        <!-- Awaiting the Agent: the prompt is the only thing to do -->
        <div v-if="!project && !slidesMarkdown" class="space-y-4">
          <PromptLauncher />
          <details class="card p-5" data-testid="pending-references">
            <summary class="cursor-pointer text-sm font-semibold select-none">參考資料{{ referenceCount ? `（${referenceCount} 份）` : '（選填）' }}</summary>
            <ReferencesPanel class="mt-3" :root="dirHandle" intro="還可以補充文件、圖片或文字；上方的提示詞會告訴 Agent 去讀 references/。" />
          </details>
        </div>

        <div v-else class="space-y-5">

          <nav class="flex gap-6 border-b border-stone-200 dark:border-stone-800" aria-label="工作台分頁">
            <button
              v-for="t in tabs"
              :key="t.id"
              type="button"
              class="-mb-px flex cursor-pointer items-center gap-1.5 border-b-2 pt-1 pb-2.5 text-sm transition-colors"
              :class="activeTab === t.id ? 'border-accent font-semibold text-stone-900 dark:text-white' : 'border-transparent text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white'"
              :aria-current="activeTab === t.id ? 'page' : undefined"
              :data-testid="`tab-${t.id}`"
              @click="activeTab = t.id"
            >
              {{ t.label }}
              <span v-if="t.count" class="font-mono text-[11px] text-stone-400" data-testid="tab-count">{{ t.count }}</span>
              <span v-if="t.ready" class="h-1.5 w-1.5 rounded-full bg-emerald-500" title="已匯出" />
            </button>
          </nav>

          <SlideDeckView v-if="activeTab === 'slides'" />
          <PdfViewer v-else-if="activeTab === 'pdf'" />
          <div v-else class="card max-w-3xl p-5 sm:p-6">
            <ReferencesPanel
              :root="dirHandle"
              ask="簡報"
              intro="想讓 Agent 參考的文件、圖片或文字放在這裡（存進專案資料夾的 references/）。加入後把下方那句話交給 Agent，它會讀過、說明打算怎麼用，再修改簡報。"
            />
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
