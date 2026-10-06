<script setup lang="ts">
import { computed, reactive, ref, watch, type Component } from 'vue'
import { tryFile, writeText } from '@aoa/web-shared/fsa'
import { SKILL, START_FILE, TEMPLATE, VIDEO_KIND, api, launchMessage, newFolderId, startJson, type SourceInput } from '../lib/site'
import { platform } from '../lib/source'
import { activity, pickFolder, reconnect, root, ui } from '../lib/store'
import ActivityBanner from './ActivityBanner.vue'
import CopyButton from './CopyButton.vue'
import Icon from './Icon.vue'

/** Step 2: the app's form for what the video is about; it fills `form` in place. */
defineProps<{ sourceForm: Component }>()

const STORAGE_KEY = `avp-start-${VIDEO_KIND}`
const os = platform()

const form = reactive<SourceInput>({ kind: VIDEO_KIND, story: '', audience: '', productUrl: '', requiresLogin: false, sourceFolder: '', sourceHints: null, sourceCodePath: '', description: '' })
try {
  Object.assign(form, JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'), { kind: VIDEO_KIND })
} catch {}
watch(form, () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
  } catch {}
})

/** The prepared project folder; the agent will build the project in it. */
const folder = computed(() => (ui.waiting && root.value ? root.value.name : null))

/** The id the agent matches to find the folder; kept from an existing start file so a message already pasted stays valid. */
const folderId = ref<string | null>(null)
watch(
  folder,
  async () => {
    folderId.value = null
    const dir = root.value
    if (!folder.value || !dir) return
    let id: unknown
    try {
      id = JSON.parse((await (await tryFile(dir, START_FILE))?.text()) ?? '{}').id
    } catch {}
    if (root.value === dir) folderId.value = typeof id === 'string' && id ? id : newFolderId()
  },
  { immediate: true },
)
const prepared = computed(() => (folder.value && folderId.value ? { name: folder.value, id: folderId.value } : null))
const needsFolder = computed(() => ui.supported && !prepared.value)

// Keep the start file in the prepared folder in step with the form, so the agent reads what the user sees.
let pending: ReturnType<typeof setTimeout> | undefined
watch(
  [() => ({ ...form }), prepared],
  () => {
    clearTimeout(pending)
    const dir = root.value
    const at = prepared.value
    if (!at || !dir) return
    pending = setTimeout(() => writeText(dir, START_FILE, startJson(form, at.id)).catch((err) => (ui.error = (err as Error).message)), 300)
  },
  { immediate: true },
)

const isStory = VIDEO_KIND === 'story'
const hasSource = computed(() =>
  isStory ? Boolean(form.story.trim()) : Boolean(form.productUrl.trim() || form.sourceFolder.trim() || form.sourceCodePath.trim() || form.description.trim()),
)
const INTRO = isStory
  ? {
      title: '把故事做成動畫影片',
      text: '準備一個資料夾、寫下你的故事（只有一個點子也可以），再把產生的一段話貼給 Agent（例如 Claude）。它會陪你把故事補完整、畫角色、配聲音、做成動畫，這個網頁同步顯示進度。',
    }
  : {
      title: '做產品介紹影片',
      text: '準備一個資料夾、填產品資訊，再把產生的一段話貼給 Agent（例如 Claude）。它會寫旁白、錄畫面、合成影片，這個網頁同步顯示進度。',
    }
/** The step the user should do now: 1 folder, 2 product or story, 3 paste the message. */
const current = computed(() => (needsFolder.value ? 1 : !hasSource.value ? 2 : 3))
const message = computed(() => launchMessage(form, prepared.value))

