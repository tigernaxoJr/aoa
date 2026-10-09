<script setup lang="ts">
// Upload reference material for the agent into the project's references/ folder: files (drop or
// pick), pasted text, and a note on each saying what it is for. Shared by every workbench; each app
// sources this folder in its Tailwind build, so it only uses plain utility classes.
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  REFERENCES_DIR,
  REFERENCES_INDEX,
  type ReferenceItem,
  addReferenceFiles,
  addReferenceText,
  formatSize,
  listReferences,
  referencesAddedSay,
  removeReference,
  setReferenceNote,
} from './references'
import { tryFile } from './fsa'

const props = withDefaults(
  defineProps<{
    root: FileSystemDirectoryHandle | null
    /** What the agent should update after new references, e.g. 「簡報」; with it, the panel shows the sentence to hand over. */
    ask?: string | null
    /** Shown above the list. */
    intro?: string
  }>(),
  { ask: null, intro: '' },
)
const emit = defineEmits<{ change: [items: ReferenceItem[]] }>()

const items = shallowRef<ReferenceItem[]>([])
const thumbs = shallowRef(new Map<string, string>())
const busy = ref(false)
const error = ref<string | null>(null)
const dragging = ref(false)
const note = ref('')
const textOpen = ref(false)
const textTitle = ref('')
const textBody = ref('')
const editing = ref<string | null>(null)
const editNote = ref('')
/** Names added in this visit, for the sentence to hand the agent. */
const added = ref<string[]>([])
const copied = ref(false)
const input = ref<HTMLInputElement | null>(null)

async function refresh() {
  const root = props.root
  if (!root) {
    items.value = []
    return
  }
  try {
    const next = await listReferences(root)
    if (root !== props.root) return
    items.value = next
    await refreshThumbs(root, next)
    emit('change', next)
  } catch (err) {
    error.value = (err as Error).message
  }
}

/** Object URLs for image previews, made once per file version. */
async function refreshThumbs(root: FileSystemDirectoryHandle, list: ReferenceItem[]) {
  const next = new Map<string, string>()
  for (const item of list) {
    if (item.kind !== 'image') continue
    const key = `${item.path}:${item.size}`
    const old = thumbs.value.get(key)
    if (old) next.set(key, old)
    else {
      const file = await tryFile(root, item.path)
      if (file) next.set(key, URL.createObjectURL(file))
    }
  }
  for (const [key, url] of thumbs.value) if (next.get(key) !== url) URL.revokeObjectURL(url)
  thumbs.value = next
}
const thumb = (item: ReferenceItem) => thumbs.value.get(`${item.path}:${item.size}`)

async function run(fn: (root: FileSystemDirectoryHandle) => Promise<void>) {
  if (!props.root || busy.value) return
  busy.value = true
  error.value = null
  try {
    await fn(props.root)
  } catch (err) {
    error.value = `存檔失敗：${(err as Error).message}`
  } finally {
    busy.value = false
    await refresh()
  }
}

function addFiles(list: FileList | File[] | null | undefined) {
  const files = [...(list ?? [])].filter((f) => f.size > 0 || f.type)
  if (!files.length) return
  return run(async (root) => {
    const names = await addReferenceFiles(root, files, note.value)
    added.value = [...added.value, ...names]
    note.value = ''
  })
}

function onPick(e: Event) {
  const el = e.target as HTMLInputElement
  addFiles(el.files)
  el.value = ''
}

function onDrop(e: DragEvent) {
  dragging.value = false
  addFiles(e.dataTransfer?.files)
}

/** Pasting an image (e.g. a screenshot) anywhere on the drop zone adds it as a file. */
function onPaste(e: ClipboardEvent) {
  const files = [...(e.clipboardData?.files ?? [])]
  if (!files.length) return
  e.preventDefault()
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  addFiles(files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `貼上的圖片 ${stamp}${i ? `-${i + 1}` : ''}.${f.type.split('/')[1] || 'png'}`, { type: f.type }))))
}

function saveText() {
  if (!textBody.value.trim()) {
    error.value = '請貼上或輸入文字內容。'
    return
  }
  return run(async (root) => {
    const name = await addReferenceText(root, textTitle.value, textBody.value, note.value)
    added.value = [...added.value, name]
    textTitle.value = ''
    textBody.value = ''
    note.value = ''
    textOpen.value = false
  })
}

function startEdit(item: ReferenceItem) {
  editing.value = item.name
  editNote.value = item.note ?? ''
}

function saveNote(item: ReferenceItem) {
  const value = editNote.value
  editing.value = null
  if ((item.note ?? '') === value.trim()) return
  return run((root) => setReferenceNote(root, item.name, value))
}

function remove(item: ReferenceItem) {
  if (!confirm(`要從專案資料夾刪除「${item.name}」嗎？這會刪除 ${REFERENCES_DIR}/ 裡的這個檔案，你原本的檔案不受影響。`)) return
  return run(async (root) => {
    await removeReference(root, item.name)
    added.value = added.value.filter((n) => n !== item.name)
  })
}

