<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import FinalPanel from './components/FinalPanel.vue'
import HomeView from './components/HomeView.vue'
import SceneBoard from './components/SceneBoard.vue'
import SceneEditor from './components/SceneEditor.vue'
import WorkflowBar from './components/WorkflowBar.vue'
import CompanionStatus from './components/CompanionStatus.vue'
import { companion, connect, takePairingFromUrl } from './lib/companion'
import { close, reload, restore, state, ui } from './lib/store'

const selected = ref<string | null>(null)
onMounted(() => {
  takePairingFromUrl()
  connect(undefined, reload)
  restore()
})
// Drop the selection when that scene leaves the project.
watch(state, (st) => {
  if (selected.value && !st?.scenes.some((s) => s.id === selected.value)) selected.value = null
})
</script>

<template>
  <header class="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
    <div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
      <span class="shrink-0 whitespace-nowrap font-semibold tracking-tight">Agent Video Producer</span>
      <template v-if="state">
        <span class="text-slate-300 dark:text-slate-600">/</span>
        <span class="min-w-0 truncate text-sm" data-testid="project-name">{{ state.project.project.name }}</span>
        <span class="ml-auto" />
        <CompanionStatus />
        <button type="button" class="shrink-0 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" @click="close">關閉專案</button>
      </template>
      <template v-else>
        <span class="ml-auto" />
        <CompanionStatus />
      </template>
    </div>
  </header>

  <main>
    <HomeView v-if="!state" />
    <div v-else class="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <p v-if="state.errors.length" class="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200" role="alert">
        專案檔有問題，請讓 Agent 執行 <code>pnpm run validate</code> 修正：<br />
        <span v-for="e in state.errors.slice(0, 5)" :key="e" class="block font-mono text-xs">{{ e }}</span>
      </p>
      <WorkflowBar />
      <div class="grid gap-5 lg:grid-cols-5">
        <div class="space-y-5" :class="selected ? 'lg:col-span-2' : 'lg:col-span-3'">
          <SceneBoard v-model:selected="selected" />
        </div>
        <div class="space-y-5" :class="selected ? 'lg:col-span-3' : 'lg:col-span-2'">
          <SceneEditor v-if="selected" :id="selected" @close="selected = null" />
          <FinalPanel />
        </div>
      </div>
    </div>
  </main>

  <div
    v-if="companion.running"
    class="fixed inset-x-4 bottom-4 mx-auto max-w-md rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg sm:inset-x-auto sm:right-4 dark:bg-slate-700"
    role="status"
    data-testid="companion-running"
  >
    <p class="font-medium">{{ companion.running }}…</p>
    <p v-if="companion.lastLine" class="mt-1 truncate font-mono text-xs text-slate-300">{{ companion.lastLine }}</p>
  </div>
  <div
    v-else-if="ui.notice"
    class="fixed inset-x-4 bottom-4 mx-auto max-w-md rounded-lg px-4 py-3 text-sm shadow-lg sm:inset-x-auto sm:right-4"
    :class="{
      'bg-emerald-700 text-white': ui.notice.kind === 'ok',
      'bg-amber-500 text-slate-950': ui.notice.kind === 'warn',
      'bg-red-700 text-white': ui.notice.kind === 'error',
    }"
    role="status"
    data-testid="notice"
  >
    {{ ui.notice.text }}
  </div>
</template>
