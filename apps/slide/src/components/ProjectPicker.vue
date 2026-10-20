<script setup lang="ts">
import { ref, watch } from 'vue'
import { isSupported } from '@aoa/web-shared/fsa'
import ReferencesPanel from '@aoa/web-shared/ReferencesPanel.vue'
import { abandonFolder, dirHandle, folderError, forgetRecent, initializeProject, needsSetup, pickFolder, recentList, reopen } from '../lib/store'

const supported = isSupported()
const error = ref<string | null>(null)
const loading = ref(false)

// New project form state (shown while the open folder is not a project yet)
const title = ref('')
// Empty unless the user writes something: a preset would steer every deck toward the same topic.
const content = ref('')
const audience = ref('')
// The AI sizes the deck to the content unless the user asks for a fixed count.
const pagesMode = ref<'auto' | 'fixed'>('auto')
const pagesCount = ref(8)
const theme = ref('default')
const notes = ref('')

/** What the workbench does, for the start page. */
const FEATURES = [
  ['01', 'Slidev Markdown', '以 Markdown 與 Vue 為核心，多種版型與逐步顯示動畫。'],
  ['02', '圖解、流程圖與 3D', 'Agent 依內容畫出 SVG 架構圖、Mermaid 流程圖或 Three.js 立體畫面。'],
  ['03', 'PDF 與互動 HTML', '在你的電腦上匯出；PDF 保持向量，HTML 可離線全螢幕放映。'],
] as const

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
      content: content.value.trim(),
      audience: audience.value.trim(),
      pagesCount: pagesMode.value === 'fixed' ? pagesCount.value : undefined,
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
  <div class="mx-auto max-w-3xl py-4 sm:py-10">
    <!-- Browser Support Check -->
    <div v-if="!supported" class="rounded-md border border-amber-300 bg-amber-50 p-6 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
      <h2 class="font-serif text-lg font-bold">這個瀏覽器無法開啟本機資料夾</h2>
      <p class="mt-2 text-sm leading-relaxed">Slide 沒有後端、不上傳檔案，直接讀寫你電腦上的簡報資料夾，需要 File System Access API。</p>
      <p class="mt-2 text-sm">請改用最新版 <strong>Google Chrome</strong> 或 <strong>Microsoft Edge</strong>。</p>
    </div>

    <!-- Start: pick a folder or reopen a recent one -->
    <div v-else-if="!dirHandle">
      <p class="eyebrow"><span class="text-accent">AOA</span> · Slide</p>
      <h1 class="mt-5 font-serif text-3xl leading-tight font-bold tracking-tight sm:text-5xl">交給你的 Agent 做簡報</h1>
      <p class="mt-5 max-w-2xl text-base leading-relaxed text-stone-600 sm:text-lg dark:text-stone-300">
        選一個空資料夾、寫下想講什麼，網頁會產生一段提示詞；你的 Coding Agent 照著做出 Slidev 簡報，這裡即時顯示每一頁、檢查結果與匯出的 PDF。
      </p>

      <div class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button type="button" :disabled="loading" data-testid="pick-folder" class="btn-primary px-5 py-3" @click="run(pickFolder)">
          選擇資料夾 <span aria-hidden="true">→</span>
        </button>
        <span class="text-xs text-stone-500">檔案只在你的電腦上讀寫，不經過任何伺服器</span>
      </div>

      <p v-if="folderError" data-testid="folder-error" class="mt-4 text-sm font-medium text-rose-600 dark:text-rose-400" role="alert">
        {{ folderError }}
      </p>

      <!-- Recent projects: one click to reopen (the browser may ask for access again) -->
      <div v-if="recentList.length" class="mt-12" data-testid="recent">
        <p class="eyebrow">最近的專案</p>
        <ul class="mt-3 divide-y divide-stone-200 border-y border-stone-200 dark:divide-stone-800 dark:border-stone-800">
          <li v-for="r in recentList" :key="`${r.handle.name}-${r.openedAt}`" class="group flex items-center">
            <button
              type="button"
              class="flex min-w-0 flex-1 cursor-pointer items-baseline gap-3 py-3 text-left disabled:opacity-50"
              :disabled="loading"
              data-testid="recent-open"
              @click="run(() => reopen(r.handle))"
            >
              <span class="min-w-0 truncate font-medium decoration-accent underline-offset-4 group-hover:underline">{{ r.projectName ?? '還沒建立專案' }}</span>
              <span class="min-w-0 truncate font-mono text-[11px] text-stone-500">{{ r.handle.name }} · {{ when(r.openedAt) }}</span>
            </button>
            <button type="button" class="icon-btn" :aria-label="`從清單移除 ${r.handle.name}`" title="從清單移除（不會刪除檔案）" @click="forgetRecent(r.handle)">
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </li>
        </ul>
        <p class="mt-2 text-xs text-stone-500 dark:text-stone-400">瀏覽器詢問存取權限時選「每次造訪時都允許」，下次打開網頁就會直接回到上次的專案。</p>
      </div>

      <!-- Feature Highlights -->
      <div class="mt-12 grid gap-px overflow-hidden rounded-md border border-stone-300 bg-stone-300 sm:grid-cols-3 dark:border-stone-700 dark:bg-stone-700">
        <div v-for="[n, heading, body] in FEATURES" :key="n" class="bg-paper p-5">
          <p class="font-mono text-[11px] text-accent">{{ n }}</p>
          <h3 class="mt-2 text-sm font-semibold">{{ heading }}</h3>
          <p class="mt-1 text-xs leading-relaxed text-stone-500 dark:text-stone-400">{{ body }}</p>
        </div>
      </div>
    </div>

    <!-- Create Project Form if directory has no slide.project.json -->
    <div v-else-if="needsSetup" class="card">
      <div class="border-b border-stone-200 px-5 py-5 sm:px-7 dark:border-stone-800">
        <p class="eyebrow"><span class="text-accent">新簡報</span> · {{ dirHandle?.name }}</p>
        <h2 class="mt-2 font-serif text-2xl font-bold">這份簡報要講什麼？</h2>
        <p class="mt-1.5 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
          填好後網頁會把需求存進這個資料夾，並產生一段給 Agent 的話；Agent 會照著建立簡報專案。
        </p>
      </div>

      <form class="space-y-5 px-5 py-6 sm:px-7" @submit.prevent="handleCreate">
        <div>
          <label for="slide-title" class="block text-sm font-medium">簡報主題 <span class="text-accent">*</span></label>
          <input id="slide-title" v-model="title" type="text" required data-testid="setup-title" placeholder="例如：雲端微服務架構遷移策略" class="field" />
        </div>

        <div>
          <label for="slide-content" class="block text-sm font-medium">簡報內容</label>
          <textarea
            id="slide-content"
            v-model="content"
            rows="6"
            data-testid="slide-content"
            placeholder="想講的重點、章節順序、要放的數據或案例。可以直接貼上文章、會議紀錄，或寫下本機檔案的路徑讓 Agent 讀取。"
            class="field"
          ></textarea>
          <p class="mt-1 text-xs text-stone-500 dark:text-stone-400">留空也可以：Agent 會先在對話中問你要講什麼，再開始規劃大綱。</p>
        </div>

        <div data-testid="setup-references">
          <span class="block text-sm font-medium">參考資料 <span class="font-normal text-stone-500">（選填）</span></span>
          <ReferencesPanel
            class="mt-1.5"
            :root="dirHandle"
            intro="報告、規格、會議紀錄、數據表、logo、照片……放進來讓 Agent 參考；檔案會複製到這個資料夾裡。"
          />
        </div>

        <div>
          <label for="slide-audience" class="block text-sm font-medium">目標受眾與場合</label>
          <input id="slide-audience" v-model="audience" type="text" data-testid="setup-audience" placeholder="例如：技術長、資深工程師、投資人" class="field" />
        </div>

        <div class="grid gap-5 sm:grid-cols-2">
          <div>
            <label for="slide-pages-mode" class="block text-sm font-medium">頁數</label>
            <div class="flex gap-2">
              <select id="slide-pages-mode" v-model="pagesMode" data-testid="pages-mode" class="field">
                <option value="auto">由 AI 依內容評估</option>
                <option value="fixed">指定頁數</option>
              </select>
              <input
                v-if="pagesMode === 'fixed'"
                v-model.number="pagesCount"
                type="number"
                min="1"
                max="50"
                aria-label="指定頁數"
                data-testid="pages-count"
                class="field w-20 shrink-0"
              />
            </div>
          </div>
          <div>
            <label for="slide-theme" class="block text-sm font-medium">簡報主題風格</label>
            <select id="slide-theme" v-model="theme" class="field">
              <option value="default">預設，深淺自適應（default）</option>
              <option value="seriph">優雅襯線（seriph）</option>
              <option value="apple-basic">極簡科技（apple-basic）</option>
            </select>
          </div>
        </div>

        <div>
          <label for="slide-notes" class="block text-sm font-medium">視覺偏好 <span class="font-normal text-stone-500">（選填）</span></label>
          <textarea id="slide-notes" v-model="notes" rows="2" placeholder="例如：正式簡潔、用公司藍色系；流程用圖表呈現；不要 3D 動畫" class="field"></textarea>
        </div>

        <p v-if="error" class="text-sm font-medium text-rose-600 dark:text-rose-400">{{ error }}</p>

        <div class="flex flex-col-reverse gap-3 border-t border-stone-200 pt-5 sm:flex-row sm:items-center sm:justify-between dark:border-stone-800">
          <button type="button" class="cursor-pointer text-sm text-stone-500 underline decoration-stone-300 underline-offset-4 hover:text-stone-900 dark:hover:text-white" @click="abandonFolder">
            換一個資料夾
          </button>
          <button type="submit" :disabled="loading" data-testid="setup-create" class="btn-primary px-5 py-2.5">建立專案，產生提示詞 <span aria-hidden="true">→</span></button>
        </div>
      </form>
    </div>
  </div>
</template>
