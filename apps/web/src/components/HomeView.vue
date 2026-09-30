<script setup lang="ts">
import { computed, reactive } from 'vue'
import { api, launchCommand } from '../lib/site'
import { pickFolder, reconnect, ui } from '../lib/store'
import CopyButton from './CopyButton.vue'

const source = reactive({ productUrl: '', sourceCodePath: '', description: '' })
const command = computed(() => launchCommand(source))

const links = [
  ['Agent 指引', api('agent-guide.md')],
  ['資源索引', api('index.json')],
  ['工作流程', api('workflow.json')],
  ['Skill', api('skills/product-video.zip')],
  ['專案範本', api('templates/product-video.zip')],
]
</script>

<template>
  <div class="mx-auto grid max-w-5xl gap-6 px-4 py-10 lg:grid-cols-5">
    <section class="lg:col-span-3">
      <h1 class="text-2xl font-bold tracking-tight">在你的電腦上，讓 Agent 做產品介紹影片</h1>
      <p class="mt-2 text-slate-600 dark:text-slate-400">
        填入產品來源，複製指令到終端機執行。Agent 會在目前目錄建立影片專案，逐段產生旁白、畫面與影片。所有檔案都留在你的電腦上。
      </p>

      <form class="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900" @submit.prevent>
        <label class="block">
          <span class="text-sm font-medium">產品網址</span>
          <input v-model="source.productUrl" type="url" placeholder="https://example.com" class="field" />
        </label>
        <label class="block">
          <span class="text-sm font-medium">原始碼資料夾（選填）</span>
          <input v-model="source.sourceCodePath" type="text" placeholder="../my-product" class="field" />
        </label>
        <label class="block">
          <span class="text-sm font-medium">產品說明（選填）</span>
          <textarea v-model="source.description" rows="3" placeholder="一句話說明產品、目標受眾" class="field" />
        </label>
        <div>
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium">啟動指令</span>
            <CopyButton :text="command" />
          </div>
          <pre class="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-100 p-3 font-mono text-sm dark:bg-slate-800" data-testid="launch-command">{{ command }}</pre>
          <p class="mt-2 text-xs text-slate-500">已安裝 product-video Skill 時，也可以在 Claude Code 中直接輸入 <code>/product-video &lt;產品網址&gt;</code>。</p>
        </div>
      </form>
    </section>

    <aside class="space-y-6 lg:col-span-2">
      <section class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <h2 class="font-semibold">開啟影片專案</h2>
        <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">選擇含有 <code>video.project.json</code> 的資料夾，查看進度、修改文案與預覽影片。</p>
        <template v-if="ui.supported">
          <button
            v-if="ui.remembered"
            type="button"
            class="btn-primary mt-4 w-full"
            @click="reconnect"
          >
            繼續編輯「{{ ui.remembered.name }}」
          </button>
          <button type="button" :class="ui.remembered ? 'btn-secondary' : 'btn-primary'" class="mt-3 w-full" :disabled="ui.loading" @click="pickFolder">
            {{ ui.loading ? '載入中…' : '開啟專案資料夾' }}
          </button>
        </template>
        <p v-else class="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          這個瀏覽器不支援讀寫本機資料夾。請改用桌面版 Chrome 或 Edge 開啟本頁。
        </p>
        <p v-if="ui.error" class="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{{ ui.error }}</p>
      </section>

      <section class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <h2 class="font-semibold">Guide API</h2>
        <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">Agent 讀取的規則與範本，都是靜態檔案。</p>
        <ul class="mt-3 space-y-2 text-sm">
          <li v-for="[label, url] in links" :key="url" class="flex flex-col">
            <span class="text-slate-500">{{ label }}</span>
            <a :href="url" class="break-all text-sky-700 hover:underline dark:text-sky-400">{{ url }}</a>
          </li>
        </ul>
      </section>
    </aside>
  </div>
</template>
