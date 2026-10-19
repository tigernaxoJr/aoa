<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { layoutLabel, visualLabel } from '../lib/labels'
import type { ParsedSlide } from '../lib/slide-parser'
import { issuesOf, slideImages } from '../lib/store'

const props = defineProps<{
  slides: ParsedSlide[]
  selectedSlideIndex: number
}>()

const emit = defineEmits<{
  (e: 'select', index: number): void
}>()

// Keep the selected slide in view when it changes from the keyboard or the detail pane's arrows; only the
// list scrolls (a strip on narrow screens, a column on wide ones), never the page.
const list = ref<HTMLElement | null>(null)
watch(
  () => props.selectedSlideIndex,
  (no) =>
    nextTick(() => {
      const box = list.value
      const item = box?.querySelector<HTMLElement>(`[data-slide="${no}"]`)
      if (!box || !item) return
      const left = item.offsetLeft - box.offsetLeft
      const top = item.offsetTop - box.offsetTop
      box.scrollTo({
        left: left < box.scrollLeft ? left : Math.max(box.scrollLeft, left + item.offsetWidth - box.clientWidth),
        top: top < box.scrollTop ? top : Math.max(box.scrollTop, top + item.offsetHeight - box.clientHeight),
        behavior: 'smooth',
      })
    }),
)
</script>

<template>
  <nav class="card min-w-0 p-2" aria-label="投影片清單">
    <p v-if="!slides.length" class="py-8 text-center text-xs text-stone-400">尚未解析到分頁內容</p>

    <ol
      v-else
      ref="list"
      class="flex gap-2 overflow-x-auto pb-1 lg:block lg:max-h-[calc(100vh-11rem)] lg:space-y-1 lg:overflow-x-visible lg:overflow-y-auto lg:pb-0"
    >
      <li v-for="slide in slides" :key="slide.index" class="w-40 shrink-0 lg:w-auto" :data-slide="slide.index">
        <button
          type="button"
          class="relative flex h-full w-full cursor-pointer flex-col gap-1 rounded-md border px-3 py-2.5 text-left transition-colors"
          :class="
            selectedSlideIndex === slide.index
              ? 'border-stone-300 bg-stone-100 dark:border-stone-700 dark:bg-stone-800'
              : 'border-transparent hover:bg-stone-50 dark:hover:bg-stone-800/50'
          "
          :aria-current="selectedSlideIndex === slide.index ? 'true' : undefined"
          :data-testid="`slide-${slide.index}`"
          @click="emit('select', slide.index)"
        >
          <span v-if="selectedSlideIndex === slide.index" class="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" aria-hidden="true" />
          <span class="flex items-center gap-2">
            <span class="font-mono text-[11px]" :class="selectedSlideIndex === slide.index ? 'text-accent' : 'text-stone-400'">{{ String(slide.index).padStart(2, '0') }}</span>
            <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ slide.title }}</span>
            <span
              v-if="issuesOf(slide.index).length"
              class="shrink-0 rounded-sm bg-rose-100 px-1 font-mono text-[10px] font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300"
              :title="issuesOf(slide.index).map((i) => i.message).join('\n')"
              data-testid="slide-issues"
            >
              {{ issuesOf(slide.index).length }}
            </span>
          </span>
          <img
            v-if="slideImages.get(slide.index)"
            :src="slideImages.get(slide.index)!.url"
            :alt="`第 ${slide.index} 頁縮圖`"
            loading="lazy"
            class="mt-1 hidden w-full rounded-sm border border-stone-200 lg:block dark:border-stone-700"
          />
          <span class="truncate pl-[26px] text-[11px] text-stone-500 dark:text-stone-400">
            {{ [layoutLabel(slide.layout), ...slide.visualTypes.map(visualLabel)].join(' · ') }}<template v-if="slide.notes"> · 備忘錄</template>
          </span>
        </button>
      </li>
    </ol>
  </nav>
</template>
