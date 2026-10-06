<script setup lang="ts">
// A sentence for the user to hand to their agent (agentSay()), with a copy button. The page cannot
// wake the agent, so this is how every request leaves the page; the raw command stays out of sight.
import { computed } from 'vue'
import { agentSay } from '../lib/site'
import CopyButton from './CopyButton.vue'

const props = defineProps<{ command: string }>()
const text = computed(() => agentSay(props.command))
</script>

<template>
  <div class="flex min-w-0 flex-wrap items-center gap-2 text-sm" :data-command="command" data-testid="agent-say">
    <span class="shrink-0 text-slate-500 dark:text-slate-400">把這句話交給 Agent：</span>
    <span class="min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" data-testid="agent-say-text">{{ text }}</span>
    <CopyButton :text="text" />
  </div>
</template>
