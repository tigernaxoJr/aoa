<script setup lang="ts">
import { computed, ref } from 'vue'
import { openFeedback } from '@core'
import { PURPOSE_LABEL, TONE_CLASS, TONE_DOT, awaitingReview, sceneBadge } from '../lib/site'
import { useActivity } from '@aoa/web-shared/activity'
import { activity, state, write } from '../lib/store'
import type { SceneState } from '../lib/project'
import { reorder } from '../lib/writes'
import Icon from './Icon.vue'

/** The selected scene's id; null shows the full video. */
const selected = defineModel<string | null>('selected', { required: true })
const scenes = computed(() => state.value!.scenes)
const dragging = ref<string | null>(null)
const over = ref<string | null>(null)
const act = useActivity(activity)
/** The scene the agent says it is working on right now. */
const working = computed(() => (act.value?.current && !act.value.waitingForUser ? act.value.scene : null))

const seconds = (s: SceneState) => s.scene?.render?.actualDurationSec ?? s.scene?.durationSec ?? null

function duration(s: SceneState) {
  const sec = seconds(s)
  return sec ? `${sec.toFixed(1)} 秒` : '依旁白'
}

/** "已完成 2/3 · 約 12.0 秒": rendered and unchanged scenes, and the length known so far. */
const summary = computed(() => {
  const done = scenes.value.filter((s) => s.upToDate).length
  const known = scenes.value.map(seconds).filter((sec): sec is number => !!sec)
  const unknown = scenes.value.length - known.length
  const total = known.length ? ` · 約 ${known.reduce((a, b) => a + b, 0).toFixed(1)} 秒` : ''
  return `已完成 ${done}/${scenes.value.length}${total}${known.length && unknown ? `（另 ${unknown} 段依旁白）` : ''}`
})

/** Rendered scenes the user has not approved yet: the review the page is waiting for. */
const toReview = computed(() => scenes.value.filter(awaitingReview))

const final = computed(() => state.value!.final)
const finalOutdated = computed(() => final.value.exists && scenes.value.some((s) => !s.upToDate || s.outputMtime > final.value.mtime))

