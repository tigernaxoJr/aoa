<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { parsedDeck, project, slidesMarkdown } from '../lib/store'
import CopyButton from './CopyButton.vue'
import SlideDetailPane from './SlideDetailPane.vue'
import SlideSidebar from './SlideSidebar.vue'

const selectedSlideIndex = ref(1)
const viewTab = ref<'deck' | 'markdown'>('deck')

const slides = computed(() => parsedDeck.value.slides)
const totalSlides = computed(() => slides.value.length)

// Ensure valid selection when slides change
watch(
  slides,
  (newSlides) => {
    if (!newSlides.length) {
      selectedSlideIndex.value = 1
      return
    }
    if (!newSlides.some((s) => s.index === selectedSlideIndex.value)) {
      selectedSlideIndex.value = newSlides[0].index
    }
  },
  { immediate: true },
)

const currentSlide = computed(() => {
  return slides.value.find((s) => s.index === selectedSlideIndex.value) || slides.value[0] || null
})

function prevSlide() {
  if (selectedSlideIndex.value > 1) {
    selectedSlideIndex.value--
  }
}

function nextSlide() {
  if (selectedSlideIndex.value < totalSlides.value) {
    selectedSlideIndex.value++
  }
}

function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function downloadDeck() {
  if (!slidesMarkdown.value) return
  const name = project.value?.title ? `${project.value.title}.md` : 'slides.md'
  downloadMarkdown(slidesMarkdown.value, name)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Top Bar: View Mode & Whole Deck Export -->
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div class="flex items-center gap-2">
        <div class="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            @click="viewTab = 'deck'"
            class="rounded-md px-3 py-1 font-medium transition-colors cursor-pointer"
            :class="[
              viewTab === 'deck'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            ]"
          >
            雙欄預覽 (Left/Right)
          </button>
          <button
            type="button"
            @click="viewTab = 'markdown'"
            class="rounded-md px-3 py-1 font-medium transition-colors cursor-pointer"
            :class="[
              viewTab === 'markdown'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            ]"
          >
            完整 Markdown 原始碼
          </button>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          v-if="slidesMarkdown"
          type="button"
          @click="downloadDeck"
          title="下載整份 slides.md"
          class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors cursor-pointer"
        >
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          下載整份 .md
        </button>

        <CopyButton
          v-if="slidesMarkdown"
          :text="slidesMarkdown"
          label="複製整份 slides.md"
        />
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-if="!slidesMarkdown"
      class="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500 shadow-xs"
    >
      <svg class="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
      <p class="mt-3 text-sm font-medium">尚未偵測到 slides.md</p>
      <p class="mt-1 text-xs">當 Coding Agent 依指令編寫簡報後，此處將自動呈現分頁預覽。</p>
    </div>

    <!-- Whole Markdown source panel -->
    <div
      v-else-if="viewTab === 'markdown'"
      class="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900"
    >
      <pre class="max-h-[600px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200"><code>{{ slidesMarkdown }}</code></pre>
    </div>

    <!-- Two-Column Workbench Layout (Matching video SceneBoard + SceneEditor) -->
    <div
      v-else
      class="grid items-start gap-5 lg:grid-cols-[minmax(300px,1.2fr)_2.8fr]"
    >
      <!-- Left Column: Slide List -->
      <div class="lg:sticky lg:top-18">
        <SlideSidebar
          :slides="slides"
          :selected-slide-index="selectedSlideIndex"
          @select="selectedSlideIndex = $event"
        />
      </div>

      <!-- Right Column: Slide Detail & Preview -->
      <div>
        <SlideDetailPane
          :slide="currentSlide"
          :total-slides="totalSlides"
          @prev="prevSlide"
          @next="nextSlide"
        />
      </div>
    </div>
  </div>
</template>
