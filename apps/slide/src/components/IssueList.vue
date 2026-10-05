<script setup lang="ts">
import type { SlideIssue } from '../lib/store'

defineProps<{ issues: SlideIssue[] }>()

const LABELS: Record<SlideIssue['type'], string> = {
  overflow: '超出版面',
  clipped: '文字截斷',
  unresolved: '找不到組件',
  image: '圖片失敗',
  canvas: '空白畫布',
  compile: '無法編譯',
  runtime: '執行錯誤',
  render: '未渲染',
}
</script>

<template>
  <ul
    v-if="issues.length"
    class="space-y-1.5 rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs dark:border-rose-900/60 dark:bg-rose-950/30"
  >
    <li v-for="(issue, i) in issues" :key="i" class="flex items-start gap-2">
      <span class="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-700 dark:bg-rose-900/60 dark:text-rose-300">
        {{ LABELS[issue.type] }}
      </span>
      <span class="leading-relaxed text-rose-900 break-all dark:text-rose-200">{{ issue.message }}</span>
    </li>
  </ul>
</template>
