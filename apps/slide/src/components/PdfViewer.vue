<script setup lang="ts">
import { computed } from 'vue'
import { hasHtml, hasPdf, htmlFile, htmlUrl, pdfFile, pdfUrl } from '../lib/store'

const hasAnyOutput = computed(() => hasPdf.value || hasHtml.value)

const formattedPdfSize = computed(() => {
  if (!pdfFile.value) return ''
  const bytes = pdfFile.value.size
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
})

const formattedPdfTime = computed(() => {
  if (!pdfFile.value) return ''
  return new Date(pdfFile.value.lastModified).toLocaleString('zh-TW', { hour12: false })
})

const formattedHtmlSize = computed(() => {
  if (!htmlFile.value) return ''
  const bytes = htmlFile.value.size
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
})
</script>

<template>
  <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
      <div>
        <h3 class="font-semibold text-slate-900 dark:text-white">簡報成果 (PDF &amp; 互動 HTML)</h3>
        <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          包含高品質向量 PDF 以及可直接全螢幕放映的單檔 HTML 互動簡報
        </p>
      </div>

      <div v-if="hasAnyOutput" class="flex flex-wrap items-center gap-2">
        <a
          v-if="hasHtml"
          :href="htmlUrl!"
          target="_blank"
          class="inline-flex items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-3.5 py-2 text-xs font-semibold text-sky-700 shadow-xs hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300 dark:hover:bg-sky-900/60 transition-colors cursor-pointer"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          在新視窗放映 HTML ({{ formattedHtmlSize }})
        </a>

        <a
          v-if="hasHtml"
          :href="htmlUrl!"
          download="slides.html"
          class="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          下載 HTML
        </a>

        <a
          v-if="hasPdf"
          :href="pdfUrl!"
          download="slides.pdf"
          class="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 active:bg-slate-950 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:active:bg-slate-200 cursor-pointer transition-colors"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          下載 PDF ({{ formattedPdfSize }})
        </a>
      </div>
    </div>

    <!-- HTML / PDF Viewer Frame -->
    <div v-if="hasHtml || hasPdf" class="mt-6 space-y-4">
      <div v-if="hasHtml" class="rounded-xl border border-slate-200 p-4 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/40 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </span>
          <div>
            <div class="text-xs font-semibold text-slate-900 dark:text-white">單檔互動 HTML 簡報已就緒</div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400">含完整動畫、v-click 與演講者模式，離線開箱即播，最適合現場投影使用。</div>
          </div>
        </div>
        <a
          :href="htmlUrl!"
          target="_blank"
          class="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 transition-colors"
        >
          全螢幕放映 ↗
        </a>
      </div>

      <div v-if="hasPdf" class="space-y-2">
        <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>PDF 預覽 ({{ formattedPdfSize }} · {{ formattedPdfTime }})</span>
        </div>
        <iframe
          :src="pdfUrl!"
          class="h-[600px] w-full rounded-xl border border-slate-200 shadow-inner dark:border-slate-800"
          title="PDF Preview"
        ></iframe>
      </div>
    </div>

    <!-- Empty / Waiting State -->
    <div v-else class="py-12 text-center">
      <div class="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h4 class="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">尚未產生匯出檔案</h4>
      <p class="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
        當簡報撰寫與視覺完成後，Agent 將自動匯出 PDF 或單檔互動 HTML（亦可直接請 Agent 匯出），此處將即時顯示成果與放映連結。
      </p>
    </div>
  </div>
</template>
