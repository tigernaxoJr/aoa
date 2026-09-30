<script setup lang="ts">
import { computed } from 'vue'
import { STEPS } from '../lib/site'
import { companion } from '../lib/companion'
import { runCompanion, state } from '../lib/store'
import CopyButton from './CopyButton.vue'

const status = computed(() => state.value!.project.status)
const next = computed(() => state.value!.next)
/** The step after the last completed one is "current". */
const current = computed(() => STEPS.findIndex((s) => !(s.done as readonly string[]).includes(status.value)))
/** Redo every stale scene with the Companion (deterministic), then assemble. */
async function redoAll() {
  for (const s of stale.value) {
    if (!(await runCompanion('rebuild', `重新產生 ${s.id}`, s.id))) return
  }
  await runCompanion('assemble', '合成影片')
}
const stale = computed(() => state.value!.scenes.filter((s) => (s.outdated || s.scene?.status === 'stale') && !s.scene?.locked))
</script>

<template>
  <section class="card p-4 sm:p-5">
    <ol class="grid grid-cols-5 gap-2" aria-label="工作流程">
      <li v-for="(step, i) in STEPS" :key="step.id" class="min-w-0">
        <div
          class="h-1.5 rounded-full"
          :class="i < current || current === -1 ? 'bg-sky-600' : i === current ? 'bg-sky-300 dark:bg-sky-800' : 'bg-slate-200 dark:bg-slate-700'"
        />
        <p class="mt-2 hidden truncate text-sm sm:block" :class="i === current ? 'font-semibold' : 'text-slate-500'">{{ step.label }}</p>
      </li>
    </ol>
    <p class="mt-2 text-sm font-semibold sm:hidden">
      {{ current === -1 ? '全部完成' : `步驟 ${current + 1}／${STEPS.length}：${STEPS[current].label}` }}
    </p>

    <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p class="text-sm text-slate-600 dark:text-slate-400">
        專案狀態 <code class="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">{{ status }}</code>
        <span v-if="state!.lock.active" class="ml-2 text-amber-700 dark:text-amber-400">· {{ state!.lock.writer ?? 'Agent' }} 正在寫入</span>
      </p>
      <div v-if="next.command" class="flex items-center gap-2">
        <span class="text-sm text-slate-500">下一步</span>
        <code class="rounded bg-slate-100 px-2 py-1 font-mono text-sm dark:bg-slate-800" data-testid="next-command">{{ next.command }}</code>
        <CopyButton :text="next.command" />
      </div>
      <p v-else class="text-sm text-slate-500" data-testid="next-command">{{ next.reason }}</p>
    </div>

    <div
      v-if="stale.length"
      class="mt-4 flex flex-col gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:bg-amber-950 dark:text-amber-100"
      role="status"
      data-testid="stale-banner"
    >
      <template v-if="companion.state === 'ready'">
        <span>{{ stale.length }} 個 scene 待更新。</span>
        <span class="flex flex-wrap gap-2">
          <button type="button" class="btn-primary py-1" :disabled="!!companion.running" data-testid="redo-all" @click="redoAll">立即重做並合成</button>
          <button type="button" class="btn-secondary py-1" :disabled="!!companion.running" title="需要改寫文案或分鏡時，交給 Agent 判斷" @click="runCompanion('sync', 'Agent 同步變更')">交給 Agent 處理</button>
        </span>
      </template>
      <template v-else>
        <span>{{ stale.length }} 個 scene 待更新。網頁無法直接叫醒 Agent，請在終端機的 Agent 中執行 <code>/video-sync</code>（或啟動 <code>npx video-agent serve</code> 以便直接在這裡重做）。</span>
        <CopyButton text="/video-sync" />
      </template>
    </div>
  </section>
</template>
