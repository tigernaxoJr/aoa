<script setup lang="ts">
// A sentence for the user to hand to their agent (agentSay()), with a copy button. The page cannot
// wake the agent, so this is how every request leaves the page; the raw command stays out of sight.
// `primary`: the page's main call to action (the next step), drawn larger with a primary button.
import { computed } from 'vue'
import { agentSay } from '../lib/site'
import CopyButton from './CopyButton.vue'

const props = defineProps<{ command: string; primary?: boolean }>()
const text = computed(() => agentSay(props.command))
</script>

<template>
  <div v-if="primary" class="min-w-0 text-sm" :data-command="command" data-testid="agent-say">
    <span class="block text-xs font-medium text-stone-500 dark:text-stone-400">把這句話交給 Agent：</span>
    <div class="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-stretch">
      <span
        class="min-w-0 flex-1 rounded-md border border-vermilion-200 bg-white px-3 py-2 leading-relaxed text-stone-800 dark:border-vermilion-900 dark:bg-stone-950 dark:text-stone-200"
        data-testid="agent-say-text"
        >{{ text }}</span
      >
      <CopyButton :text="text" primary class="shrink-0" />
    </div>
  </div>
  <div v-else class="flex min-w-0 flex-wrap items-center gap-2 text-sm" :data-command="command" data-testid="agent-say">
    <span class="shrink-0 text-stone-500 dark:text-stone-400">把這句話交給 Agent：</span>
    <span class="min-w-0 rounded-md border border-stone-200 bg-white px-2 py-1 text-stone-800 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200" data-testid="agent-say-text">{{ text }}</span>
    <CopyButton :text="text" />
  </div>
</template>