const links = [
  ['Agent 指引', api('agent-guide.md')],
  ['資源索引', api('index.json')],
  ['工作流程', api('workflow.json')],
  ['Skill', api(`skills/${SKILL}.zip`)],
  ['專案範本', api(`templates/${TEMPLATE}.zip`)],
]
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-10 pb-16 sm:pt-14">
    <div class="text-center">
      <h1 class="text-2xl font-bold tracking-tight text-balance sm:text-4xl">
        讓 Agent 在你的電腦上<br />
        {{ INTRO.title }}
      </h1>
      <p class="mx-auto mt-3 max-w-xl text-pretty text-slate-600 dark:text-slate-400" data-testid="intro">{{ INTRO.text }}</p>
      <ul class="mt-5 flex flex-wrap justify-center gap-2 text-xs text-slate-600 sm:text-sm dark:text-slate-300">
        <li class="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-slate-800 dark:bg-slate-900"><Icon name="sparkles" :size="14" class="text-sky-600" />不需要會寫程式或打指令</li>
        <li class="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-slate-800 dark:bg-slate-900"><Icon name="shield" :size="14" class="text-emerald-600" />檔案都留在你的電腦，不會上傳</li>
        <li class="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-slate-800 dark:bg-slate-900"><Icon name="film" :size="14" class="text-violet-600" />網頁上預覽、修改每一段</li>
      </ul>
    </div>

    <ol class="mt-10">
      <!-- 1. Project folder -->
      <li class="relative pb-6 pl-12" data-testid="step-folder">
        <span class="absolute top-9 bottom-0 left-4 w-0.5 -translate-x-1/2" :class="folder || !ui.supported ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'" aria-hidden="true" />
        <span class="step-no absolute top-0 left-0" :class="folder ? 'step-done' : current === 1 ? 'step-current' : ''">
          <Icon v-if="folder" name="check" :size="16" /><template v-else>1</template>
        </span>
        <div class="card p-5" :class="current === 1 ? 'ring-2 ring-sky-500/40' : ''">
          <h2 class="font-semibold">準備放影片的資料夾</h2>
          <div v-if="!ui.supported" class="callout mt-3 bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
            <Icon name="alert" class="mt-0.5" />
            <p>這個瀏覽器不能存取電腦上的資料夾，可以跳過這一步：Agent 會自己在它的工作資料夾裡建立影片專案。想在網頁上看進度、修改旁白，請改用電腦版 Chrome 或 Edge 開啟本頁。</p>
          </div>
          <div v-else-if="folder" class="mt-3 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/30" data-testid="project-folder">
            <Icon name="folder" class="text-emerald-600 dark:text-emerald-400" />
            <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ folder }}</span>
            <button type="button" class="btn-ghost btn-sm" :disabled="ui.loading" @click="pickFolder">更換</button>
          </div>
          <template v-else>
            <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">影片專案的所有檔案都會放在這裡。建議新建一個空資料夾，例如「acme-video」。</p>
            <div class="mt-4 flex flex-wrap gap-2">
              <button v-if="ui.remembered" type="button" class="btn-primary" @click="reconnect"><Icon name="folder" />繼續使用「{{ ui.remembered.name }}」</button>
              <button type="button" :class="ui.remembered ? 'btn-secondary' : 'btn-primary'" :disabled="ui.loading" data-testid="pick-folder" @click="pickFolder">
                <Icon name="folder" />{{ ui.loading ? '載入中…' : '選擇或建立資料夾…' }}
              </button>
            </div>
            <details class="mt-3 text-sm text-slate-600 dark:text-slate-400">
              <summary class="cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-200">第一次用？看看怎麼建立資料夾</summary>
              <ol class="mt-2 list-inside list-decimal space-y-1 pl-1">
                <li>按上面的按鈕，會跳出選擇資料夾的視窗。</li>
                <li>到你想放影片的地方（例如「文件」），按「新增資料夾」，取個名字（例如 acme-video）。</li>
                <li>選這個新資料夾，按「選取資料夾」；瀏覽器詢問存取權限時按「允許」或「編輯檔案」。</li>
              </ol>
            </details>
            <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">已經有做到一半的影片專案？選它的資料夾就能直接繼續編輯。</p>
          </template>
          <p v-if="ui.error" class="callout mt-3 bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-300" role="alert"><Icon name="alert" class="mt-0.5" />{{ ui.error }}</p>
        </div>
      </li>

      <!-- 2. Product or story -->
      <li class="relative pb-6 pl-12" data-testid="step-product">
        <span class="absolute top-9 bottom-0 left-4 w-0.5 -translate-x-1/2" :class="hasSource ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'" aria-hidden="true" />
        <span class="step-no absolute top-0 left-0" :class="hasSource ? 'step-done' : current === 2 ? 'step-current' : ''">
          <Icon v-if="hasSource" name="check" :size="16" /><template v-else>2</template>
        </span>
        <div class="card p-5" :class="current === 2 ? 'ring-2 ring-sky-500/40' : ''">
          <component :is="sourceForm" :form="form" />
        </div>
      </li>

      <!-- 3. Agent -->
      <li class="relative pb-6 pl-12" data-testid="step-run">
        <span class="absolute top-9 bottom-0 left-4 w-0.5 -translate-x-1/2 bg-slate-200 dark:bg-slate-800" aria-hidden="true" />
        <span class="step-no absolute top-0 left-0" :class="current === 3 ? 'step-current' : ''">3</span>
        <div class="card p-5" :class="current === 3 ? 'ring-2 ring-sky-500/40' : 'opacity-80'">
          <h2 class="font-semibold">打開 Agent，貼上這段話</h2>
          <p v-if="needsFolder" class="mt-2 text-sm text-slate-500 dark:text-slate-400">請先在步驟 1 準備放影片的資料夾。</p>
          <p v-else-if="!hasSource" class="mt-2 text-sm text-slate-500 dark:text-slate-400">{{ isStory ? '請先在步驟 2 寫下你的故事或點子。' : '請先在步驟 2 填入產品網址、原始碼資料夾或一句說明。' }}</p>
          <template v-else>
            <ol class="mt-3 space-y-2.5 text-sm">
              <li class="flex gap-2.5">
                <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">a</span>
                <span>打開 Agent。還沒有的話，到 <a href="https://claude.ai/download" target="_blank" rel="noopener" class="link">claude.ai/download</a> 下載 Claude 桌面版，安裝後登入，切到上方的「Code」。其他 Coding Agent 也可以，只要它能讀網址、在你的電腦上工作。</span>
              </li>
              <li class="flex gap-2.5">
                <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">b</span>
                <span v-if="folder">開一個新的對話。請在 Agent 中開啟步驟 1 準備的「{{ folder }}」資料夾（若它詢問路徑，請選取或貼上該資料夾）。</span>
                <span v-else>開一個新的對話。它會請你選一個資料夾：選你想存放影片的地方，例如「文件」。</span>
              </li>
              <li class="flex gap-2.5">
                <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">c</span>
                <span>按「複製這段話」，到 Agent 的對話框貼上（<span class="kbd">{{ os === 'mac' ? '⌘+V' : 'Ctrl+V' }}</span>），再按送出。</span>
              </li>
            </ol>

            <div class="mt-4 overflow-hidden rounded-xl border border-sky-200 dark:border-sky-900">
              <div class="flex items-center justify-between gap-2 border-b border-sky-200 bg-sky-50 px-3 py-2 dark:border-sky-900 dark:bg-sky-950/50">
                <span class="flex items-center gap-1.5 text-sm font-medium text-sky-900 dark:text-sky-200"><Icon name="message" :size="14" />要貼給 Agent 的話</span>
                <CopyButton :text="message" label="複製這段話" primary />
              </div>
              <pre class="max-h-64 overflow-auto bg-white p-3.5 font-sans text-sm leading-relaxed break-words whitespace-pre-wrap dark:bg-slate-950" data-testid="launch-message">{{ message }}</pre>
            </div>

            <div class="mt-4 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/50">
              <p class="font-medium">接下來 Agent 會：</p>
              <ul class="mt-2 grid gap-1.5 text-slate-700 sm:grid-cols-2 dark:text-slate-300">
                <li class="flex gap-2"><Icon name="check" :size="14" class="mt-0.5 text-emerald-600" /><span v-if="folder">在「{{ folder }}」裡建立影片專案</span><span v-else>在你選的資料夾裡建立影片專案，並告訴你它在哪裡</span></li>
                <li class="flex gap-2"><Icon name="check" :size="14" class="mt-0.5 text-emerald-600" />電腦缺少需要的工具時，自動替你安裝或執行所有指令</li>
                <template v-if="isStory">
                  <li class="flex gap-2"><Icon name="check" :size="14" class="mt-0.5 text-emerald-600" />問你幾個問題：給誰看、喜歡的畫風、能否使用線上語音服務</li>
                  <li class="flex gap-2"><Icon name="check" :size="14" class="mt-0.5 text-emerald-600" />和你一起把故事補完整，畫出角色、挑好聲音，每一步都請你確認</li>
                </template>
                <template v-else>
                  <li class="flex gap-2"><Icon name="check" :size="14" class="mt-0.5 text-emerald-600" />問你幾個問題：影片語言與長度、旁白能否使用線上語音服務</li>
                  <li class="flex gap-2"><Icon name="check" :size="14" class="mt-0.5 text-emerald-600" />分析產品、寫分鏡；每完成一段就停下來請你確認</li>
                </template>
              </ul>
              <p class="mt-3 text-slate-600 dark:text-slate-400">在對話中直接回答它就好。看不懂它的問題時，可以回它「請用更簡單的方式說明」。</p>
            </div>
          </template>
        </div>
      </li>

      <!-- 4. Progress -->
      <li v-if="ui.supported" class="relative pl-12" data-testid="step-review">
        <span class="step-no absolute top-0 left-0">4</span>
        <div class="card p-5" :class="current === 3 && folder ? '' : 'opacity-80'">
          <h2 class="font-semibold">在這裡看進度、修改</h2>
          <div v-if="folder && activity" class="mt-3"><ActivityBanner /></div>
          <p v-else-if="folder" class="mt-2 flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-400" role="status" data-testid="waiting">
            <span class="relative mt-1.5 flex h-2 w-2 shrink-0" aria-hidden="true">
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />
              <span class="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
            </span>
            <span>等 Agent 在「{{ folder }}」建立專案。建好後這個頁面會自動切換，你可以看到進度、修改旁白、預覽每一段影片。</span>
          </p>
          <p v-else class="mt-1 text-sm text-slate-600 dark:text-slate-400">完成步驟 1 後，Agent 一建好專案，這個頁面就會自動顯示進度。</p>
        </div>
      </li>
    </ol>

    <details class="mt-10 rounded-xl border border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
      <summary class="cursor-pointer font-medium select-none">進階：Guide API</summary>
      <p class="mt-3">Agent 讀取的規則與範本都是靜態檔案：</p>
      <ul class="mt-2 space-y-1.5">
        <li v-for="[label, url] in links" :key="url" class="flex gap-2">
          <Icon name="link" :size="14" class="mt-0.5 text-slate-400" />
          <span>{{ label }}：<a :href="url" class="link break-all">{{ url }}</a></span>
        </li>
      </ul>
    </details>
  </div>
</template>
