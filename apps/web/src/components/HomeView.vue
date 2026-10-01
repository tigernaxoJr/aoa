<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { writeText } from '../lib/fsa'
import { START_FILE, api, launchCommand, launchMessage, startJson, type SourceHints } from '../lib/site'
import { baseName, pathHelp, platform, readSourceFolder } from '../lib/source'
import { pickFolder, reconnect, root, ui } from '../lib/store'
import CopyButton from './CopyButton.vue'

const STORAGE_KEY = 'avp-start'
const os = platform()

interface Start {
  productUrl: string
  sourceFolder: string
  sourceHints: SourceHints | null
  sourceCodePath: string
  description: string
}
const form = reactive<Start>({ productUrl: '', sourceFolder: '', sourceHints: null, sourceCodePath: '', description: '' })
try {
  Object.assign(form, JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'))
} catch {}
watch(form, () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
  } catch {}
})

/** The prepared project folder; the agent will build the project in it. */
const folder = computed(() => (ui.waiting && root.value ? root.value.name : null))
const needsFolder = computed(() => ui.supported && !folder.value)

// Keep the start file in the prepared folder in step with the form, so the agent reads what the user sees.
let pending: ReturnType<typeof setTimeout> | undefined
watch(
  [() => ({ ...form }), folder],
  () => {
    clearTimeout(pending)
    const dir = root.value
    if (!folder.value || !dir) return
    pending = setTimeout(() => writeText(dir, START_FILE, startJson(form)).catch((err) => (ui.error = (err as Error).message)), 300)
  },
  { immediate: true },
)

const filledFrom = ref<string | null>(null)
const hasSource = computed(() => Boolean(form.productUrl.trim() || form.sourceFolder.trim() || form.sourceCodePath.trim() || form.description.trim()))
const message = computed(() => launchMessage(form, folder.value))
const command = computed(() => launchCommand(form, folder.value))
const canPick = typeof window.showDirectoryPicker === 'function'
const pathMismatch = computed(() => {
  const typed = baseName(form.sourceCodePath.trim())
  return Boolean(form.sourceFolder && typed && typed.toLowerCase() !== form.sourceFolder.toLowerCase())
})

async function useSource(dir: FileSystemDirectoryHandle) {
  const info = await readSourceFolder(dir)
  form.sourceFolder = info.folder
  form.sourceHints = info.hints
  if (pathMismatch.value) form.sourceCodePath = ''
  const from: string[] = []
  if (!form.description.trim() && info.description) {
    form.description = info.name ? `${info.name}：${info.description}` : info.description
    from.push('說明')
  }
  if (!form.productUrl.trim() && info.homepage) {
    form.productUrl = info.homepage
    from.push('網址')
  }
  filledFrom.value = from.length ? `已從 package.json / README 帶入${from.join('與')}，可再修改。` : null
}

async function pickSource() {
  try {
    await useSource(await window.showDirectoryPicker!({ mode: 'read', id: 'product-source' }))
  } catch (err) {
    if ((err as DOMException).name !== 'AbortError') ui.error = (err as Error).message
  }
}

function clearSource() {
  form.sourceFolder = ''
  form.sourceHints = null
  filledFrom.value = null
}

onMounted(() => {
  if (window.__avp) window.__avp.pickSource = useSource // test hook: the native picker cannot be automated
})

