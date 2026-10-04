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
      </div>

      <!-- Slide Preview Mockup -->
      <div>
        <div class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
          投影片版面即時檢視：
        </div>
        <div class="aspect-16/9 w-full overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white shadow-inner flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between text-xs text-slate-400">
              <span class="font-mono uppercase tracking-wider text-[11px]">{{ slide.layout }}</span>
              <span class="font-mono text-slate-400">#{{ slide.index }}</span>
            </div>
            <h2 class="mt-4 text-2xl font-bold tracking-tight text-white">
              {{ slide.title }}
            </h2>
            <div class="mt-4 max-h-[180px] overflow-y-auto font-mono text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
              {{ slide.content }}
            </div>
          </div>

          <div v-if="slide.visualTypes.length" class="mt-4 flex items-center gap-2 pt-2 border-t border-slate-700/60">
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
