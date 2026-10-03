<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  text: string
  label?: string
  title?: string
}>()

const copied = ref(false)

async function copy() {
  if (!props.text) return
  try {
    await navigator.clipboard.writeText(props.text)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch (err) {
    console.error('Failed to copy text', err)
  }
}
</script>

<template>
  <button
    type="button"
    :title="title || '複製到剪貼簿'"
    @click="copy"
    class="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
  >
    <span v-if="copied" class="text-emerald-600 dark:text-emerald-400">✓ 已複製</span>
    <span v-else>{{ label || '複製' }}</span>
  </button>
</template>