async function copyAsk() {
  if (!props.ask) return
  await navigator.clipboard.writeText(referencesAddedSay(added.value, props.ask))
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

const ICON: Record<ReferenceItem['kind'], string> = { image: '🖼️', document: '📄', text: '📝', media: '🎞️', other: '📎' }

watch(
  () => props.root,
  () => {
    added.value = []
    editing.value = null
    refresh()
  },
)
// The agent or the user may change the folder outside the page: look again when the tab comes back.
const onFocus = () => refresh()
onMounted(() => {
  refresh()
  window.addEventListener('focus', onFocus)
})
onBeforeUnmount(() => {
  window.removeEventListener('focus', onFocus)
  for (const url of thumbs.value.values()) URL.revokeObjectURL(url)
})
</script>

<template>
  <div class="space-y-3" data-testid="references">
    <p v-if="intro" class="text-sm text-slate-600 dark:text-slate-400">{{ intro }}</p>

    <div
      class="rounded-xl border-2 border-dashed px-4 py-5 text-center text-sm transition-colors"
      :class="dragging ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40' : 'border-slate-300 dark:border-slate-700'"
      tabindex="0"
      data-testid="references-drop"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
      @paste="onPaste"
    >
      <p class="text-slate-600 dark:text-slate-300">把文件、圖片拖到這裡，或</p>
      <div class="mt-2 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          :disabled="busy || !root"
          data-testid="references-pick"
          @click="input?.click()"
        >
          選擇檔案…
        </button>
        <button
          type="button"
          class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          :disabled="busy || !root"
          :aria-expanded="textOpen"
          data-testid="references-text-toggle"
          @click="textOpen = !textOpen"
        >
          貼上文字
        </button>
      </div>
      <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">PDF、Word、PowerPoint、Excel、圖片、文字檔都可以；也能在這個框裡按 Ctrl+V 貼上截圖。</p>
      <input ref="input" type="file" multiple class="hidden" data-testid="references-input" @change="onPick" />
    </div>

    <label class="block">
      <span class="text-xs font-medium text-slate-700 dark:text-slate-300">接下來加入的資料是做什麼用的？（選填）</span>
      <input
        v-model="note"
        type="text"
        placeholder="例如：公司 logo 放在封面；這份報告的數據要做成圖表；照這張圖的配色"
        class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/25 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        data-testid="references-note"
        @keydown.enter.prevent
      />
    </label>

    <div v-if="textOpen" class="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700" data-testid="references-text">
      <input
        v-model="textTitle"
        type="text"
        placeholder="標題（例如：會議紀錄、產品規格）"
        class="block w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        data-testid="references-text-title"
        @keydown.enter.prevent
      />
      <textarea
        v-model="textBody"
        rows="5"
        placeholder="貼上文章、筆記、數據或任何想讓 Agent 參考的文字"
        class="block w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        data-testid="references-text-body"
      ></textarea>
      <div class="flex justify-end gap-2">
        <button type="button" class="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" @click="textOpen = false">取消</button>
        <button
          type="button"
          class="cursor-pointer rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          :disabled="busy"
          data-testid="references-text-save"
          @click="saveText"
        >
          存成參考資料
        </button>
      </div>
    </div>

    <p v-if="error" class="text-sm font-medium text-rose-600 dark:text-rose-400" role="alert">{{ error }}</p>

    <ul v-if="items.length" class="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700" data-testid="references-list">
      <li v-for="item in items" :key="item.name" class="flex items-start gap-3 px-3 py-2.5" data-testid="reference-item">
        <img v-if="thumb(item)" :src="thumb(item)" alt="" class="h-10 w-10 shrink-0 rounded-md border border-slate-200 object-cover dark:border-slate-700" />
        <span v-else class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-lg dark:bg-slate-800" aria-hidden="true">{{ ICON[item.kind] }}</span>
        <div class="min-w-0 flex-1">
          <p class="flex items-baseline gap-2 text-sm">
            <span class="truncate font-medium text-slate-900 dark:text-slate-100" :title="item.path">{{ item.name }}</span>
            <span class="shrink-0 text-xs text-slate-400">{{ formatSize(item.size) }}</span>
          </p>
          <div v-if="editing === item.name" class="mt-1 flex gap-2">
            <input
              v-model="editNote"
              type="text"
              placeholder="這份資料是做什麼用的"
              class="block w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              data-testid="reference-note-input"
              @keydown.enter.prevent="saveNote(item)"
              @keydown.esc="editing = null"
            />
            <button type="button" class="shrink-0 cursor-pointer text-xs font-medium text-sky-700 dark:text-sky-400" data-testid="reference-note-save" @click="saveNote(item)">儲存</button>
          </div>
          <button
            v-else
            type="button"
            class="mt-0.5 block max-w-full cursor-pointer truncate text-left text-xs hover:underline"
            :class="item.note ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 italic'"
            data-testid="reference-note"
            @click="startEdit(item)"
          >
            {{ item.note ?? '加上用途說明…' }}
          </button>
        </div>
        <button
          type="button"
          class="shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
          :disabled="busy"
          :aria-label="`刪除 ${item.name}`"
          data-testid="reference-remove"
          @click="remove(item)"
        >
          刪除
        </button>
      </li>
    </ul>
    <p v-else class="text-xs text-slate-500 dark:text-slate-400">還沒有參考資料。檔案會複製到專案資料夾的 <code>{{ REFERENCES_DIR }}/</code>，Agent 從那裡讀取。</p>

    <div v-if="ask && added.length" class="flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100" data-testid="references-ask">
      <span class="min-w-0 flex-1">把這句話交給 Agent：{{ referencesAddedSay(added, ask) }}</span>
      <button type="button" class="shrink-0 cursor-pointer rounded-lg border border-sky-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-sky-100 dark:border-sky-800 dark:bg-slate-900 dark:hover:bg-slate-800" @click="copyAsk">
        {{ copied ? '已複製' : '複製' }}
      </button>
    </div>
    <p v-if="items.length" class="text-xs text-slate-400">用途說明存在 {{ REFERENCES_INDEX }}，Agent 會一起讀。</p>
  </div>
</template>
