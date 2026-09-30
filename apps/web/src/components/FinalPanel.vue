<script setup lang="ts">
import { computed } from 'vue'
import { FINAL_FILE } from '../lib/project'
import { state } from '../lib/store'
import { useFileUrl } from '../lib/useFileUrl'

const final = computed(() => state.value!.final)
const url = useFileUrl(
  computed(() => (final.value.exists ? FINAL_FILE : null)),
  computed(() => final.value.mtime),
)
/** Scenes whose current output is not what final.mp4 was built from, or that need redoing. */
const outdated = computed(() =>
  state.value!.scenes.filter((s) => !s.upToDate || (final.value.exists && s.outputMtime > final.value.mtime)),
)
</script>

<template>
  <section class="card p-4 sm:p-5">
    <h2 class="font-semibold">完整影片</h2>
    <video v-if="url" :key="url" :src="url" controls class="mt-4 aspect-video w-full rounded-lg bg-black" data-testid="final-video" />
    <p v-else class="mt-4 text-sm text-slate-500">還沒有合成。所有 scene 完成後，在 Agent 中執行 <code>/video-assemble</code>。</p>
    <div v-if="outdated.length" class="mt-4 text-sm" data-testid="final-outdated">
      <p class="font-medium">{{ final.exists ? '影片合成後有變動的 scene' : '尚未完成的 scene' }}</p>
      <ul class="mt-1 list-inside list-disc text-slate-600 dark:text-slate-400">
        <li v-for="s in outdated" :key="s.id">{{ s.scene?.title ?? s.id }}（{{ s.id }}）</li>
      </ul>
    </div>
    <p v-else-if="final.exists" class="mt-3 text-sm text-emerald-700 dark:text-emerald-400">影片與所有 scene 一致。</p>
  </section>
</template>
