<script setup lang="ts">
// The scene's video and the notes the user leaves on it (SPEC §9.3). Pointing beats describing: one
// click on the frame gives the agent the exact second and spot, so the words only say what is wrong.
// The default slot sits between the video and the notes (the editor's review buttons).
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { TONE_CLASS } from '../lib/site'
import { state, ui, write } from '../lib/store'
import { addFeedback, removeFeedback } from '../lib/writes'
import Icon from './Icon.vue'

const props = defineProps<{ id: string; videoUrl: string | null }>()

const scene = computed(() => state.value!.scenes.find((x) => x.id === props.id)?.scene ?? null)
const notes = computed(() => scene.value?.feedback ?? [])
const open = computed(() => notes.value.filter((n) => !n.resolvedAt))
const done = computed(() => notes.value.filter((n) => n.resolvedAt))
const rendered = computed(() => Boolean(scene.value && ['rendered', 'approved'].includes(scene.value.status)))

const video = ref<HTMLVideoElement | null>(null)
const input = ref<HTMLTextAreaElement | null>(null)
const pointing = ref(false)
const draft = reactive({ text: '', atSec: null as number | null, point: null as { x: number; y: number } | null })
/** The note whose spot is drawn on the frame. */
const shown = ref<string | null>(null)

function reset() {
  Object.assign(draft, { text: '', atSec: null, point: null })
  pointing.value = false
  shown.value = null
}
watch(() => props.id, reset)