const links = [
  ['Agent 指引', api('agent-guide.md')],
  ['資源索引', api('index.json')],
  ['工作流程', api('workflow.json')],
  ['Skill', api('skills/product-video.zip')],
  ['專案範本', api('templates/product-video.zip')],
]
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-10">
    <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">讓 Agent 在你的電腦上做產品介紹影片</h1>
    <p class="mt-2 text-slate-600 dark:text-slate-400">
      照下面四個步驟做，不需要會寫程式或打指令：先準備一個放影片的資料夾、填產品資訊，再把產生的一段話貼給 Agent（例如 Claude），它就會在那個資料夾裡寫旁白、錄畫面、合成影片；這個網頁會同步顯示進度。檔案都留在你的電腦，這個網頁不會上傳任何東西。
    </p>

    <ol class="mt-8 space-y-5">
      <!-- 1. Project folder -->
      <li class="card p-5" data-testid="step-folder">
        <div class="flex items-start gap-4">
          <span class="step-no" :class="folder && 'step-done'">{{ folder ? '✓' : '1' }}</span>
          <div class="min-w-0 flex-1">
            <h2 class="font-semibold">準備放影片的資料夾</h2>
            <template v-if="!ui.supported">
              <p class="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                這個瀏覽器不能存取電腦上的資料夾，可以跳過這一步：Agent 會自己在它的工作資料夾裡建立影片專案。想在網頁上看進度、修改旁白，請改用電腦版 Chrome 或 Edge 開啟本頁。
              </p>
            </template>
            <div v-else-if="folder" class="mt-2 flex items-center gap-3 rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600" data-testid="project-folder">
              <span aria-hidden="true">📁</span>
              <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ folder }}</span>
              <button type="button" class="link text-sm" :disabled="ui.loading" @click="pickFolder">更換</button>
            </div>
            <template v-else>
              <ol class="mt-2 list-inside list-decimal space-y-1 text-sm text-slate-600 dark:text-slate-400">
                <li>按下面的按鈕，會跳出選擇資料夾的視窗。</li>
                <li>到你想放影片的地方（例如「文件」），按「新增資料夾」，取個名字（例如 acme-video）。</li>
                <li>選這個新資料夾，按「選取資料夾」；瀏覽器詢問存取權限時按「允許」或「編輯檔案」。</li>
              </ol>
              <div class="mt-4 flex flex-wrap gap-2">
                <button v-if="ui.remembered" type="button" class="btn-primary" @click="reconnect">繼續使用「{{ ui.remembered.name }}」</button>
                <button type="button" :class="ui.remembered ? 'btn-secondary' : 'btn-primary'" :disabled="ui.loading" data-testid="pick-folder" @click="pickFolder">
                  {{ ui.loading ? '載入中…' : '選擇或建立資料夾…' }}
                </button>
              </div>
              <p class="mt-2 text-xs text-slate-500">已經有做到一半的影片專案？選它的資料夾就能直接繼續編輯。</p>
            </template>
            <p v-if="ui.error" class="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{{ ui.error }}</p>
          </div>
        </div>
      </li>

      <!-- 2. Product -->
      <li class="card p-5" data-testid="step-product">
        <div class="flex items-start gap-4">
          <span class="step-no" :class="hasSource && 'step-done'">{{ hasSource ? '✓' : '2' }}</span>
          <div class="min-w-0 flex-1">
            <h2 class="font-semibold">告訴 Agent 產品是什麼</h2>
            <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">至少填一項；給得越多，影片越準確。</p>
            <div class="mt-4 space-y-4">
              <label class="block">
                <span class="text-sm font-medium">產品網址</span>
                <input v-model.trim="form.productUrl" type="url" placeholder="https://example.com" class="field" />
              </label>

              <div>
                <label for="source-path" class="text-sm font-medium">產品原始碼資料夾（選填）</label>
                <div class="mt-1 flex flex-wrap items-center gap-2">
                  <input
                    id="source-path"
                    v-model.trim="form.sourceCodePath"
                    type="text"
                    :placeholder="os === 'windows' ? '例如 C:\\code\\my-product' : '例如 /Users/me/code/my-product'"
                    class="field mt-0 min-w-0 flex-1"
                    data-testid="source-path"
                  />
                  <button v-if="canPick" type="button" class="btn-secondary" data-testid="pick-source" @click="pickSource">選擇資料夾…</button>
                </div>
                <p class="mt-1 text-xs text-slate-500">如果這個產品是你們自己開發的，填它的程式資料夾能讓影片更準確。Agent 只會讀取，不會修改。取得完整路徑：{{ pathHelp(os) }}</p>
                <div v-if="form.sourceFolder" class="mt-2 flex items-center gap-3 rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600" data-testid="source-folder">
                  <span aria-hidden="true">📁</span>
                  <span class="min-w-0 flex-1 truncate text-sm">已讀取「<span class="font-medium">{{ form.sourceFolder }}</span>」</span>
                  <button type="button" class="link text-sm" @click="clearSource">移除</button>
                </div>
                <p v-if="form.sourceFolder && !form.sourceCodePath" class="mt-1 text-xs text-amber-700 dark:text-amber-400" data-testid="source-path-missing">
                  瀏覽器為了安全，只告訴網頁資料夾的名稱，不會給完整路徑。請照上面的方法把路徑貼進輸入框；沒填的話，Agent 會依名稱「{{ form.sourceFolder }}」在你的電腦上尋找並跟你確認。
                </p>
                <p v-if="pathMismatch" class="mt-1 text-xs text-amber-700 dark:text-amber-400" data-testid="source-path-mismatch">
                  路徑最後的資料夾名稱和選擇的「{{ form.sourceFolder }}」不一樣，請確認填的是同一個資料夾。
                </p>
                <p v-if="filledFrom" class="mt-1 text-xs text-emerald-700 dark:text-emerald-400" data-testid="source-filled">{{ filledFrom }}</p>
              </div>

              <label class="block">
                <span class="text-sm font-medium">產品說明（選填）</span>
                <textarea v-model="form.description" rows="3" placeholder="一兩句話：產品做什麼、給誰用" class="field" />
              </label>
            </div>
          </div>
        </div>
      </li>

      <!-- 3. Agent -->
      <li class="card p-5" data-testid="step-run">
        <div class="flex items-start gap-4">
          <span class="step-no">3</span>
          <div class="min-w-0 flex-1">
            <h2 class="font-semibold">打開 Agent，貼上這段話</h2>
            <p v-if="needsFolder" class="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">請先在步驟 1 準備放影片的資料夾。</p>
            <p v-else-if="!hasSource" class="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">請先在步驟 2 填入產品網址、原始碼資料夾或一句說明。</p>
            <template v-else>
              <ol class="mt-2 list-inside list-decimal space-y-1.5 text-sm">
                <li>
                  打開 Agent。還沒有的話，到 <a href="https://claude.ai/download" target="_blank" rel="noopener" class="link">claude.ai/download</a> 下載 Claude 桌面版，安裝後登入，切到上方的「Code」。其他 Coding Agent 也可以，只要它能讀網址、在你的電腦上工作。
                </li>
                <li v-if="folder">開一個新的對話。它會請你選一個資料夾：<strong>選步驟 1 的「{{ folder }}」</strong>。</li>
                <li v-else>開一個新的對話。它會請你選一個資料夾：選你想存放影片的地方，例如「文件」。</li>
                <li>按「複製這段話」，到 Agent 的對話框貼上（{{ os === 'mac' ? '⌘+V' : 'Ctrl+V' }}），再按送出。</li>
              </ol>
              <pre class="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-100 p-3 font-sans text-sm leading-relaxed dark:bg-slate-800" data-testid="launch-message">{{ message }}</pre>
              <div class="mt-3"><CopyButton :text="message" label="複製這段話" primary /></div>
              <div class="mt-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-950 dark:bg-sky-950/60 dark:text-sky-100">
                <p class="font-medium">接下來 Agent 會：</p>
                <ul class="mt-1 list-inside list-disc space-y-0.5">
                  <li v-if="folder">在「{{ folder }}」裡建立影片專案</li>
                  <li v-else>在你選的資料夾裡建立影片專案，並告訴你它在哪裡</li>
                  <li>電腦缺少需要的工具時，告訴你怎麼安裝，或在你同意後替你處理</li>
                  <li>問你幾個問題：影片語言與長度、旁白能否使用線上語音服務</li>
                  <li>分析產品、寫分鏡；每完成一段就停下來請你確認</li>
                </ul>
                <p class="mt-2 text-sky-800 dark:text-sky-300">在對話中直接回答它就好。看不懂它的問題時，可以回它「請用更簡單的方式說明」。</p>
              </div>
              <details class="mt-3 text-sm text-slate-500">
                <summary class="cursor-pointer">習慣使用終端機？</summary>
                <p v-if="folder" class="mt-2">在「{{ folder }}」資料夾開啟終端機，執行：</p>
                <p v-else class="mt-2">在想存放影片專案的資料夾開啟終端機，執行：</p>
                <div class="mt-1 flex items-start gap-2">
                  <pre class="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-100 p-3 font-mono text-xs dark:bg-slate-800" data-testid="launch-command">{{ command }}</pre>
                  <CopyButton :text="command" />
                </div>
              </details>
            </template>
          </div>
        </div>
      </li>

      <!-- 4. Progress -->
      <li v-if="ui.supported" class="card p-5" data-testid="step-review">
        <div class="flex items-start gap-4">
          <span class="step-no">4</span>
          <div class="min-w-0 flex-1">
            <h2 class="font-semibold">在這裡看進度、修改</h2>
            <p v-if="folder" class="mt-2 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400" role="status" data-testid="waiting">
              <span class="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-500" aria-hidden="true" />
              等 Agent 在「{{ folder }}」建立專案。建好後這個頁面會自動切換，你可以看到進度、修改旁白、預覽每一段影片。
            </p>
            <p v-else class="mt-1 text-sm text-slate-600 dark:text-slate-400">完成步驟 1 後，Agent 一建好專案，這個頁面就會自動顯示進度。</p>
          </div>
        </div>
      </li>
    </ol>

    <details class="mt-8 text-sm text-slate-600 dark:text-slate-400">
      <summary class="cursor-pointer font-medium">進階：Guide API 與本機助手</summary>
      <p class="mt-3">Agent 讀取的規則與範本都是靜態檔案：</p>
      <ul class="mt-2 space-y-1.5">
        <li v-for="[label, url] in links" :key="url">
          {{ label }}：<a :href="url" class="link break-all">{{ url }}</a>
        </li>
      </ul>
      <p class="mt-3">想直接在網頁上按鈕重做影片，可以請 Agent「在影片專案啟動 video-agent 本機助手並給我配對連結」，再點那個連結。</p>
    </details>
  </div>
</template>
