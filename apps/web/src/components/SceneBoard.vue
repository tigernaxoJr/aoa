<script setup lang="ts">
import { computed, ref } from 'vue'
import { PURPOSE_LABEL, STATUS_LABEL } from '../lib/site'
import { state, write } from '../lib/store'
import { useActivity } from '../lib/activity'
import type { SceneState } from '../lib/project'
import { reorder } from '../lib/writes'

const selected = defineModel<string | null>('selected', { required: true })
const scenes = computed(() => state.value!.scenes)
const dragging = ref<string | null>(null)
const over = ref<string | null>(null)
const act = useActivity()
/** The scene the agent says it is working on right now. */
const working = computed(() => (act.value?.current && !act.value.waitingForUser ? act.value.scene : null))

function badge(s: SceneState) {
  if (!s.scene) return { text: STATUS_LABEL.missing, cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' }
  if (s.outdated && s.scene.status !== 'stale') return { text: '內容已變更', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' }
  const cls: Record<string, string> = {
    approved: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
    rendered: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
    stale: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    failed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  }
  return { text: STATUS_LABEL[s.scene.status] ?? s.scene.status, cls: cls[s.scene.status] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' }
}

function duration(s: SceneState) {
  const sec = s.scene?.render?.actualDurationSec ?? s.scene?.durationSec
  return sec ? `${sec.toFixed(1)} 秒` : '依旁白'
}

async function move(ids: string[]) {
  await write((root, st) => reorder(root, st, ids), '已更新順序，需要重新合成')
}

function moveBy(id: string, delta: number) {
  const ids = scenes.value.map((s) => s.id)
  const i = ids.indexOf(id)
  const j = i + delta
  if (j < 0 || j >= ids.length) return
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  move(ids)
}

function drop(target: string) {
  const from = dragging.value
  dragging.value = over.value = null
  if (!from || from === target) return
  const ids = scenes.value.map((s) => s.id).filter((id) => id !== from)
  ids.splice(ids.indexOf(target), 0, from)
  move(ids)
}
</script>

<template>
  <section class="card p-4 sm:p-5">
    <div class="flex items-baseline justify-between">
      <h2 class="font-semibold">Scene</h2>
      <p class="text-xs text-slate-500">拖曳或用箭頭調整播放順序</p>
    </div>
    <p v-if="!scenes.length" class="mt-4 text-sm text-slate-500">還沒有 scene。請在 Agent 中執行 <code>/video-storyboard</code>。</p>
    <ol class="mt-4 space-y-2">
      <li
        v-for="(s, i) in scenes"
        :key="s.id"
        draggable="true"
        class="group flex items-center gap-3 rounded-lg border p-3 transition-colors"
        :class="[
          selected === s.id ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600',
          over === s.id && dragging !== s.id ? 'ring-2 ring-sky-400' : '',
        ]"
        :data-testid="`scene-${s.id}`"
        @dragstart="dragging = s.id"
        @dragend="dragging = over = null"
        @dragover.prevent="over = s.id"
        @drop.prevent="drop(s.id)"
      >
        <span class="w-6 shrink-0 text-center font-mono text-sm text-slate-400">{{ i + 1 }}</span>
        <button type="button" class="min-w-0 flex-1 text-left" @click="selected = s.id">
          <span class="block truncate font-medium">{{ s.scene?.title ?? s.id }}</span>
          <span class="mt-0.5 block text-xs text-slate-500">
            {{ PURPOSE_LABEL[s.scene?.purpose ?? ''] ?? s.scene?.purpose }} · {{ duration(s) }}<span v-if="s.scene?.locked"> · 已鎖定</span>
          </span>
        </button>
        <span v-if="working === s.id" class="flex shrink-0 items-center gap-1.5 text-xs text-sky-700 dark:text-sky-300" data-testid="scene-working">
          <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" aria-hidden="true" />製作中
        </span>
        <span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" :class="badge(s).cls" data-testid="scene-status">{{ badge(s).text }}</span>
        <span class="flex shrink-0 flex-col">
          <button type="button" class="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 dark:hover:text-slate-200" :disabled="i === 0" :aria-label="`上移 ${s.id}`" @click="moveBy(s.id, -1)">▲</button>
          <button type="button" class="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 dark:hover:text-slate-200" :disabled="i === scenes.length - 1" :aria-label="`下移 ${s.id}`" @click="moveBy(s.id, 1)">▼</button>
        </span>
      </li>
    </ol>
  </section>
</template>
