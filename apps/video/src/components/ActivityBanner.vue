<script setup lang="ts">
import { useActivity } from '@aoa/web-shared/activity'
import { activity } from '../lib/store'
import Icon from './Icon.vue'

const act = useActivity(activity)
</script>

<template>
  <div
    v-if="act?.waitingForUser"
    class="callout border border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-100"
    role="status"
    data-testid="activity"
    data-state="waiting"
  >
    <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100"><Icon name="message" :size="14" /></span>
    <p class="min-w-0">
      <span class="font-semibold">Agent 在等你回覆：</span>{{ act.message }}
      <span class="mt-0.5 block text-amber-800 dark:text-amber-300">請回到 Agent 的對話視窗回答它。（{{ act.ago }}）</span>
    </p>
  </div>
  <div
    v-else-if="act?.current"
    class="callout border border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-100"
    role="status"
    data-testid="activity"
    data-state="working"
  >
    <span class="relative mt-1.5 flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
      <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />
      <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-500" />
    </span>
    <p class="min-w-0"><span class="font-semibold">Agent 正在工作：</span>{{ act.message }} <span class="text-sky-700 dark:text-sky-300">（{{ act.ago }}）</span></p>
  </div>
  <p v-else-if="act" class="flex items-center gap-2 px-1 text-sm text-slate-500 dark:text-slate-400" data-testid="activity" data-state="idle">
    <span class="h-2 w-2 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
    <span class="min-w-0">Agent 最後的動態（{{ act.ago }}）：{{ act.message }}</span>
  </p>
</template>
