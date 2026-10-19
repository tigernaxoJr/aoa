<script setup lang="ts">
// Progress through the Skill's steps, what the Agent is doing, and what the user should do next.
import { computed } from 'vue'
import { useActivity } from '@aoa/web-shared/activity'
import { useNextStep } from '../lib/next'
import { activity, project } from '../lib/store'
import CopyButton from './CopyButton.vue'

const liveActivity = useActivity(activity)
const next = useNextStep()

const steps = [
  { id: 'init', label: '初始化' },
  { id: 'outline', label: '大綱' },
  { id: 'draft', label: '文案' },
  { id: 'visual', label: '視覺' },
  { id: 'export', label: '匯出' },
]
const order = steps.map((s) => s.id)

/** How many steps the project status says are finished; `failed` keeps whatever step the Agent was on. */
const DONE: Record<string, number> = { initialized: 1, outlined: 2, drafted: 3, visualized: 4, exported: 5 }

/**
 * Progress comes from slide.project.json, not the activity: the Agent sets the activity to `idle` when it
 * stops, which is not a step, and that used to blank the whole tracker after an export.
 */
const done = computed(() => {
  const status = project.value?.status
  if (status && status in DONE) return DONE[status]
  const at = order.indexOf(liveActivity.value?.step ?? '')
  return at === -1 ? 0 : at
})
/**
 * The step being worked on: the activity's when it is not finished yet, or when the Agent went back to an
 * earlier step within the last few minutes. The step it just finished (e.g. `export` after exporting)
 * counts as done; past the last step nothing is active.
 */
const active = computed(() => {
  const at = order.indexOf(liveActivity.value?.step ?? '')
  // Waiting for the user to confirm a step: that step is still the one in hand.
  if (at !== -1 && liveActivity.value?.waitingForUser) return at
  if (at >= done.value) return at
  if (at !== -1 && at < done.value - 1 && liveActivity.value?.current) return at
  return done.value
})

function stepStatus(stepId: string) {
  const at = order.indexOf(stepId)
  if (at < done.value && at !== active.value) return 'completed'
  if (at === active.value) return 'active'
  return 'pending'
}

/** The activity line under the steps; the next-step strip already says it while the Agent works or waits. */
const showActivity = computed(() => liveActivity.value && next.value.tone !== 'work' && next.value.tone !== 'wait')
</script>

<template>
  <section class="card overflow-hidden" data-testid="progress">
    <ol class="grid grid-cols-5 border-b border-stone-200 dark:border-stone-800" aria-label="製作進度">
      <li
        v-for="(s, idx) in steps"
        :key="s.id"
        class="relative px-2 py-3 text-center sm:px-4 sm:text-left"
        :class="idx > 0 ? 'border-l border-stone-200 dark:border-stone-800' : ''"
        :aria-current="stepStatus(s.id) === 'active' ? 'step' : undefined"
      >
        <span v-if="stepStatus(s.id) === 'active'" class="absolute inset-x-0 top-0 h-0.5 bg-accent" aria-hidden="true" />
        <span
          class="block font-mono text-[11px]"
          :class="stepStatus(s.id) === 'active' ? 'text-accent' : stepStatus(s.id) === 'completed' ? 'text-stone-500' : 'text-stone-400 dark:text-stone-600'"
        >
          <template v-if="stepStatus(s.id) === 'completed'">✓</template>
          <template v-else>0{{ idx + 1 }}</template>
        </span>
        <span
          class="mt-0.5 block text-xs sm:text-sm"
          :class="
            stepStatus(s.id) === 'active'
              ? 'font-semibold text-stone-900 dark:text-white'
              : stepStatus(s.id) === 'completed'
                ? 'text-stone-600 dark:text-stone-400'
                : 'text-stone-400 dark:text-stone-600'
          "
        >
          {{ s.label }}
        </span>
      </li>
    </ol>

    <div
      class="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between"
      :class="next.say ? 'bg-stone-50 dark:bg-stone-950/40' : ''"
      data-testid="next-step"
    >
      <div class="min-w-0 lg:max-w-[46%]">
        <p class="flex items-center gap-2 font-semibold">
          <span
            class="h-2 w-2 shrink-0 rounded-full"
            :class="{
              'animate-pulse bg-emerald-500': next.tone === 'work',
              'bg-accent': next.tone === 'wait' || next.tone === 'act',
              'bg-amber-500': next.tone === 'warn',
              'bg-stone-400': next.tone === 'done',
            }"
            aria-hidden="true"
          />
          {{ next.title }}
        </p>
        <p class="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
          {{ next.hint }}
          <span v-if="next.tone === 'work' && liveActivity?.currentSlide && liveActivity.totalSlides" class="font-mono text-xs text-stone-400">
            （{{ liveActivity.currentSlide }}/{{ liveActivity.totalSlides }}）
          </span>
        </p>
      </div>
      <div v-if="next.say" class="flex flex-col gap-2 sm:flex-row sm:items-stretch lg:w-[50%]">
        <q
          class="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm leading-relaxed text-stone-800 before:content-none after:content-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
          data-testid="next-say"
        >{{ next.say }}</q>
        <CopyButton :text="next.say" label="複製給 Agent" primary class="shrink-0" />
      </div>
    </div>

    <p v-if="showActivity" class="flex items-center gap-2 border-t border-stone-200 px-4 py-2 text-xs text-stone-500 sm:px-5 dark:border-stone-800 dark:text-stone-400">
      <span class="eyebrow shrink-0">Agent</span>
      <span class="min-w-0 truncate">{{ liveActivity!.message }}</span>
      <span class="ml-auto shrink-0 font-mono text-[11px]">{{ liveActivity!.ago }}</span>
    </p>
  </section>
</template>
