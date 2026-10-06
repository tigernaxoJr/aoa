<script setup lang="ts">
// Stroke icons (Lucide-style, 24×24). Decorative unless the parent labels them.
import type { PropType } from 'vue'

defineProps({ name: { type: String as PropType<IconName>, required: true }, size: Number })
</script>

<script lang="ts">
const PATHS = {
  check: ['M20 6 9 17l-5-5'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  folder: ['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'],
  copy: ['M8 8h12v12H8z', 'M4 16V4h12'],
  film: ['M3 3h18v18H3z', 'M7 3v18', 'M17 3v18', 'M3 7.5h4', 'M3 12h18', 'M3 16.5h4', 'M17 7.5h4', 'M17 16.5h4'],
  play: ['m6 3 14 9-14 9V3z'],
  lock: ['M5 11h14v10H5z', 'M7 11V7a5 5 0 0 1 10 0v4'],
  unlock: ['M5 11h14v10H5z', 'M7 11V7a5 5 0 0 1 9.9-1'],
  up: ['m18 15-6-6-6 6'],
  down: ['m6 9 6 6 6-6'],
  grip: ['M9 6h.01', 'M9 12h.01', 'M9 18h.01', 'M15 6h.01', 'M15 12h.01', 'M15 18h.01'],
  alert: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'],
  refresh: ['M3 12a9 9 0 0 1 15-6.7L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-15 6.7L3 16', 'M8 16H3v5'],
  sparkles: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z', 'M19 17v4', 'M17 19h4'],
  message: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  pin: ['M12 2a8 8 0 0 0-8 8c0 5.4 8 12 8 12s8-6.6 8-12a8 8 0 0 0-8-8z', 'M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  link: ['M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7', 'M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  text: ['M17 6.1H3', 'M21 12.1H3', 'M15.1 18H3'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
  chevron: ['m9 18 6-6-6-6'],
  mic: ['M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v4', 'M8 23h8'],
  square: ['M3 3h18v18H3z'],
  user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
} as const
export type IconName = keyof typeof PATHS
</script>

<template>
  <svg
    :width="size ?? 16"
    :height="size ?? 16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="shrink-0"
  >
    <path v-for="d in PATHS[name]" :key="d" :d="d" />
  </svg>
</template>