const clock = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`

/**
 * Where the picture sits inside the 16:9 player, as fractions of the player: a vertical or square
 * video is pillarboxed, so clicks and markers are mapped through this box, not the element.
 */
const ratio = ref(16 / 9)
const frame = computed(() => {
  const player = 16 / 9
  return ratio.value >= player
    ? { left: 0, top: (1 - player / ratio.value) / 2, width: 1, height: player / ratio.value }
    : { left: (1 - ratio.value / player) / 2, top: 0, width: ratio.value / player, height: 1 }
})
function onMeta() {
  const v = video.value
  if (v?.videoWidth && v.videoHeight) ratio.value = v.videoWidth / v.videoHeight
}

function togglePointing() {
  if (pointing.value) return (pointing.value = false)
  video.value?.pause()
  shown.value = null
  pointing.value = true
}

function pick(e: MouseEvent) {
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const f = frame.value
  const x = ((e.clientX - box.left) / box.width - f.left) / f.width
  const y = ((e.clientY - box.top) / box.height - f.top) / f.height
  if (x < 0 || x > 1 || y < 0 || y > 1) return // the black bars around the picture
  draft.point = { x, y }
  draft.atSec = video.value?.currentTime ?? null
  pointing.value = false
  nextTick(() => input.value?.focus())
}

/** Writing while the video is paused part-way ties the note to that moment. */
function onFocus() {
  const v = video.value
  if (draft.atSec === null && v?.paused && v.currentTime > 0) draft.atSec = v.currentTime
}

function show(n: { id: string; atSec?: number }) {
  shown.value = n.id
  if (n.atSec !== undefined && video.value) {
    video.value.pause()
    video.value.currentTime = n.atSec
  }
}

const spot = computed(() => draft.point ?? notes.value.find((n) => n.id === shown.value)?.point ?? null)
const spotStyle = computed(() => {
  const f = frame.value
  const p = spot.value!
  return { left: `${(f.left + p.x * f.width) * 100}%`, top: `${(f.top + p.y * f.height) * 100}%` }
})

async function submit() {
  const ok = await write((root, st) => addFeedback(root, st, props.id, draft), rendered.value ? '已記下意見，這一段會重做' : '已記下意見')
  if (ok) reset()
}
</script>

<template>
  <div class="relative mt-4">
    <video v-if="videoUrl" ref="video" :key="videoUrl" :src="videoUrl" controls class="aspect-video w-full rounded-xl bg-black" data-testid="scene-video" @loadedmetadata="onMeta" />
    <div v-else class="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
      <Icon name="film" :size="28" class="text-slate-300 dark:text-slate-600" />
      尚未渲染
    </div>
    <span
      v-if="videoUrl && spot"
      class="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-500/60 shadow-lg ring-2 ring-amber-500"
      :style="spotStyle"
      data-testid="feedback-spot"
    />
    <div v-if="pointing" class="absolute inset-0 cursor-crosshair rounded-xl bg-black/20" data-testid="feedback-overlay" @click="pick">
      <span class="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/80 px-3 py-1 text-xs whitespace-nowrap text-white">點一下畫面上要改的地方</span>
    </div>
  </div>

  <slot />

  <section v-if="scene" class="mt-4 rounded-xl border border-slate-200 p-3 sm:p-4 dark:border-slate-800" data-testid="feedback">
    <h3 class="flex items-center gap-2 text-sm font-semibold">
      <Icon name="message" :size="14" />意見
      <span v-if="open.length" class="chip" :class="TONE_CLASS.warn">{{ open.length }} 則待處理</span>
    </h3>

    <p v-if="scene.locked" class="mt-2 text-sm text-slate-500 dark:text-slate-400">已鎖定的段落不能留意見；要改請先解除鎖定。</p>
    <form v-else class="mt-2 space-y-2" @submit.prevent="submit">
      <div v-if="videoUrl || draft.atSec !== null || draft.point" class="flex flex-wrap items-center gap-2">
        <button v-if="videoUrl" type="button" class="btn-secondary btn-sm" :aria-pressed="pointing" data-testid="feedback-point" @click="togglePointing">
          <Icon name="pin" :size="14" />{{ pointing ? '取消' : '在畫面上指出位置' }}
        </button>
        <span v-if="draft.atSec !== null || draft.point" class="chip gap-1" :class="TONE_CLASS.info" data-testid="feedback-where">
          {{ [draft.point ? '已標記位置' : '', draft.atSec !== null ? `第 ${clock(draft.atSec)}` : ''].filter(Boolean).join(' · ') }}
          <button type="button" aria-label="清除標記" title="清除標記" @click="(draft.point = null), (draft.atSec = null)"><Icon name="x" :size="12" /></button>
        </span>
      </div>
      <textarea
        ref="input"
        v-model="draft.text"
        rows="2"
        maxlength="1000"
        class="field mt-0"
        placeholder="這裡要怎麼改？例如：這張卡片太暗、旁白講太快"
        aria-label="意見"
        data-testid="feedback-text"
        @focus="onFocus"
      />
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-xs text-slate-500 dark:text-slate-400">{{ rendered ? '送出後這一段會標為「需要重做」，Agent 套用修改時一起處理。' : scene.status === 'stale' ? 'Agent 套用修改時會一起處理。' : 'Agent 製作這一段時會一起處理。' }}</span>
        <button type="submit" class="btn-primary btn-sm" :disabled="!draft.text.trim() || ui.saving" data-testid="feedback-submit">送出意見</button>
      </div>
    </form>

    <ul v-if="open.length" class="mt-3 space-y-1.5" data-testid="feedback-open">
      <li v-for="n in open" :key="n.id" class="flex items-start gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-sm dark:bg-amber-950/40">
        <button
          v-if="n.atSec !== undefined || n.point"
          type="button"
          class="chip shrink-0 gap-1"
          :class="TONE_CLASS.warn"
          title="在影片上顯示這個位置"
          @click="show(n)"
        >
          <Icon name="pin" :size="11" />{{ n.atSec !== undefined ? clock(n.atSec) : '位置' }}
        </button>
        <span class="min-w-0 flex-1 break-words">{{ n.text }}</span>
        <button
          type="button"
          class="icon-btn -my-1 -mr-1"
          :aria-label="`刪除意見：${n.text}`"
          title="刪除（Agent 還沒處理）"
          :disabled="ui.saving"
          @click="write((root, st) => removeFeedback(root, st, id, n.id), '已刪除意見')"
        >
          <Icon name="x" :size="14" />
        </button>
      </li>
    </ul>

    <details v-if="done.length" class="mt-3 text-sm" :open="!open.length" data-testid="feedback-done">
      <summary class="cursor-pointer text-slate-500 select-none dark:text-slate-400">Agent 已處理 {{ done.length }} 則</summary>
      <ul class="mt-2 space-y-1.5">
        <li v-for="n in done" :key="n.id" class="rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-800/60">
          <p class="text-slate-500 dark:text-slate-400">
            <button v-if="n.atSec !== undefined || n.point" type="button" class="mr-1 underline-offset-2 hover:underline" @click="show(n)">{{ n.atSec !== undefined ? clock(n.atSec) : '位置' }}</button>{{ n.text }}
          </p>
          <p class="mt-0.5 flex items-start gap-1.5 text-emerald-800 dark:text-emerald-300"><Icon name="check" :size="14" class="mt-0.5" />{{ n.reply ?? '已處理' }}</p>
        </li>
      </ul>
    </details>
  </section>
</template>
