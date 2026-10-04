<script setup lang="ts">
import { computed } from 'vue'
import { pdfFile, pdfUrl } from '../lib/store'
import CopyButton from './CopyButton.vue'

const hasPdf = computed(() => !!pdfFile.value && !!pdfUrl.value)

const formattedSize = computed(() => {
  if (!pdfFile.value) return ''
  const bytes = pdfFile.value.size
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
})

const formattedTime = computed(() => {
  if (!pdfFile.value) return ''
  return new Date(pdfFile.value.lastModified).toLocaleString('zh-TW', { hour12: false })
})

const exportCommand = 'pnpm run export'
</script>

<template>
  <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
      <div>
        <h3 class="font-semibold text-slate-900 dark:text-white">PDF 產物</h3>
        <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Slidev 以本機 Playwright 匯出；文字與 SVG 為向量，3D（WebGL）畫面為高解析點陣圖
        </p>
      </div>

      <div v-if="hasPdf" class="flex items-center gap-3">
        <span class="text-xs text-slate-500 dark:text-slate-400 font-mono">
          大小：{{ formattedSize }} · 匯出於：{{ formattedTime }}
        </span>
        <a
          :href="pdfUrl!"
          download="slides.pdf"
          class="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 active:bg-slate-950 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:active:bg-slate-200 cursor-pointer transition-colors"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          下載 PDF
        </a>
      </div>
    </div>

    <!-- PDF Viewer Frame if PDF exists -->
    <div v-if="hasPdf" class="mt-6">
      <iframe
        :src="pdfUrl!"
        class="h-[600px] w-full rounded-xl border border-slate-200 shadow-inner dark:border-slate-800"
        title="PDF Preview"
      ></iframe>
    </div>

    <!-- Empty / Waiting State -->
    <div v-else class="py-12 text-center">
      <div class="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h4 class="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">尚未產生 output/slides.pdf</h4>
      <p class="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
        當簡報撰寫與視覺注入完成後，Agent 或使用者在終端機執行匯出指令，前端將自動偵測並呈現 PDF 預覽。
      </p>

      <div class="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-800/50">
        <span class="font-mono text-xs text-slate-700 dark:text-slate-300">{{ exportCommand }}</span>
        <CopyButton :text="exportCommand" label="複製指令" />
      </div>
    </div>
  </div>
</template>
