<script setup lang="ts">
// Step 2 of the start page: the product URL, its source folder and a description.
import { computed, onMounted, ref } from 'vue'
import type { SourceInput } from '@video-core/web/lib/site'
import { baseName, pathHelp, platform, readSourceFolder } from '@video-core/web/lib/source'
import { ui } from '@video-core/web/lib/store'
import Icon from '@video-core/web/components/Icon.vue'

const props = defineProps<{ form: SourceInput }>()
const form = props.form
const os = platform()
const filledFrom = ref<string | null>(null)
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
</script>

<template>
<h2 class="font-semibold">告訴 Agent 產品是什麼</h2>
<p class="mt-1 text-sm text-slate-600 dark:text-slate-400">至少填一項；給得越多，影片越準確。</p>
<div class="mt-5 space-y-5">
  <div>
    <label class="block">
      <span class="label">產品網址</span>
      <input v-model.trim="form.productUrl" type="url" placeholder="https://example.com" class="field" />
    </label>
    <div v-if="form.productUrl" class="mt-2">
      <label class="flex items-start gap-2 text-sm">
        <input v-model="form.requiresLogin" type="checkbox" class="mt-0.5 h-4 w-4 accent-sky-600" data-testid="requires-login" />
        <span>這個網站要登入才看得到</span>
      </label>
      <p v-if="form.requiresLogin" class="callout mt-2 bg-slate-50 text-xs leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-slate-300" data-testid="requires-login-help">
        <Icon name="shield" :size="14" class="mt-0.5 text-emerald-600" />
        <span>不用在這裡填帳號密碼。錄影前，Agent 會打開一個瀏覽器視窗，請你像平常一樣登入，登入完關掉視窗就好；帳號密碼只在那個視窗輸入，Agent 看不到。建議用展示用的帳號，因為錄影會拍到登入後畫面上的內容。</span>
      </p>
    </div>
  </div>

  <div>
    <label for="source-path" class="label">產品原始碼資料夾 <span class="font-normal text-slate-500">（選填）</span></label>
    <div class="mt-1 flex flex-wrap items-center gap-2">
      <input
        id="source-path"
        v-model.trim="form.sourceCodePath"
        type="text"
        :placeholder="os === 'windows' ? '例如 C:\\code\\my-product' : '例如 /Users/me/code/my-product'"
        class="field mt-0 w-full min-w-0 sm:w-auto sm:flex-1"
        data-testid="source-path"
      />
      <button v-if="canPick" type="button" class="btn-secondary" data-testid="pick-source" @click="pickSource"><Icon name="folder" />選擇資料夾…</button>
    </div>
    <p class="hint">如果這個產品是你們自己開發的，填它的程式資料夾能讓影片更準確。Agent 只會讀取，不會修改。取得完整路徑：{{ pathHelp(os) }}</p>
    <div v-if="form.sourceFolder" class="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700" data-testid="source-folder">
      <Icon name="folder" class="text-slate-500" />
      <span class="min-w-0 flex-1 truncate text-sm">已讀取「<span class="font-medium">{{ form.sourceFolder }}</span>」</span>
      <button type="button" class="btn-ghost btn-sm" @click="clearSource">移除</button>
    </div>
    <p v-if="form.sourceFolder && !form.sourceCodePath" class="mt-1.5 text-xs text-amber-700 dark:text-amber-400" data-testid="source-path-missing">
      瀏覽器為了安全，只告訴網頁資料夾的名稱，不會給完整路徑。請照上面的方法把路徑貼進輸入框；沒填的話，Agent 會依名稱「{{ form.sourceFolder }}」在你的電腦上尋找並跟你確認。
    </p>
    <p v-if="pathMismatch" class="mt-1.5 text-xs text-amber-700 dark:text-amber-400" data-testid="source-path-mismatch">
      路徑最後的資料夾名稱和選擇的「{{ form.sourceFolder }}」不一樣，請確認填的是同一個資料夾。
    </p>
    <p v-if="filledFrom" class="mt-1.5 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400" data-testid="source-filled"><Icon name="check" :size="12" />{{ filledFrom }}</p>
  </div>

  <label class="block">
    <span class="label">產品說明 <span class="font-normal text-slate-500">（選填）</span></span>
    <textarea v-model="form.description" rows="3" placeholder="一兩句話：產品做什麼、給誰用" class="field" />
  </label>
</div>
</template>
