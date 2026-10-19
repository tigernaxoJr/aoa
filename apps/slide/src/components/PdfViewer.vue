<script setup lang="ts">
import { computed } from 'vue'
import { hasHtml, hasPdf, htmlFile, htmlStandalone, htmlUrl, pdfFile, pdfUrl } from '../lib/store'

const hasAnyOutput = computed(() => hasPdf.value || hasHtml.value)
/** Only a single-file build plays from the folder; a split build opens blank. */
const playableHtml = computed(() => hasHtml.value && htmlStandalone.value)

function size(file: File | null) {
  if (!file) return ''
  const bytes = file.size
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
const time = (file: File | null) => (file ? new Date(file.lastModified).toLocaleString('zh-TW', { hour12: false }) : '')
</script>

<template>
  <div class="space-y-4">
    <!-- Empty / Waiting State -->
    <div v-if="!hasAnyOutput" class="card px-6 py-16 text-center">
      <p class="eyebrow">output/</p>
      <p class="mt-3 font-serif text-lg font-bold">還沒有匯出檔案</p>
      <p class="mx-auto mt-1 max-w-md text-sm leading-relaxed text-stone-500 dark:text-stone-400">
        投影片確認後，請 Agent 匯出 PDF 與單檔 HTML。檔案出現在資料夾後，這裡可以直接下載或全螢幕放映。
      </p>
    </div>

    <template v-else>
      <div class="grid gap-px overflow-hidden rounded-md border border-stone-300 bg-stone-300 sm:grid-cols-2 dark:border-stone-700 dark:bg-stone-700">
        <!-- Interactive HTML -->
        <section class="flex flex-col gap-3 bg-white p-5 dark:bg-stone-900">
          <p class="eyebrow">單檔 HTML</p>
          <div>
            <h3 class="font-serif text-lg font-bold">互動 HTML</h3>
            <p class="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">含動畫、逐步顯示與演講者模式，離線也能播放，適合現場投影。</p>
          </div>
          <div v-if="playableHtml" class="mt-auto flex flex-wrap items-center gap-2">
            <a :href="htmlUrl!" target="_blank" rel="noopener" class="btn-primary" data-testid="play-html">全螢幕放映 ↗</a>
            <a :href="htmlUrl!" download="slides.html" class="btn">下載 HTML</a>
            <span class="font-mono text-[11px] text-stone-400">{{ size(htmlFile) }}</span>
          </div>
          <p v-else-if="!hasHtml" class="mt-auto text-xs text-stone-400">尚未匯出</p>
          <div v-else class="mt-auto rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
            <p class="font-semibold">這是拆檔的網頁版，無法從這裡開啟</p>
            <p class="mt-1">
              它需要旁邊的 assets/，只能透過網頁伺服器播放（在專案資料夾執行 <code class="font-mono">npx serve dist</code>）。請 Agent 依 slidev-deck Skill 的匯出指南改用單檔輸出（新版範本的
              <code class="font-mono">vite.config.ts</code> 與 <code class="font-mono">slides.md</code> 的 <code class="font-mono">routerMode: hash</code>），再執行
              <code class="font-mono">pnpm run build</code>，就能直接放映。
            </p>
          </div>
        </section>

        <!-- PDF -->
        <section class="flex flex-col gap-3 bg-white p-5 dark:bg-stone-900">
          <p class="eyebrow">output/slides.pdf</p>
          <div>
            <h3 class="font-serif text-lg font-bold">PDF</h3>
            <p class="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">文字與圖解保持向量，適合寄送、列印與存檔。</p>
          </div>
          <div v-if="hasPdf" class="mt-auto flex flex-wrap items-center gap-2">
            <a :href="pdfUrl!" download="slides.pdf" class="btn-primary">下載 PDF</a>
            <span class="font-mono text-[11px] text-stone-400">{{ size(pdfFile) }} · {{ time(pdfFile) }}</span>
          </div>
          <p v-else class="mt-auto text-xs text-stone-400">尚未匯出</p>
        </section>
      </div>

      <iframe v-if="hasPdf" :src="pdfUrl!" class="h-[70vh] min-h-[420px] w-full rounded-md border border-stone-200 dark:border-stone-800" title="PDF 預覽"></iframe>
    </template>
  </div>
</template>
