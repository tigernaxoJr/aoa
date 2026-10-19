<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  text: string
  label?: string
  title?: string
  /** The page's main action: dark and larger. */
  primary?: boolean
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
  <button type="button" :title="title || '複製到剪貼簿'" :class="primary ? 'btn-primary' : 'btn'" @click="copy">
    <svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path v-if="copied" stroke-linecap="round" stroke-linejoin="round" d="M20 6 9 17l-5-5" />
      <template v-else>
        <rect x="9" y="9" width="12" height="12" rx="2" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
      </template>
    </svg>
    <span v-if="copied">已複製</span>
    <span v-else>{{ label || '複製' }}</span>
  </button>
</template>
