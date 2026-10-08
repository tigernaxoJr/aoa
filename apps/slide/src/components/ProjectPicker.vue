<script setup lang="ts">
import { ref, watch } from 'vue'
import { isSupported } from '@aoa/web-shared/fsa'
import { abandonFolder, dirHandle, folderError, forgetRecent, initializeProject, needsSetup, pickFolder, recentList, reopen } from '../lib/store'

const supported = isSupported()
const error = ref<string | null>(null)
const loading = ref(false)

// New project form state (shown while the open folder is not a project yet)
const title = ref('')
const description = ref('')
const audience = ref('一般專業觀眾 / 開發團隊')
const pagesCount = ref(5)
const theme = ref('default')
const notes = ref('著重系統架構與技術解析，運用 SVG 流程圖與 3D 視覺組件提升質感')

const when = (t: number) => new Date(t).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })

async function run(fn: () => Promise<void>) {
  error.value = null
  loading.value = true
  try {
    await fn()
  } finally {
    loading.value = false
  }
}

// A new project starts titled after its folder.
watch([needsSetup, dirHandle], ([on]) => on && (title.value = dirHandle.value?.name || '新簡報專案'), { immediate: true })

async function handleCreate() {
  if (!title.value.trim()) {
    error.value = '請輸入簡報主題'
    return
  }
  loading.value = true
  error.value = null
  try {
    await initializeProject({
      title: title.value.trim(),
      description: description.value.trim(),
      audience: audience.value.trim(),
      pagesCount: pagesCount.value,
      theme: theme.value,
      notes: notes.value.trim(),
    })
  } catch (err: any) {
    error.value = err.message || '建立專案失敗'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl py-8">
    <!-- Browser Support Check -->
    <div
      v-if="!supported"
      class="rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <h3 class="font-semibold text-lg">瀏覽器不支援 File System Access API</h3>
      <p class="mt-2 text-sm leading-relaxed">
        Slide Studio 遵循 AOA 架構，完全零後端且不儲存資料，必須直接透過標準 File System Access API 存取您的本機簡報專案資料夾。
      </p>
      <p class="mt-2 text-sm">請使用最新版 <strong>Google Chrome</strong> 或 <strong>Microsoft Edge</strong> 瀏覽器。</p>
    </div>

    <!-- Main Pick Directory Card -->
    <div
      v-else-if="!dirHandle"
      class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div class="text-center">
        <div class="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200">
          <svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </div>
        <h2 class="mt-4 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">選擇或建立簡報目錄</h2>
        <p class="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          選擇本機空資料夾開始新專案，或選取既有的 Slidev 專案目錄進行即時預覽與 PDF 產物監控。
        </p>

        <div class="mt-6 flex flex-col items-center gap-3">
          <button
            type="button"
            :disabled="loading"
            @click="run(pickFolder)"
            data-testid="pick-folder"
            class="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-slate-800 active:bg-slate-950 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:active:bg-slate-200 cursor-pointer disabled:opacity-50 transition-colors"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            選擇本機資料夾
          </button>
          <span class="text-xs text-slate-400">所有檔案直接讀寫本機，全程零後端無雲端傳輸</span>
        </div>

        <p v-if="folderError" class="mt-4 text-sm font-medium text-rose-600 dark:text-rose-400" role="alert">
          {{ folderError }}
        </p>

        <!-- Recent projects: one click to reopen (the browser may ask for access again) -->
        <div v-if="recentList.length" class="mx-auto mt-8 max-w-md text-left" data-testid="recent">
          <p class="text-sm font-medium text-slate-900 dark:text-slate-100">最近的專案</p>
          <ul class="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            <li v-for="r in recentList" :key="`${r.handle.name}-${r.openedAt}`" class="flex items-center">
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50 cursor-pointer disabled:opacity-50 dark:hover:bg-slate-800/60"
                :disabled="loading"
                data-testid="recent-open"
                @click="run(() => reopen(r.handle))"
              >
                <svg class="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium text-slate-900 dark:text-slate-100">{{ r.projectName ?? '還沒建立專案' }}</span>
                  <span class="block truncate text-xs text-slate-500 dark:text-slate-400">資料夾「{{ r.handle.name }}」· {{ when(r.openedAt) }}</span>
                </span>
              </button>
              <button
                type="button"
                class="mr-1.5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer dark:hover:bg-slate-800 dark:hover:text-slate-200"
                :aria-label="`從清單移除 ${r.handle.name}`"
                title="從清單移除（不會刪除檔案）"
                @click="forgetRecent(r.handle)"
              >
                <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          </ul>
          <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">瀏覽器詢問存取權限時選「每次造訪時都允許」，下次打開網頁就會直接回到上次的專案。</p>
        </div>
      </div>

      <!-- Feature Highlights -->
      <div class="mt-10 grid grid-cols-1 gap-4 border-t border-slate-100 pt-8 sm:grid-cols-3 dark:border-slate-800">
        <div class="text-left">
          <h4 class="font-medium text-sm text-slate-900 dark:text-slate-100">Slidev Markdown</h4>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">以 Markdown 與 Vue 3 為核心，支援多種版型與 v-click 動效。</p>
        </div>
        <div class="text-left">
          <h4 class="font-medium text-sm text-slate-900 dark:text-slate-100">SVG & Three.js 3D</h4>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Coding Agent 動態生成高質感向量架構圖與 WebGL 立體視覺。</p>
        </div>
        <div class="text-left">
          <h4 class="font-medium text-sm text-slate-900 dark:text-slate-100">PDF 輸出</h4>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">本機 Playwright 一鍵匯出；文字與 SVG 保持向量，3D 畫面為高解析點陣圖。</p>
        </div>
      </div>
    </div>

    <!-- Create Project Form if directory has no slide.project.json -->
    <div
      v-else-if="needsSetup"
      class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div class="border-b border-slate-100 pb-5 dark:border-slate-800">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white">初始化簡報專案</h2>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          「{{ dirHandle?.name }}」是空資料夾。填寫需求後，網頁會寫入 <code>slide.start.json</code> 並產生給 Agent 的指令，由 Agent 下載範本並建立專案。
        </p>
      </div>

      <form @submit.prevent="handleCreate" class="mt-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">簡報主題 / 名稱 *</label>
          <input
            v-model="title"
            type="text"
            required
            placeholder="例如：雲端微服務架構遷移策略"
            class="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm shadow-xs focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-slate-400 dark:focus:ring-slate-400"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">目標受眾與場合</label>
          <input
            v-model="audience"
            type="text"
            placeholder="例如：技術長、資深工程師、投資人"
            class="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm shadow-xs focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-slate-400 dark:focus:ring-slate-400"
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">預估頁數</label>
            <input
              v-model.number="pagesCount"
              type="number"
              min="1"
              max="50"
              class="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm shadow-xs focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-slate-400 dark:focus:ring-slate-400"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">簡報主題風格</label>
            <select
              v-model="theme"
              class="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm shadow-xs focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-slate-400 dark:focus:ring-slate-400"
            >
              <option value="default">預設深淺自適應 (default)</option>
              <option value="seriph">優雅襯線風 (seriph)</option>
              <option value="apple-basic">極簡科技 (apple-basic)</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">內容重點與視覺指引</label>
          <textarea
            v-model="notes"
            rows="3"
            placeholder="例如：需包含架構對比圖、資料流程、時程表；首頁需有立體地球組件..."
            class="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm shadow-xs focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-slate-400 dark:focus:ring-slate-400"
          ></textarea>
        </div>

        <p v-if="error" class="text-sm font-medium text-rose-600 dark:text-rose-400">
          {{ error }}
        </p>

        <div class="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            @click="abandonFolder"
            class="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            換一個資料夾
          </button>
          <button
            type="submit"
            :disabled="loading"
            class="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800 active:bg-slate-950 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:active:bg-slate-200 cursor-pointer disabled:opacity-50 transition-colors"
          >
            建立專案並生成 Agent 指令
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
