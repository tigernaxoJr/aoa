<script setup lang="ts">
import { computed, ref } from 'vue'
import { parsedDeck, slidesMarkdown } from '../lib/store'
import CopyButton from './CopyButton.vue'

const viewMode = ref<'cards' | 'markdown'>('cards')
const slides = computed(() => parsedDeck.value.slides)
const totalSlides = computed(() => slides.value.length)

const visualSlidesCount = computed(() => {
  return slides.value.filter((s) => s.hasVisuals).length
})
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
        class="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 transition-all hover:border-indigo-400 hover:shadow-xs dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-indigo-500"
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
                class="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300"
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

        <!-- Speaker Notes if available -->
        <div
          v-if="slide.notes"
          class="mt-4 border-t border-slate-200/60 pt-2 text-[11px] text-slate-500 dark:border-slate-700/60 dark:text-slate-400"
        >
          <span class="font-medium text-amber-600 dark:text-amber-400">備忘錄：</span>
          <span class="line-clamp-2">{{ slide.notes }}</span>
        </div>
      </div>
    </div>

    <!-- Markdown Source View -->
    <div v-else class="mt-6">
      <pre class="max-h-[500px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200"><code>{{ slidesMarkdown }}</code></pre>
    </div>
  </div>
</template>
