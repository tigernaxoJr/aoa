<script setup lang="ts">
import { computed } from 'vue'
import { layoutLabel, visualLabel } from '../lib/labels'
import type { ParsedSlide } from '../lib/slide-parser'
import { issuesOf, rendersStale, slideImages } from '../lib/store'
import CopyButton from './CopyButton.vue'
import IssueList from './IssueList.vue'

const props = defineProps<{
  slide: ParsedSlide | null
  totalSlides: number
}>()

const emit = defineEmits<{
  (e: 'prev'): void
  (e: 'next'): void
}>()

function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const image = computed(() => (props.slide ? slideImages.value.get(props.slide.index) : undefined))
const issues = computed(() => (props.slide ? issuesOf(props.slide.index) : []))

const canPrev = computed(() => !!props.slide && props.slide.index > 1)
const canNext = computed(() => !!props.slide && props.slide.index < props.totalSlides)

/** What to tell the Agent about this slide's render problems. */
const fixRequest = computed(() => {
  if (!props.slide || !issues.value.length) return ''
  const what = issues.value.map((i) => i.message).join('；')
  return `第 ${props.slide.index} 頁「${props.slide.title}」版面檢查有問題：${what}。請修正後更新預覽畫面。（pnpm run check）`
})

const slideBackgroundStyle = computed(() => {
  if (!props.slide?.background) return {}
  const bg = props.slide.background
  if (bg.startsWith('http://') || bg.startsWith('https://') || bg.startsWith('data:') || bg.startsWith('/')) {
    return {
      backgroundImage: `url('${bg}')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  return {
    background: bg,
  }
})

const slideThemeGradient = computed(() => {
  if (props.slide?.background) return ''
  if (props.slide?.layout === 'cover') return 'bg-gradient-to-br from-stone-950 via-stone-900 to-stone-800'
  return 'bg-stone-900'
})
</script>

<template>
  <article class="card min-w-0">
    <div v-if="!slide" class="py-16 text-center text-sm text-stone-400">從清單點選一頁來檢視</div>

    <template v-else>
      <!-- Header: position, title, page actions -->
      <header class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-stone-200 px-4 py-3 sm:px-5 dark:border-stone-800">
        <div class="flex min-w-0 items-center gap-1">
          <button type="button" class="icon-btn" :disabled="!canPrev" title="上一頁（← 或 K）" aria-label="上一頁" data-testid="slide-prev" @click="emit('prev')">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m15 18-6-6 6-6" /></svg>
          </button>
          <span class="font-mono text-xs text-stone-500 tabular-nums" data-testid="slide-position">
            <span class="text-accent">{{ String(slide.index).padStart(2, '0') }}</span> / {{ String(totalSlides).padStart(2, '0') }}
          </span>
          <button type="button" class="icon-btn" :disabled="!canNext" title="下一頁（→ 或 J）" aria-label="下一頁" data-testid="slide-next" @click="emit('next')">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m9 18 6-6-6-6" /></svg>
          </button>
          <h2 class="ml-2 min-w-0 truncate font-serif text-lg font-bold" data-testid="slide-title">{{ slide.title }}</h2>
        </div>

        <div class="flex items-center gap-1.5">
          <CopyButton :text="slide.rawMarkdown" label="複製本頁" title="複製這一頁的 Markdown" />
          <button type="button" class="icon-btn" title="下載這一頁的 Markdown" aria-label="下載這一頁的 Markdown" @click="downloadMarkdown(slide.rawMarkdown, `slide-${slide.index}.md`)">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16" /></svg>
          </button>
        </div>
      </header>

      <div class="space-y-5 p-4 sm:p-5">
        <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
          <span :title="`layout: ${slide.layout}`">版型：<span class="text-stone-800 dark:text-stone-200">{{ layoutLabel(slide.layout) }}</span></span>
          <span v-if="slide.visualTypes.length">視覺：<span class="text-stone-800 dark:text-stone-200">{{ slide.visualTypes.map(visualLabel).join('、') }}</span></span>
          <span v-if="slide.background" :title="slide.background">已設定背景</span>
        </p>

        <div v-if="issues.length" class="space-y-2" data-testid="slide-fix">
          <IssueList :issues="issues" />
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p class="min-w-0 flex-1 text-xs text-stone-500 dark:text-stone-400">把這句話交給 Agent，請它修正這一頁：</p>
            <CopyButton :text="fixRequest" label="複製修正請求" />
          </div>
        </div>

        <!-- Real render from `pnpm run check` / `pnpm run export:png` -->
        <figure v-if="image">
          <img :src="image.url" :alt="`第 ${slide.index} 頁實際畫面`" class="w-full rounded-md border border-stone-200 dark:border-stone-800" />
          <figcaption class="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
            <span class="eyebrow">實際畫面</span>
            <span v-if="rendersStale" class="text-amber-700 dark:text-amber-400">簡報在截圖後改過，畫面可能不是最新的</span>
          </figcaption>
        </figure>

        <!-- Markdown approximation until there is a real render -->
        <figure v-else>
          <div
            class="relative flex aspect-video w-full flex-col overflow-hidden rounded-md border border-stone-200 p-6 dark:border-stone-700 text-white sm:p-8"
            :class="slideThemeGradient"
            :style="slideBackgroundStyle"
          >
            <div v-if="slide.background" class="pointer-events-none absolute inset-0 bg-stone-950/65" />
            <div class="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div v-if="slide.renderedHtml" class="slide-preview-html text-sm leading-relaxed text-stone-200" v-html="slide.renderedHtml"></div>
              <div v-else>
                <h2 class="mb-2 text-2xl font-bold tracking-tight">{{ slide.title }}</h2>
                <div class="text-xs leading-relaxed text-stone-300">{{ slide.content }}</div>
              </div>
            </div>
          </div>
          <figcaption class="mt-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
            <span class="eyebrow mr-2">近似預覽</span>只排出文字與欄位，不含主題；圖表與組件以框代替。請 Agent 更新預覽畫面，這裡就會換成實際畫面。
          </figcaption>
        </figure>

        <!-- Speaker Notes -->
        <section v-if="slide.notes" class="border-l-2 border-accent pl-4">
          <h3 class="eyebrow">講者備忘錄</h3>
          <p class="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-stone-700 dark:text-stone-300">{{ slide.notes }}</p>
        </section>

        <details class="group">
          <summary class="eyebrow cursor-pointer select-none hover:text-stone-900 dark:hover:text-white">本頁原始碼</summary>
          <pre class="mt-2 max-h-[300px] overflow-auto rounded-md bg-stone-50 p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-stone-800 dark:bg-stone-950/60 dark:text-stone-200"><code>{{ slide.rawMarkdown }}</code></pre>
        </details>
      </div>
    </template>
  </article>
</template>

<style scoped>
.slide-preview-html :deep(h1) {
  font-size: 1.5rem;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 0.5rem;
}
.slide-preview-html :deep(h2) {
  font-size: 1.25rem;
  font-weight: 700;
  color: #ffffff;
  margin-top: 0.75rem;
  margin-bottom: 0.5rem;
}
.slide-preview-html :deep(h3) {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-accent);
  margin-top: 0.5rem;
  margin-bottom: 0.25rem;
}
.slide-preview-html :deep(p) {
  margin-bottom: 0.5rem;
  color: var(--color-stone-300);
}
.slide-preview-html :deep(ul) {
  list-style-type: disc;
  padding-left: 1.25rem;
  margin-bottom: 0.5rem;
  color: var(--color-stone-300);
}
.slide-preview-html :deep(ol) {
  list-style-type: decimal;
  padding-left: 1.25rem;
  margin-bottom: 0.5rem;
  color: var(--color-stone-300);
}
.slide-preview-html :deep(li) {
  margin-bottom: 0.25rem;
}
.slide-preview-html :deep(code) {
  background-color: rgb(255 255 255 / 0.08);
  padding: 0.15rem 0.35rem;
  border-radius: 0.25rem;
  font-size: 0.8em;
  color: var(--color-stone-100);
  font-family: var(--font-mono);
}
.slide-preview-html :deep(pre) {
  margin-bottom: 0.5rem;
  overflow-x: auto;
  border-radius: 0.375rem;
  background-color: rgb(255 255 255 / 0.06);
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  line-height: 1.6;
}
.slide-preview-html :deep(pre code) {
  background-color: transparent;
  padding: 0;
  font-size: inherit;
}
/* Slidev's named slots (::right::) side by side, as its two-column layouts place them. */
.slide-preview-html :deep(.slide-cols) {
  display: flex;
  gap: 1.5rem;
}
.slide-preview-html :deep(.slide-cols > div) {
  min-width: 0;
  flex: 1 1 0;
}
/* What only the real render can draw (diagrams, components), named instead of shown as source. */
.slide-preview-html :deep(.slide-placeholder) {
  display: inline-flex;
  align-items: center;
  border: 1px dashed rgb(255 255 255 / 0.3);
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  color: var(--color-stone-400);
}
.slide-preview-html :deep(blockquote) {
  border-left: 2px solid var(--color-accent);
  padding-left: 0.75rem;
  margin: 0.5rem 0;
  color: var(--color-stone-400);
}
</style>
