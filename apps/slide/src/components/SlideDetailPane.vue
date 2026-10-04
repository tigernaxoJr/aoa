<script setup lang="ts">
import { computed } from 'vue'
import type { ParsedSlide } from '../lib/slide-parser'
import CopyButton from './CopyButton.vue'

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

const canPrev = computed(() => !!props.slide && props.slide.index > 1)
const canNext = computed(() => !!props.slide && props.slide.index < props.totalSlides)

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
  if (props.slide?.layout === 'cover') {
    return 'bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950'
  }
  return 'bg-gradient-to-br from-slate-900 to-slate-800'
})
</script>

<template>
  <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
    <div v-if="!slide" class="py-16 text-center text-slate-400 dark:text-slate-500">
      <svg class="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
      <p class="mt-3 text-sm font-medium">請從左側點選分頁以檢視詳細內容</p>
    </div>

    <div v-else class="space-y-6">
      <!-- Header: Controls & Navigation -->
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div class="flex items-center gap-2">
          <span class="rounded-md bg-slate-100 px-2.5 py-1 font-mono text-sm font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            #{{ slide.index }}
          </span>
          <span class="text-xs text-slate-400">/ {{ totalSlides }}</span>
          <h3 class="text-base font-bold text-slate-900 dark:text-white line-clamp-1 ml-1">
            {{ slide.title }}
          </h3>
        </div>

        <div class="flex items-center gap-2">
          <!-- Prev / Next navigation -->
          <div class="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              :disabled="!canPrev"
              @click="emit('prev')"
              title="上一頁"
              class="rounded-md p-1.5 text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-700 cursor-pointer"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              :disabled="!canNext"
              @click="emit('next')"
              title="下一頁"
              class="rounded-md p-1.5 text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-700 cursor-pointer"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            @click="downloadMarkdown(slide.rawMarkdown, `slide-${slide.index}.md`)"
            title="下載此頁 Markdown"
            class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            下載單頁 .md
          </button>

          <CopyButton
            :text="slide.rawMarkdown"
            label="複製本頁"
          />
        </div>
      </div>

      <!-- Metadata Badges -->
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-slate-500">版面配置 (Layout)：</span>
        <span class="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {{ slide.layout }}
        </span>

        <span v-if="slide.visualTypes.length" class="text-xs text-slate-500 ml-2">視覺元素：</span>
        <span
          v-for="vt in slide.visualTypes"
          :key="vt"
          class="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300"
        >
          {{ vt }}
        </span>

        <span
          v-if="slide.background"
          class="rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
          :title="slide.background"
        >
          🖼️ 背景已設定
        </span>
      </div>

      <!-- Slide Preview Mockup -->
      <div>
        <div class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
          投影片版面即時檢視：
        </div>
        <!-- 16:9 Presentation Stage Mockup -->
        <div
          class="aspect-16/9 w-full min-h-[340px] max-h-[520px] overflow-hidden rounded-xl border border-slate-200/80 p-6 sm:p-8 text-white shadow-md flex flex-col justify-between transition-colors relative"
          :class="slideThemeGradient"
          :style="slideBackgroundStyle"
        >
          <!-- Background image overlay if background image exists -->
          <div
            v-if="slide.background"
            class="absolute inset-0 bg-slate-950/65 backdrop-blur-[1px] -z-0 pointer-events-none"
          ></div>

          <!-- Slide content scrollable body with flex-1 -->
          <div class="flex-1 overflow-y-auto pr-2 relative z-10 min-h-0 flex flex-col">
            <div class="flex items-center justify-between text-xs text-slate-400 mb-3 border-b border-slate-800 pb-2 shrink-0">
              <span class="font-mono uppercase tracking-wider text-[11px]">{{ slide.layout }}</span>
              <span class="font-mono text-slate-400">#{{ slide.index }}</span>
            </div>
            
            <div
              v-if="slide.renderedHtml"
              class="slide-preview-html text-slate-200 text-sm leading-relaxed"
              v-html="slide.renderedHtml"
            ></div>
            <div v-else>
              <h2 class="text-2xl font-bold tracking-tight text-white mb-2">
                {{ slide.title }}
              </h2>
              <div class="text-xs leading-relaxed text-slate-300">
                {{ slide.content }}
              </div>
            </div>
          </div>

          <div v-if="slide.visualTypes.length" class="mt-3 flex items-center gap-2 pt-2 border-t border-slate-700/60 shrink-0 relative z-10">
            <span class="text-[10px] text-slate-400">視覺組件:</span>
            <span v-for="vt in slide.visualTypes" :key="vt" class="rounded bg-sky-500/20 px-2 py-0.5 text-[10px] text-sky-300">
              {{ vt }}
            </span>
          </div>
        </div>
      </div>

      <!-- Speaker Notes -->
      <div v-if="slide.notes" class="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs dark:border-amber-900/60 dark:bg-amber-950/40">
        <span class="font-semibold text-amber-800 dark:text-amber-300">演講者備忘錄 (Speaker Notes)：</span>
        <p class="mt-1.5 leading-relaxed text-amber-900 dark:text-amber-200 whitespace-pre-wrap">{{ slide.notes }}</p>
      </div>

      <!-- Raw Markdown Content -->
      <div>
        <div class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
          本頁 Markdown 原始語法：
        </div>
        <pre class="max-h-[250px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 whitespace-pre-wrap break-words"><code>{{ slide.rawMarkdown }}</code></pre>
      </div>
    </div>
  </div>
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
  color: #38bdf8;
  margin-top: 0.5rem;
  margin-bottom: 0.25rem;
}
.slide-preview-html :deep(p) {
  margin-bottom: 0.5rem;
  color: #cbd5e1;
}
.slide-preview-html :deep(ul) {
  list-style-type: disc;
  padding-left: 1.25rem;
  margin-bottom: 0.5rem;
  color: #cbd5e1;
}
.slide-preview-html :deep(ol) {
  list-style-type: decimal;
  padding-left: 1.25rem;
  margin-bottom: 0.5rem;
  color: #cbd5e1;
}
.slide-preview-html :deep(li) {
  margin-bottom: 0.25rem;
}
.slide-preview-html :deep(code) {
  background-color: rgba(30, 41, 59, 0.8);
  padding: 0.15rem 0.35rem;
  border-radius: 0.25rem;
  font-size: 0.8em;
  color: #38bdf8;
  font-family: monospace;
}
.slide-preview-html :deep(blockquote) {
  border-left: 3px solid #38bdf8;
  padding-left: 0.75rem;
  margin: 0.5rem 0;
  color: #94a3b8;
  font-style: italic;
}
</style>
