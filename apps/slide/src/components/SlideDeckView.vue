<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { check, parsedDeck, project, rendersStale, slidesMarkdown } from '../lib/store'
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

/** Slides the render check flagged, in order. */
const flagged = computed(() => check.value?.slides.filter((s) => s.issues.length).map((s) => s.no) ?? [])

const checkSummary = computed(() => {
  const report = check.value
  if (!report) return null
  return {
    ok: report.ok,
    text: report.ok ? `${report.total} 頁全部通過` : `${flagged.value.length} 頁有問題`,
    time: new Date(report.checkedAt).toLocaleString('zh-TW', { hour12: false }),
    errors: report.errors,
  }
})

/** The next flagged slide after the selected one, wrapping around. */
function nextFlagged() {
  const list = flagged.value
  if (!list.length) return
  selectedSlideIndex.value = list.find((no) => no > selectedSlideIndex.value) ?? list[0]
  viewTab.value = 'deck'
}

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

/** ← → (or J / K) page through the deck, unless the user is typing. */
function onKey(e: KeyboardEvent) {
  if (viewTab.value !== 'deck' || e.altKey || e.ctrlKey || e.metaKey) return
  const el = e.target as HTMLElement | null
  if (el?.closest('input, textarea, select, [contenteditable=true], [role=menu]')) return
  if (e.key === 'ArrowRight' || e.key === 'j') nextSlide()
  else if (e.key === 'ArrowLeft' || e.key === 'k') prevSlide()
  else return
  e.preventDefault()
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))

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
    <!-- Empty State -->
    <div v-if="!slidesMarkdown" class="card px-6 py-16 text-center">
      <p class="eyebrow">投影片</p>
      <p class="mt-3 font-serif text-lg font-bold">還沒有投影片</p>
      <p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Agent 寫好投影片後，每一頁會自動出現在這裡。</p>
    </div>

    <template v-else>
      <!-- Toolbar: view, render check, whole-deck actions -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-3">
          <div class="inline-flex rounded-md border border-stone-300 p-0.5 text-xs dark:border-stone-700" role="group" aria-label="檢視方式">
            <button
              v-for="[v, label] in [['deck', '逐頁檢視'], ['markdown', '原始碼']] as const"
              :key="v"
              type="button"
              class="cursor-pointer rounded-[5px] px-3 py-1 font-medium transition-colors"
              :class="viewTab === v ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white'"
              :aria-pressed="viewTab === v"
              :data-testid="`view-${v}`"
              @click="viewTab = v"
            >
              {{ label }}
            </button>
          </div>
          <button
            v-if="checkSummary"
            type="button"
            class="inline-flex items-center gap-1.5 text-xs"
            :class="checkSummary.ok ? 'cursor-default text-emerald-700 dark:text-emerald-400' : 'cursor-pointer text-rose-700 hover:underline dark:text-rose-400'"
            :title="`檢查時間 ${checkSummary.time}${rendersStale ? '（之後簡報有修改）' : ''}${checkSummary.ok ? '' : '\n點一下跳到下一個有問題的頁面'}`"
            :disabled="checkSummary.ok"
            data-testid="check-summary"
            @click="nextFlagged"
          >
            <span class="h-1.5 w-1.5 rounded-full" :class="checkSummary.ok ? 'bg-emerald-500' : 'bg-rose-500'" aria-hidden="true" />
            版面檢查：{{ checkSummary.text }}
            <span v-if="rendersStale" class="text-stone-400">（已過時）</span>
          </button>
        </div>

        <div class="flex items-center gap-2">
          <button type="button" class="btn" title="下載整份簡報的原始碼（Markdown）" @click="downloadDeck">
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16" />
            </svg>
            下載 .md
          </button>
          <CopyButton :text="slidesMarkdown" label="複製全部" title="複製整份簡報的原始碼（Markdown）" />
        </div>
      </div>

      <ul v-if="checkSummary?.errors.length" class="space-y-1 rounded-md border border-rose-200 bg-rose-50/70 px-4 py-3 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
        <li class="font-semibold">整份簡報的錯誤（不屬於單一頁）：</li>
        <li v-for="e in checkSummary.errors" :key="e" class="break-all">{{ e }}</li>
      </ul>

      <!-- Whole Markdown source -->
      <div v-if="viewTab === 'markdown'" class="card p-4 sm:p-5">
        <pre class="max-h-[70vh] overflow-auto rounded-md bg-stone-50 p-4 font-mono text-xs leading-relaxed text-stone-800 dark:bg-stone-950/60 dark:text-stone-200"><code>{{ slidesMarkdown }}</code></pre>
      </div>

      <!-- Slide list beside the selected slide; a strip above it on narrow screens -->
      <div v-else class="grid grid-cols-1 items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-5">
        <div class="min-w-0 lg:sticky lg:top-20">
          <SlideSidebar :slides="slides" :selected-slide-index="selectedSlideIndex" @select="selectedSlideIndex = $event" />
        </div>
        <SlideDetailPane :slide="currentSlide" :total-slides="totalSlides" @prev="prevSlide" @next="nextSlide" />
      </div>
    </template>
  </div>
</template>
