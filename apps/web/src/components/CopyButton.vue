<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ text: string; label?: string; primary?: boolean }>()
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.text)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // Clipboard blocked (e.g. insecure context): leave the text selectable instead.
  }
}
</script>

<template>
  <button
    type="button"
    :class="primary ? 'btn-primary' : 'shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'"
    @click="copy"
  >
    {{ copied ? '已複製' : (label ?? '複製') }}
  </button>
</template>
