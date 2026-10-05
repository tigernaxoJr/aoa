<script setup lang="ts">
import { computed } from 'vue'
import { useActivity } from '@aoa/web-shared/activity'
import { activity } from '../lib/store'

const liveActivity = useActivity(activity)

const steps = [
  { id: 'init', label: '1. 初始化' },
  { id: 'outline', label: '2. 大綱規劃' },
  { id: 'draft', label: '3. 撰寫文案' },
  { id: 'visual', label: '4. 視覺注入' },
  { id: 'export', label: '5. 匯出 PDF' },
]

const currentStepId = computed(() => liveActivity.value?.step || 'init')

function stepStatus(stepId: string) {
  const order = ['init', 'outline', 'draft', 'visual', 'export']
  const currIdx = order.indexOf(currentStepId.value)
  const stepIdx = order.indexOf(stepId)

  if (currIdx > stepIdx) return 'completed'
  if (currIdx === stepIdx) return 'active'
  return 'pending'
}
</script>

<template>
  <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <!-- Steps Tracker -->
    <div class="flex items-center justify-between gap-2 overflow-x-auto pb-3 sm:pb-0">
      <div
        v-for="(s, idx) in steps"
        :key="s.id"
        class="flex items-center gap-2 text-xs font-medium whitespace-nowrap"
      >
        <span
          class="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors"
          :class="[
            stepStatus(s.id) === 'completed'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
              : stepStatus(s.id) === 'active'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs ring-2 ring-slate-400/30'
                : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
          ]"
        >
          <template v-if="stepStatus(s.id) === 'completed'">✓</template>
          <template v-else>{{ idx + 1 }}</template>
        </span>
        <span
          :class="[
            stepStatus(s.id) === 'active'
              ? 'font-semibold text-slate-900 dark:text-white'
              : stepStatus(s.id) === 'completed'
                ? 'text-slate-700 dark:text-slate-300'
                : 'text-slate-400 dark:text-slate-500'
          ]"
        >
          {{ s.label.slice(3) }}
        </span>
        <span v-if="idx < steps.length - 1" class="text-slate-300 dark:text-slate-700 px-1">→</span>
      </div>
    </div>

    <!-- Active Message Bar -->
    <div
      v-if="liveActivity"
      class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-xs transition-colors"
      :class="[
        liveActivity.waitingForUser
          ? 'border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200'
          : 'border border-slate-100 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300'
      ]"
    >
      <div class="flex items-center gap-2 min-w-0">
        <span
          class="h-2 w-2 rounded-full shrink-0"
          :class="[
            liveActivity.waitingForUser
              ? 'bg-amber-500 animate-ping'
              : liveActivity.current
                ? 'bg-emerald-500 animate-pulse'
                : 'bg-slate-400'
          ]"
        ></span>
        <span v-if="liveActivity.waitingForUser" class="font-bold text-amber-700 dark:text-amber-400 shrink-0">
          [等待確認]
        </span>
        <span class="truncate font-medium">{{ liveActivity.message }}</span>
        <span v-if="liveActivity.currentSlide && liveActivity.totalSlides" class="shrink-0 text-slate-400">
          (頁數: {{ liveActivity.currentSlide }} / {{ liveActivity.totalSlides }})
        </span>
      </div>

      <div class="shrink-0 text-slate-400 dark:text-slate-500">
        {{ liveActivity.ago }}
      </div>
    </div>
  </div>
</template>
