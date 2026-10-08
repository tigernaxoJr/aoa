<script setup lang="ts">
// The open project's name in the header, as a menu: switch to another recent project, open another
// folder, or close the project. The parent decides whether unsaved edits allow leaving.
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { forgetRecent, ui } from '../lib/store'
import Icon from './Icon.vue'

defineProps<{ name: string }>()
const emit = defineEmits<{ switch: [handle: FileSystemDirectoryHandle]; pick: []; close: [] }>()

const open = ref(false)
const box = ref<HTMLElement | null>(null)
const button = ref<HTMLButtonElement | null>(null)

const when = (t: number) => new Date(t).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })

function onPointer(e: PointerEvent) {
  if (!box.value?.contains(e.target as Node)) open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  open.value = false
  button.value?.focus()
}
watch(open, (on) => {
  if (on) {
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    nextTick(() => box.value?.querySelector<HTMLElement>('[role=menuitem]')?.focus())
  } else {
    document.removeEventListener('pointerdown', onPointer)
    document.removeEventListener('keydown', onKey)
  }
})
onBeforeUnmount(() => (open.value = false))

/** Arrow keys move between the menu's items. */
function move(e: KeyboardEvent, step: number) {
  const items = [...(box.value?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])]
  const at = items.indexOf(document.activeElement as HTMLElement)
  items[(at + step + items.length) % items.length]?.focus()
  e.preventDefault()
}

function act(fn: () => void) {
  open.value = false
  fn()
}
</script>

<template>
  <div ref="box" class="relative min-w-0" data-testid="project-switcher">
    <button
      ref="button"
      type="button"
      class="flex max-w-full min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
      :aria-expanded="open"
      aria-haspopup="menu"
      title="切換專案"
      @click="open = !open"
    >
      <span class="min-w-0 truncate" data-testid="project-name">{{ name }}</span>
      <Icon name="down" :size="14" class="shrink-0 text-slate-400 transition-transform" :class="open ? 'rotate-180' : ''" />
    </button>

    <div
      v-if="open"
      class="fixed inset-x-4 top-14 z-40 overflow-hidden sm:absolute sm:inset-x-auto sm:top-full sm:left-0 sm:mt-1.5 sm:w-80 rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900"
      role="menu"
      aria-label="切換專案"
      @keydown.down="move($event, 1)"
      @keydown.up="move($event, -1)"
    >
      <template v-if="ui.recent.length">
        <p class="px-3 pt-2.5 pb-1 text-xs font-medium text-slate-500 dark:text-slate-400">最近的專案</p>
      <ul class="max-h-80 overflow-y-auto pb-1">
        <li v-for="r in ui.recent" :key="`${r.handle.name}-${r.openedAt}`" class="group flex items-center">
          <button
            type="button"
            role="menuitem"
            class="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none disabled:cursor-default dark:hover:bg-slate-800/60 dark:focus:bg-slate-800/60"
            :class="r.last ? 'bg-sky-50/60 dark:bg-sky-950/30' : ''"
            :aria-current="r.last ? 'true' : undefined"
            :disabled="ui.loading"
            data-testid="switch-project"
            @click="r.last ? (open = false) : act(() => emit('switch', r.handle))"
          >
            <Icon :name="r.last ? 'check' : 'folder'" :size="16" class="shrink-0" :class="r.last ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400'" />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ r.projectName ?? '還沒建立專案' }}</span>
              <span class="block truncate text-xs text-slate-500 dark:text-slate-400">資料夾「{{ r.handle.name }}」· {{ r.last ? '開啟中' : when(r.openedAt) }}</span>
            </span>
          </button>
          <button
            v-if="!r.last"
            type="button"
            class="icon-btn mr-1.5 opacity-60 group-hover:opacity-100 focus:opacity-100"
            :aria-label="`從清單移除 ${r.handle.name}`"
            title="從清單移除（不會刪除檔案）"
            @click="forgetRecent(r.handle)"
          >
            <Icon name="x" :size="14" />
          </button>
        </li>
      </ul>
      </template>
      <div class="border-t border-slate-100 py-1 dark:border-slate-800">
        <button
          type="button"
          role="menuitem"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none dark:hover:bg-slate-800/60 dark:focus:bg-slate-800/60"
          @click="act(() => emit('pick'))"
        >
          <Icon name="folder" :size="16" class="text-slate-400" />開啟其他資料夾…
        </button>
        <button
          type="button"
          role="menuitem"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none dark:hover:bg-slate-800/60 dark:focus:bg-slate-800/60"
          title="關閉專案（檔案會留在資料夾）"
          @click="act(() => emit('close'))"
        >
          <Icon name="logout" :size="16" class="text-slate-400" />關閉專案
        </button>
      </div>
    </div>
  </div>
</template>
