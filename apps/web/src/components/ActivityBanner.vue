<script setup lang="ts">
import { useActivity } from '../lib/activity'

const act = useActivity()
</script>

<template>
  <div
    v-if="act?.waitingForUser"
    class="flex items-start gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100"
    role="status"
    data-testid="activity"
    data-state="waiting"
  >
    <span class="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
    <p class="min-w-0">
      <span class="font-medium">Agent 在等你回覆：</span>{{ act.message }}
      <span class="block text-amber-800 dark:text-amber-300">請回到 Agent 的對話視窗回答它。（{{ act.ago }}）</span>
    </p>
  </div>
  <div
    v-else-if="act?.current"
    class="flex items-start gap-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-950 dark:bg-sky-950/60 dark:text-sky-100"
    role="status"
    data-testid="activity"
    data-state="working"
  >
    <span class="mt-1 inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-500" aria-hidden="true" />
    <p class="min-w-0"><span class="font-medium">Agent 正在工作：</span>{{ act.message }} <span class="text-sky-700 dark:text-sky-300">（{{ act.ago }}）</span></p>
  </div>
  <p v-else-if="act" class="text-sm text-slate-500" data-testid="activity" data-state="idle">Agent 最後的動態（{{ act.ago }}）：{{ act.message }}</p>
</template>
