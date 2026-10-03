<script setup lang="ts">
defineProps<{
  title?: string
}>()
</script>

<template>
  <div class="rounded-xl border border-slate-700/50 bg-slate-900/60 p-5 shadow-lg backdrop-blur-md">
    <h4 v-if="title" class="mb-3 text-sm font-semibold tracking-wide text-sky-400 uppercase">{{ title }}</h4>
    <div class="w-full flex justify-center">
      <slot>
        <!-- Default fallback vector diagram -->
        <svg viewBox="0 0 600 120" class="w-full max-w-xl">
          <rect x="20" y="30" width="140" height="60" rx="8" fill="#1e293b" stroke="#38bdf8" stroke-width="2" />
          <text x="90" y="65" fill="#f8fafc" font-size="14" text-anchor="middle" font-weight="600">前端工作台</text>
          
          <path d="M 160 60 L 230 60" stroke="#94a3b8" stroke-width="2" marker-end="url(#arrow)" stroke-dasharray="4" />
          
          <rect x="230" y="30" width="140" height="60" rx="8" fill="#1e293b" stroke="#34d399" stroke-width="2" />
          <text x="300" y="65" fill="#f8fafc" font-size="14" text-anchor="middle" font-weight="600">本機檔案 (FSA)</text>
          
          <path d="M 370 60 L 440 60" stroke="#94a3b8" stroke-width="2" marker-end="url(#arrow)" />
          
          <rect x="440" y="30" width="140" height="60" rx="8" fill="#1e293b" stroke="#f472b6" stroke-width="2" />
          <text x="510" y="65" fill="#f8fafc" font-size="14" text-anchor="middle" font-weight="600">Coding Agent</text>

          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 8 5 L 0 9 z" fill="#94a3b8" />
            </marker>
          </defs>
        </svg>
      </slot>
    </div>
  </div>
</template>
