<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { api, launchCommand, launchMessage } from '../lib/site'
import { platform, readSourceFolder } from '../lib/source'
import { pickFolder, reconnect, ui } from '../lib/store'
import CopyButton from './CopyButton.vue'

const STORAGE_KEY = 'avp-start'
const os = platform()

interface Start {
  toolsReady: boolean
  productUrl: string
  sourceFolder: string
  sourceCodePath: string
  description: string
}
const form = reactive<Start>({ toolsReady: false, productUrl: '', sourceFolder: '', sourceCodePath: '', description: '' })
try {
  Object.assign(form, JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'))
} catch {}
watch(form, () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
  } catch {}
})

const filledFrom = ref<string | null>(null)
const typingPath = ref(false)
const hasSource = computed(() => Boolean(form.productUrl.trim() || form.sourceFolder.trim() || form.sourceCodePath.trim() || form.description.trim()))
const message = computed(() => launchMessage(form))
const command = computed(() => launchCommand(form))
const canPick = typeof window.showDirectoryPicker === 'function'

async function useSource(dir: FileSystemDirectoryHandle) {
  const info = await readSourceFolder(dir)
  form.sourceFolder = info.folder
  form.sourceCodePath = ''
  typingPath.value = false
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
  form.sourceCodePath = ''
  typingPath.value = false
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
      照下面四個步驟做，不需要會寫程式或打指令：你在這裡填產品資訊，把產生的一段話貼給 Agent（例如 Claude），它就會在你的電腦上寫旁白、錄畫面、合成影片。檔案都留在你的電腦，這個網頁不會上傳任何東西。
    </p>

    <ol class="mt-8 space-y-5">
      <!-- 1. Tools -->
      <li class="card p-5" data-testid="step-tools">
        <div class="flex items-start gap-4">
          <span class="step-no" :class="form.toolsReady && 'step-done'">{{ form.toolsReady ? '✓' : '1' }}</span>
          <div class="min-w-0 flex-1">
            <h2 class="font-semibold">打開你的 Agent</h2>
            <template v-if="!form.toolsReady">
              <ul class="mt-3 space-y-3 text-sm">
                <li>
                  <strong>還沒有 Agent？</strong>到 <a href="https://claude.ai/download" target="_blank" rel="noopener" class="link">claude.ai/download</a> 下載 Claude 桌面版，安裝後登入，切到上方的「Code」。
                </li>
                <li>
                  <strong>開一個新的對話。</strong>它會請你選一個資料夾：選你想存放影片的地方，例如「文件」。影片專案會建立在這個資料夾裡。
                </li>
                <li class="text-slate-500">其他 Coding Agent 也可以，只要它能讀網址、在你的電腦上工作。</li>
              </ul>
              <button type="button" class="btn-secondary mt-4" data-testid="agent-ready" @click="form.toolsReady = true">Agent 已經開好了</button>
            </template>
            <p v-else class="mt-1 text-sm text-slate-500">
              Agent 已開好。<button type="button" class="link" @click="form.toolsReady = false">再看一次說明</button>
            </p>
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
                <span class="text-sm font-medium">產品原始碼資料夾（選填）</span>
                <!-- A picked folder shows as a chip; a typed path stays in its input so it can be edited. -->
                <div v-if="form.sourceFolder" class="mt-1 flex items-center gap-3 rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600" data-testid="source-folder">
                  <span aria-hidden="true">📁</span>
                  <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ form.sourceFolder }}</span>
                  <button v-if="canPick" type="button" class="link text-sm" @click="pickSource">更換</button>
                  <button type="button" class="link text-sm" @click="clearSource">移除</button>
                </div>
                <div v-else class="mt-1 flex flex-wrap items-center gap-2">
                  <button v-if="canPick && !typingPath && !form.sourceCodePath" type="button" class="btn-secondary" data-testid="pick-source" @click="pickSource">選擇資料夾…</button>
                  <input
                    v-if="typingPath || !canPick || form.sourceCodePath"
                    v-model.trim="form.sourceCodePath"
                    type="text"
                    placeholder="例如 C:\code\my-product"
                    class="field mt-0 flex-1"
                  />
                  <button v-if="canPick && !form.sourceCodePath" type="button" class="link text-sm" @click="typingPath = !typingPath">{{ typingPath ? '改用選擇資料夾' : '或直接輸入路徑' }}</button>
                  <button v-if="form.sourceCodePath" type="button" class="link text-sm" @click="clearSource">清除</button>
                </div>
                <p class="mt-1 text-xs text-slate-500">如果這個產品是你們自己開發的，選擇它的程式資料夾能讓影片更準確。Agent 只會讀取，不會修改。</p>
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

      <!-- 3. Run -->
      <li class="card p-5" data-testid="step-run">
        <div class="flex items-start gap-4">
          <span class="step-no">3</span>
          <div class="min-w-0 flex-1">
            <h2 class="font-semibold">把這段話貼給 Agent</h2>
            <p v-if="!hasSource" class="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">請先在步驟 2 填入產品網址、選擇原始碼資料夾或寫一句說明。</p>
            <template v-else>
              <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">按「複製這段話」，到 Agent 的對話框貼上（{{ os === 'mac' ? '⌘+V' : 'Ctrl+V' }}），再按送出。</p>
              <pre class="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-100 p-3 font-sans text-sm leading-relaxed dark:bg-slate-800" data-testid="launch-message">{{ message }}</pre>
              <div class="mt-3"><CopyButton :text="message" label="複製這段話" primary /></div>
              <div class="mt-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-950 dark:bg-sky-950/60 dark:text-sky-100">
                <p class="font-medium">接下來 Agent 會：</p>
                <ul class="mt-1 list-inside list-disc space-y-0.5">
                  <li>在你選的資料夾裡建立影片專案，並告訴你它在哪裡</li>
                  <li>電腦缺少需要的工具時，告訴你怎麼安裝，或在你同意後替你處理</li>
                  <li>問你幾個問題：影片語言與長度、Remotion 授權、旁白能否使用線上語音服務</li>
                  <li>分析產品、寫分鏡；每完成一段就停下來請你確認</li>
                </ul>
                <p class="mt-2 text-sky-800 dark:text-sky-300">在對話中直接回答它就好。看不懂它的問題時，可以回它「請用更簡單的方式說明」。</p>
              </div>
              <details class="mt-3 text-sm text-slate-500">
                <summary class="cursor-pointer">習慣使用終端機？</summary>
                <p class="mt-2">在想存放影片專案的資料夾開啟終端機，執行：</p>
                <div class="mt-1 flex items-start gap-2">
                  <pre class="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-100 p-3 font-mono text-xs dark:bg-slate-800" data-testid="launch-command">{{ command }}</pre>
                  <CopyButton :text="command" />
                </div>
              </details>
            </template>
          </div>
        </div>
      </li>

      <!-- 4. Review -->
      <li class="card p-5" data-testid="step-review">
        <div class="flex items-start gap-4">
          <span class="step-no">4</span>
          <div class="min-w-0 flex-1">
            <h2 class="font-semibold">回到這裡檢視與修改</h2>
            <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Agent 建好專案後會告訴你資料夾名稱。按下面的按鈕選那個資料夾，就能看到進度、修改旁白、預覽每一段影片。
            </p>
            <template v-if="ui.supported">
              <div class="mt-4 flex flex-wrap gap-2">
                <button v-if="ui.remembered" type="button" class="btn-primary" @click="reconnect">繼續編輯「{{ ui.remembered.name }}」</button>
                <button type="button" :class="ui.remembered ? 'btn-secondary' : 'btn-primary'" :disabled="ui.loading" @click="pickFolder">
                  {{ ui.loading ? '載入中…' : '開啟影片專案資料夾' }}
                </button>
              </div>
              <p class="mt-2 text-xs text-slate-500">瀏覽器會詢問是否允許存取該資料夾，請選「允許」，這樣才能儲存你的修改。</p>
            </template>
            <p v-else class="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              這個瀏覽器不能開啟電腦上的資料夾。請改用電腦版 Chrome 或 Edge 開啟本頁；步驟 1–3 不受影響。
            </p>
            <p v-if="ui.error" class="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{{ ui.error }}</p>
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
