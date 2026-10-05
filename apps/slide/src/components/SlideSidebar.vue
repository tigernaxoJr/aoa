<script setup lang="ts">
import { computed } from 'vue'
import type { ParsedSlide } from '../lib/slide-parser'
import { issuesOf, slideImages } from '../lib/store'

const props = defineProps<{
  slides: ParsedSlide[]
  selectedSlideIndex: number
}>()

const emit = defineEmits<{
  (e: 'select', index: number): void
}>()

const visualSlidesCount = computed(() => {
  return props.slides.filter((s) => s.hasVisuals).length
})
</script>

<template>
  <div class="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
    <div class="mb-3 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
      <div>
        <h3 class="text-sm font-semibold text-slate-900 dark:text-white">簡報分頁清單</h3>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">
          共 {{ slides.length }} 頁 · {{ visualSlidesCount }} 頁有視覺組件
        </p>
      </div>
    </div>

    <!-- Empty slides list -->
    <div
      v-if="!slides.length"
      class="py-8 text-center text-xs text-slate-400 dark:text-slate-500"
    >
      尚未解析到分頁內容
    </div>

    <!-- Slide items -->
    <div v-else class="space-y-2 max-h-[calc(100vh-13rem)] overflow-y-auto pr-1">
      <div
        v-for="slide in slides"
        :key="slide.index"
        @click="emit('select', slide.index)"
        class="group relative flex cursor-pointer flex-col justify-between rounded-xl border p-3 transition-all text-left min-h-[115px]"
        :class="[
          selectedSlideIndex === slide.index
            ? 'border-sky-500 bg-sky-50/60 shadow-xs dark:border-sky-400 dark:bg-sky-950/40'
            : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-slate-700 dark:hover:bg-slate-800'
        ]"
      >
        <div>
          <div class="flex items-center justify-between gap-1">
            <span
              class="font-mono text-xs font-bold"
              :class="selectedSlideIndex === slide.index ? 'text-sky-700 dark:text-sky-300' : 'text-slate-500 dark:text-slate-400'"
            >
              #{{ slide.index }}
            </span>

            <div class="flex flex-wrap items-center gap-1">
              <span
                v-if="issuesOf(slide.index).length"
                class="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/60 dark:text-rose-300"
                :title="issuesOf(slide.index).map((i) => i.message).join('\n')"
              >
                {{ issuesOf(slide.index).length }} 個問題
              </span>
              <span class="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {{ slide.layout }}
              </span>
              <span
                v-for="vt in slide.visualTypes"
                :key="vt"
                class="rounded border border-sky-200 bg-sky-50 px-1 py-0.5 text-[9px] font-medium text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300"
              >
                {{ vt }}
              </span>
            </div>
          </div>

          <h4
            class="mt-1.5 text-xs font-semibold line-clamp-1"
            :class="selectedSlideIndex === slide.index ? 'text-sky-900 dark:text-sky-100' : 'text-slate-900 dark:text-white'"
          >
            {{ slide.title }}
          </h4>

          <img
            v-if="slideImages.get(slide.index)"
            :src="slideImages.get(slide.index)!.url"
            :alt="`第 ${slide.index} 頁縮圖`"
            loading="lazy"
            class="mt-2 w-full rounded-md border border-slate-200 dark:border-slate-700"
          />
          <p v-else class="mt-1 text-[11px] leading-relaxed text-slate-500 line-clamp-2 dark:text-slate-400 font-mono">
            {{ slide.content }}
          </p>
        </div>

        <div v-if="slide.notes" class="mt-2 text-[10px] text-amber-700 dark:text-amber-400 line-clamp-1 border-t border-slate-200/50 pt-1 dark:border-slate-700/50">
          備忘錄：{{ slide.notes }}
        </div>
      </div>
    </div>
  </div>
</template>
