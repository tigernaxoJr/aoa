<script setup lang="ts">
import { computed, ref } from 'vue'
import { parsedDeck, project, slidesMarkdown } from '../lib/store'
import type { ParsedSlide } from '../lib/slide-parser'
import CopyButton from './CopyButton.vue'

const viewMode = ref<'cards' | 'markdown'>('cards')
const selectedSlide = ref<ParsedSlide | null>(null)
const slides = computed(() => parsedDeck.value.slides)
const totalSlides = computed(() => slides.value.length)

const visualSlidesCount = computed(() => {
  return slides.value.filter((s) => s.hasVisuals).length
})

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
  <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <!-- Header with Stats & Toggle -->
    <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
      <div>
        <h3 class="font-semibold text-slate-900 dark:text-white">簡報內容預覽 (Slide Deck)</h3>
        <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          共 {{ totalSlides }} 頁 · {{ visualSlidesCount }} 頁包含 SVG / 3D 視覺組件
        </p>
      </div>

      <div class="flex items-center gap-2">
        <div class="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            @click="viewMode = 'cards'"
            class="rounded-md px-3 py-1 font-medium transition-colors cursor-pointer"
            :class="[
              viewMode === 'cards'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            ]"
          >
            分頁卡片
          </button>
          <button
            type="button"
            @click="viewMode = 'markdown'"
            class="rounded-md px-3 py-1 font-medium transition-colors cursor-pointer"
            :class="[
              viewMode === 'markdown'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            ]"
          >
            Markdown 原文
          </button>
        </div>

        <button
          v-if="slidesMarkdown"
          type="button"
          @click="downloadDeck"
          title="下載整份 slides.md"
          class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors cursor-pointer"
        >
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          下載 .md
        </button>

        <CopyButton
          v-if="slidesMarkdown"
          :text="slidesMarkdown"
          label="複製 slides.md"
        />
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-if="!slidesMarkdown"
      class="py-12 text-center text-slate-400 dark:text-slate-500"
    >
      <svg class="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
      <p class="mt-3 text-sm font-medium">尚未偵測到 slides.md</p>
      <p class="mt-1 text-xs">當 Coding Agent 依指令編寫簡報後，此處將自動呈現即時分頁預覽。</p>
    </div>

    <!-- Cards View -->
    <div
      v-else-if="viewMode === 'cards'"
      class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <div
        v-for="slide in slides"
        :key="slide.index"
        class="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 transition-all hover:border-slate-400 hover:shadow-xs dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-slate-600"
      >
        <div>
          <!-- Card Header: Page Number, Layout, Visual Badges -->
          <div class="flex items-center justify-between gap-1 border-b border-slate-200/60 pb-2.5 dark:border-slate-700/60">
            <span class="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
              #{{ slide.index }}
            </span>
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {{ slide.layout }}
              </span>
              <span
                v-for="vt in slide.visualTypes"
                :key="vt"
                class="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {{ vt }}
              </span>
            </div>
          </div>

          <!-- Slide Title -->
          <h4 class="mt-3 text-sm font-semibold text-slate-900 line-clamp-1 dark:text-white">
            {{ slide.title }}
          </h4>

          <!-- Slide Content Snippet -->
          <p class="mt-2 text-xs leading-relaxed text-slate-600 line-clamp-4 dark:text-slate-300 font-mono">
            {{ slide.content }}
          </p>
        </div>

        <!-- Speaker Notes & Action Buttons -->
        <div class="mt-4 border-t border-slate-200/60 pt-2.5 dark:border-slate-700/60 flex flex-col gap-2">
          <div
            v-if="slide.notes"
            class="text-[11px] text-slate-500 dark:text-slate-400"
          >
            <span class="font-medium text-amber-600 dark:text-amber-400">備忘錄：</span>
            <span class="line-clamp-2">{{ slide.notes }}</span>
          </div>

          <div class="flex items-center justify-between pt-1">
            <button
              type="button"
              @click="selectedSlide = slide"
              class="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 cursor-pointer"
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              詳細檢視
            </button>

            <button
              type="button"
              @click="downloadMarkdown(slide.rawMarkdown, `slide-${slide.index}.md`)"
              title="下載此頁 Markdown"
              class="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
            >
              <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              下載單頁
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Markdown Source View -->
    <div v-else class="mt-6">
      <pre class="max-h-[500px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200"><code>{{ slidesMarkdown }}</code></pre>
    </div>

    <!-- Slide Details Modal -->
    <div
      v-if="selectedSlide"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      @click.self="selectedSlide = null"
    >
      <div class="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div class="flex items-center gap-2.5">
            <span class="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              #{{ selectedSlide.index }}
            </span>
            <h4 class="font-semibold text-slate-900 dark:text-white">
              {{ selectedSlide.title }}
            </h4>
          </div>
          <button
            type="button"
            @click="selectedSlide = null"
            class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Modal Body -->
        <div class="overflow-y-auto p-6 space-y-4">
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-500">版型：</span>
            <span class="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {{ selectedSlide.layout }}
            </span>
            <span v-for="vt in selectedSlide.visualTypes" :key="vt" class="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300">
              {{ vt }}
            </span>
          </div>

          <div>
            <div class="text-xs font-medium text-slate-500 mb-1.5">內文原始內容：</div>
            <pre class="max-h-[300px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 whitespace-pre-wrap break-words"><code>{{ selectedSlide.content }}</code></pre>
          </div>

          <div v-if="selectedSlide.notes" class="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 text-xs dark:border-amber-900/60 dark:bg-amber-950/40">
            <span class="font-semibold text-amber-800 dark:text-amber-300">演講者備忘錄 (Speaker Notes)：</span>
            <p class="mt-1 text-amber-900 dark:text-amber-200">{{ selectedSlide.notes }}</p>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-6 py-3 dark:border-slate-800 dark:bg-slate-950/60">
          <button
            type="button"
            @click="downloadMarkdown(selectedSlide.rawMarkdown, `slide-${selectedSlide.index}.md`)"
            class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            下載此頁 Markdown
          </button>

          <button
            type="button"
            @click="selectedSlide = null"
            class="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition-colors"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
