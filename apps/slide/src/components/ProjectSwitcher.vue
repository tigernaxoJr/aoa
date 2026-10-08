<script setup lang="ts">
// The open project's title in the header, as a menu: switch to another recent project, open another
// folder, or close the project.
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { closeProject, forgetRecent, pickFolder, recentList, reopen } from '../lib/store'

defineProps<{ name: string }>()

const open = ref(false)
const busy = ref(false)
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

async function act(fn: () => Promise<void>) {
  open.value = false
  busy.value = true
  try {
    await fn()
  } finally {
    busy.value = false
  }
}

const item =
  'flex w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left text-sm cursor-pointer hover:bg-slate-50 focus:bg-slate-50 focus:outline-none disabled:cursor-default dark:hover:bg-slate-800/60 dark:focus:bg-slate-800/60'
</script>

<template>
  <div ref="box" class="relative min-w-0" data-testid="project-switcher">
    <button
      ref="button"
      type="button"
      class="flex max-w-full min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
      :aria-expanded="open"
      aria-haspopup="menu"
      title="切換專案"
      :disabled="busy"
      @click="open = !open"
    >
      <span class="min-w-0 truncate" data-testid="project-name">{{ name }}</span>
      <svg class="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform" :class="open ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <div
      v-if="open"
      class="fixed inset-x-4 top-14 z-40 overflow-hidden sm:absolute sm:inset-x-auto sm:top-full sm:left-0 sm:mt-1.5 sm:w-80 rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900"
      role="menu"
      aria-label="切換專案"
      @keydown.down="move($event, 1)"
      @keydown.up="move($event, -1)"
    >
      <template v-if="recentList.length">
        <p class="px-3 pt-2.5 pb-1 text-xs font-medium text-slate-500 dark:text-slate-400">最近的專案</p>
        <ul class="max-h-80 overflow-y-auto pb-1">
          <li v-for="r in recentList" :key="`${r.handle.name}-${r.openedAt}`" class="group flex items-center">
            <button
              type="button"
              role="menuitem"
              :class="[item, r.last ? 'bg-slate-100/70 dark:bg-slate-800/50' : '']"
              :aria-current="r.last ? 'true' : undefined"
              data-testid="switch-project"
              @click="r.last ? (open = false) : act(() => reopen(r.handle))"
            >
              <svg v-if="r.last" class="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 6 9 17l-5-5" />
              </svg>
              <svg v-else class="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{{ r.projectName ?? '還沒建立專案' }}</span>
                <span class="block truncate text-xs text-slate-500 dark:text-slate-400">資料夾「{{ r.handle.name }}」· {{ r.last ? '開啟中' : when(r.openedAt) }}</span>
              </span>
            </button>
            <button
              v-if="!r.last"
              type="button"
              class="mr-1.5 rounded-lg p-1.5 text-slate-400 opacity-60 cursor-pointer hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 focus:opacity-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
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
      </template>
      <div class="border-t border-slate-100 py-1 dark:border-slate-800">
        <button type="button" role="menuitem" :class="item" @click="act(pickFolder)">
          <svg class="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          開啟其他資料夾…
        </button>
        <button type="button" role="menuitem" :class="item" title="關閉專案（檔案會留在資料夾）" @click="act(closeProject)">
          <svg class="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          關閉專案
        </button>
      </div>
    </div>
  </div>
</template>