/** "list" for ordering and status, "script" to read every scene's narration in one pass. */
const view = ref<'list' | 'script'>('list')

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
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="flex flex-wrap items-baseline gap-x-2 font-semibold">
        段落
        <span v-if="scenes.length" class="text-sm font-normal text-stone-500 dark:text-stone-400" data-testid="scene-summary">{{ summary }}</span>
      </h2>
      <div v-if="scenes.length" class="flex rounded-md bg-stone-100 p-0.5 text-xs dark:bg-stone-800" role="group" aria-label="檢視方式">
        <button
          v-for="[v, label, icon] in [['list', '清單', 'list'], ['script', '腳本', 'text']] as const"
          :key="v"
          type="button"
          class="flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition"
          :class="view === v ? 'bg-white text-stone-900 dark:bg-stone-950 dark:text-white' : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'"
          :aria-pressed="view === v"
          :data-testid="`view-${v}`"
          @click="view = v"
        >
          <Icon :name="icon" :size="13" />{{ label }}
        </button>
      </div>
    </div>

    <!-- One segment per scene, colored by status: progress at a glance. -->
    <div v-if="scenes.length" class="mt-3 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
      <span v-for="s in scenes" :key="s.id" class="flex-1" :class="[TONE_DOT[sceneBadge(s).tone], working === s.id ? 'animate-pulse' : '']" />
    </div>

    <div v-if="!scenes.length" class="mt-4 rounded-md border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
      <Icon name="film" :size="28" class="mx-auto mb-2 text-stone-300 dark:text-stone-600" />
      還沒有分鏡。Agent 寫好分鏡後，每一段會出現在這裡。
    </div>

    <ol v-else-if="view === 'script'" class="mt-4 space-y-1" data-testid="script-view">
      <li v-for="(s, i) in scenes" :key="s.id">
        <button
          type="button"
          class="flex w-full gap-3 rounded-md p-2 text-left transition hover:bg-stone-50 dark:hover:bg-stone-800/60"
          :class="selected === s.id ? 'bg-stone-100 dark:bg-stone-800' : ''"
          @click="selected = s.id"
        >
          <span class="w-5 shrink-0 pt-0.5 text-center font-mono text-xs text-stone-400">{{ i + 1 }}</span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium" :class="selected === s.id ? 'text-accent-ink' : ''">
              {{ s.scene?.title ?? s.id }}
              <span class="font-normal text-stone-500 dark:text-stone-400">· {{ PURPOSE_LABEL[s.scene?.purpose ?? ''] ?? s.scene?.purpose }} · {{ duration(s) }}</span>
            </span>
            <span v-if="s.script?.trim()" class="mt-1 block whitespace-pre-line text-sm leading-relaxed text-stone-700 dark:text-stone-300">{{ s.script.trim() }}</span>
            <span v-else class="mt-1 block text-sm italic text-stone-400">（尚無旁白）</span>
          </span>
        </button>
      </li>
    </ol>

    <template v-else>
      <button
        v-if="toReview.length"
        type="button"
        class="mt-3 flex w-full items-center gap-2 rounded-md bg-vermilion-50 px-3 py-2 text-left text-sm text-vermilion-900 transition hover:bg-vermilion-100 dark:bg-vermilion-950/40 dark:text-vermilion-100 dark:hover:bg-vermilion-950/70"
        data-testid="review-next"
        @click="selected = toReview[0].id"
      >
        <Icon name="play" :size="14" class="text-vermilion-600 dark:text-vermilion-400" />
        <span class="min-w-0 flex-1"><span class="font-medium">{{ toReview.length }} 段等你檢查</span>：看過沒問題就核准，有問題就留意見。</span>
        <Icon name="chevron" :size="14" class="text-vermilion-600 dark:text-vermilion-400" />
      </button>
      <p class="mt-3 text-xs text-stone-500 dark:text-stone-400">點選一段預覽與修改；拖曳或用箭頭調整播放順序。</p>
      <ol class="mt-2 space-y-1.5">
        <li
          v-for="(s, i) in scenes"
          :key="s.id"
          draggable="true"
          class="group flex items-center gap-1.5 rounded-md border bg-white py-1.5 pr-1.5 pl-1 transition dark:bg-stone-900"
          :class="[
            selected === s.id ? 'border-stone-400 bg-stone-100 shadow-[inset_2px_0_0_var(--color-accent)] dark:border-stone-600 dark:bg-stone-800' : 'border-stone-200 hover:border-stone-300 dark:border-stone-800 dark:hover:border-stone-700',
            over === s.id && dragging !== s.id ? 'ring-2 ring-vermilion-400' : '',
            dragging === s.id ? 'opacity-50' : '',
          ]"
          :data-testid="`scene-${s.id}`"
          :aria-current="selected === s.id ? 'true' : undefined"
          @dragstart="dragging = s.id"
          @dragend="dragging = over = null"
          @dragover.prevent="over = s.id"
          @drop.prevent="drop(s.id)"
        >
          <span class="hidden cursor-grab text-stone-300 group-hover:text-stone-400 sm:block dark:text-stone-600" aria-hidden="true"><Icon name="grip" /></span>
          <span class="w-5 shrink-0 text-center font-mono text-xs text-stone-400">{{ i + 1 }}</span>
          <button type="button" class="min-w-0 flex-1 rounded-md py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-vermilion-500/40" @click="selected = s.id">
            <span class="block truncate text-sm font-medium">{{ s.scene?.title ?? s.id }}</span>
            <span class="mt-0.5 flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
              {{ PURPOSE_LABEL[s.scene?.purpose ?? ''] ?? s.scene?.purpose }} · {{ duration(s) }}
              <span v-if="s.scene?.locked" class="flex items-center gap-0.5" title="已鎖定"><Icon name="lock" :size="11" /><span class="sr-only">已鎖定</span></span>
              <span v-if="openFeedback(s.scene).length" class="flex items-center gap-0.5 text-amber-700 dark:text-amber-400" title="還沒處理的意見" data-testid="scene-feedback-count"><Icon name="message" :size="11" />{{ openFeedback(s.scene).length }}</span>
            </span>
          </button>
          <span v-if="working === s.id" class="flex shrink-0 items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400" data-testid="scene-working">
            <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />製作中
          </span>
          <span class="chip shrink-0" :class="TONE_CLASS[sceneBadge(s).tone]" data-testid="scene-status">{{ sceneBadge(s).text }}</span>
          <span class="flex shrink-0 flex-col">
            <button type="button" class="icon-btn h-5 w-6" :disabled="i === 0" :aria-label="`上移 ${s.id}`" @click="moveBy(s.id, -1)"><Icon name="up" :size="14" /></button>
            <button type="button" class="icon-btn h-5 w-6" :disabled="i === scenes.length - 1" :aria-label="`下移 ${s.id}`" @click="moveBy(s.id, 1)"><Icon name="down" :size="14" /></button>
          </span>
        </li>
      </ol>
    </template>

    <button
      type="button"
      class="mt-3 flex w-full items-center gap-3 rounded-md border p-2.5 text-left transition"
      :class="selected === null ? 'border-stone-400 bg-stone-100 shadow-[inset_2px_0_0_var(--color-accent)] dark:border-stone-600 dark:bg-stone-800' : 'border-stone-200 hover:border-stone-300 dark:border-stone-800 dark:hover:border-stone-700'"
      data-testid="final-entry"
      @click="selected = null"
    >
      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"><Icon name="film" /></span>
      <span class="min-w-0 flex-1">
        <span class="block text-sm font-semibold">完整影片</span>
        <span class="block text-xs text-stone-500 dark:text-stone-400">output/final.mp4</span>
      </span>
      <span v-if="!final.exists" class="chip" :class="TONE_CLASS.neutral">尚未合成</span>
      <span v-else-if="finalOutdated" class="chip" :class="TONE_CLASS.warn">需要重新合成</span>
      <span v-else class="chip" :class="TONE_CLASS.success">最新</span>
    </button>
  </section>
</template>
