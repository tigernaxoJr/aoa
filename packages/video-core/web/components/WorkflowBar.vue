<script setup lang="ts">
import { computed } from 'vue'
import { nextStep, stepsFor } from '../lib/site'
import { state } from '../lib/store'
import AgentSay from './AgentSay.vue'
import Icon from './Icon.vue'

const status = computed(() => state.value!.project.status)
const next = computed(() => state.value!.next)
const plain = computed(() => nextStep(next.value, state.value!.scenes.length))
/** The step after the last completed one is "current". */
const steps = computed(() => stepsFor(state.value!.project.project.kind))
const current = computed(() => steps.value.findIndex((s) => !s.done.includes(status.value)))
const stale = computed(() => state.value!.scenes.filter((s) => (s.outdated || s.scene?.status === 'stale') && !s.scene?.locked))
</script>

<template>
  <section class="card overflow-hidden">
    <ol class="flex items-start px-4 pt-5 sm:px-6" aria-label="工作流程" :title="`專案狀態：${status}`">
      <li v-for="(step, i) in steps" :key="step.id" class="relative flex min-w-0 flex-1 flex-col items-center text-center" :aria-current="i === current ? 'step' : undefined">
        <span
          v-if="i > 0"
          class="absolute top-3.5 right-1/2 h-0.5 w-full"
          :class="i <= current || current === -1 ? 'bg-stone-900 dark:bg-stone-300' : 'bg-stone-200 dark:bg-stone-700'"
          aria-hidden="true"
        />
        <span
          class="relative flex h-7 w-7 items-center justify-center rounded-full border-2 font-mono text-xs"
          :class="
            i < current || current === -1
              ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-200 dark:bg-stone-200 dark:text-stone-900'
              : i === current
                ? 'border-accent bg-white text-accent-ink ring-4 ring-accent/15 dark:bg-stone-900'
                : 'border-stone-300 bg-white text-stone-400 dark:border-stone-600 dark:bg-stone-900'
          "
        >
          <Icon v-if="i < current || current === -1" name="check" :size="14" />
          <span v-else>{{ i + 1 }}</span>
        </span>
        <span
          class="mt-2 px-1 text-xs sm:text-sm"
          :class="[i === current ? 'font-semibold whitespace-nowrap text-stone-900 dark:text-white' : 'text-stone-500 dark:text-stone-400', i === current ? '' : 'hidden sm:block']"
        >
          {{ step.label }}
        </span>
      </li>
    </ol>

    <div
      class="mt-5 flex flex-col gap-4 border-t px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between"
      :class="next.command ? 'border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-950/40' : 'border-stone-100 bg-stone-50/60 dark:border-stone-800 dark:bg-stone-900/60'"
    >
      <div class="min-w-0 lg:max-w-[45%]">
        <p class="font-semibold">{{ plain.title }}</p>
        <p class="mt-0.5 text-sm text-stone-600 dark:text-stone-400">{{ plain.hint }}</p>
        <p v-if="state!.lock.active" class="mt-1 flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
          <Icon name="lock" :size="14" />{{ state!.lock.writer ?? 'Agent' }} 正在寫入，網頁上的修改會稍候再存
        </p>
      </div>
      <AgentSay v-if="next.command" :command="next.command" primary class="lg:w-[52%]" data-testid="next-command" />
    </div>

    <div
      v-if="stale.length && next.command !== '/video-sync'"
      class="flex flex-col gap-3 border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:px-6 md:flex-row md:items-center md:justify-between dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-100"
      role="status"
      data-testid="stale-banner"
    >
      <span class="flex items-start gap-2">
        <Icon name="refresh" class="mt-0.5" />
        <span>還有 {{ stale.length }} 段的修改沒有套用。上面這一步完成後，這裡會告訴你下一句要對 Agent 說什麼。</span>
      </span>
    </div>
  </section>
</template>
