<script setup lang="ts">
// Cycles the theme: follow the system → light → dark (see theme.ts).
import { ref } from 'vue'
import { THEME_ICON, THEME_LABEL, cycleTheme, initTheme, readTheme } from './theme'

const pref = ref(readTheme())
initTheme((p) => (pref.value = p))
</script>

<template>
  <button
    type="button"
    class="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-base text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-white"
    :title="`外觀：${THEME_LABEL[pref].zh}（點擊切換）`"
    :aria-label="`外觀：${THEME_LABEL[pref].zh}（點擊切換）`"
    data-testid="theme-toggle"
    @click="pref = cycleTheme()"
  >
    <span aria-hidden="true">{{ THEME_ICON[pref] }}</span>
  </button>
</template>
