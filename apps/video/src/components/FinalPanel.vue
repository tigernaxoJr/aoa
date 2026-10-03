<script setup lang="ts">
import { computed } from 'vue'
import { FINAL_FILE } from '../lib/project'
import { companion } from '../lib/companion'
import { TONE_CLASS, sceneBadge } from '../lib/site'
import { runCompanion, state } from '../lib/store'
import { useFileUrl } from '../lib/useFileUrl'
import Icon from './Icon.vue'

const emit = defineEmits<{ select: [id: string] }>()

const final = computed(() => state.value!.final)
const url = useFileUrl(
  computed(() => (final.value.exists ? FINAL_FILE : null)),
  computed(() => final.value.mtime),
)
const scenes = computed(() => state.value!.scenes)
const done = computed(() => scenes.value.filter((s) => s.upToDate).length)
const ready = computed(() => scenes.value.length > 0 && done.value === scenes.value.length)
/** Scenes whose current output is not what final.mp4 was built from, or that need redoing. */
const outdated = computed(() => scenes.value.filter((s) => !s.upToDate || (final.value.exists && s.outputMtime > final.value.mtime)))
</script>

<template>
  <section class="card p-4 sm:p-5">
    <header class="flex items-center justify-between gap-3">
      <h2 class="flex items-center gap-2 text-lg font-semibold"><Icon name="film" :size="18" />完整影片</h2>
      <span v-if="!final.exists" class="chip" :class="TONE_CLASS.neutral">尚未合成</span>
      <span v-else-if="outdated.length" class="chip" :class="TONE_CLASS.warn">需要重新合成</span>
      <span v-else class="chip" :class="TONE_CLASS.success"><Icon name="check" :size="12" />最新</span>
    </header>

    <video v-if="url" :key="url" :src="url" controls class="mt-4 aspect-video w-full rounded-xl bg-black" data-testid="final-video" />
    <div v-else class="mt-4 flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl bg-slate-100 px-6 text-center dark:bg-slate-800/60">
      <Icon name="film" :size="32" class="text-slate-300 dark:text-slate-600" />
      <p class="text-sm text-slate-600 dark:text-slate-400">
        <template v-if="ready">所有 scene 都完成了，可以合成影片。</template>
        <template v-else>每段 scene 完成後，就能合成完整影片。</template>
      </p>
      <div v-if="scenes.length" class="w-48">
        <div class="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div class="h-full rounded-full bg-sky-500 transition-all" :style="{ width: `${(done / scenes.length) * 100}%` }" />
        </div>
        <p class="mt-1.5 text-xs text-slate-500">{{ done }} / {{ scenes.length }} 段完成</p>
      </div>
    </div>

    <div v-if="companion.state === 'ready' && ready && (!final.exists || outdated.length)" class="mt-4">
      <button type="button" class="btn-primary" :disabled="!!companion.running" data-testid="assemble" @click="runCompanion('assemble', '合成影片')">
        <Icon name="play" :size="14" />立即合成
      </button>
    </div>
    <p v-else-if="ready && (!final.exists || outdated.length)" class="mt-4 text-sm text-slate-600 dark:text-slate-400">
      在 Agent 中執行 <code class="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">/video-assemble</code> 合成影片。
    </p>

    <div v-if="outdated.length" class="mt-5" data-testid="final-outdated">
      <p class="text-sm font-medium">{{ final.exists ? '影片合成後有變動的 scene' : '尚未完成的 scene' }}</p>
      <ul class="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        <li v-for="s in outdated" :key="s.id">
          <button type="button" class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60" @click="emit('select', s.id)">
            <span class="min-w-0 flex-1 truncate">{{ s.scene?.title ?? s.id }} <span class="text-slate-400">（{{ s.id }}）</span></span>
            <span class="chip" :class="TONE_CLASS[sceneBadge(s).tone]">{{ sceneBadge(s).text }}</span>
            <Icon name="chevron" :size="14" class="text-slate-400" />
          </button>
        </li>
      </ul>
    </div>
    <p v-else-if="final.exists" class="mt-3 flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400"><Icon name="check" :size="14" />影片與所有 scene 一致。</p>
  </section>
</template>
