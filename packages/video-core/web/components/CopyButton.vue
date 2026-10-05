<script setup lang="ts">
import { ref } from 'vue'
import Icon from './Icon.vue'

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
  <button type="button" :class="primary ? 'btn-primary' : 'btn-secondary btn-sm'" @click="copy">
    <Icon :name="copied ? 'check' : 'copy'" :size="primary ? 16 : 14" />
    <span aria-live="polite">{{ copied ? '已複製' : (label ?? '複製') }}</span>
  </button>
</template>
