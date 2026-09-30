<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { PURPOSE_LABEL, STATUS_LABEL } from '../lib/site'
import { companion } from '../lib/companion'
import { runCompanion, state, ui, write } from '../lib/store'
import { useFileUrl } from '../lib/useFileUrl'
import { approve, markStale, saveSceneFields, saveScript, setLocked } from '../lib/writes'

const props = defineProps<{ id: string }>()
const emit = defineEmits<{ close: [] }>()

const s = computed(() => state.value!.scenes.find((x) => x.id === props.id) ?? null)
const scene = computed(() => s.value?.scene ?? null)

interface Draft {
  title: string
  description: string
  voice: string
  speed: number
  forced: boolean
  durationSec: number
  script: string
}
const draft = reactive<Draft>({ title: '', description: '', voice: '', speed: 1, forced: false, durationSec: 5, script: '' })
const original = reactive<Draft>({ ...draft })

function fromDisk(): Draft {
  const sc = scene.value!
  return {
    title: sc.title,
    description: sc.visual.description,
    voice: sc.narration.voice ?? '',
    speed: sc.narration.speed ?? 1,
    forced: sc.durationSec !== null,
    durationSec: sc.durationSec ?? 5,
    script: s.value!.script ?? '',
  }
}
const dirty = computed(() => JSON.stringify(draft) !== JSON.stringify(original))

// Switching scenes always loads it; a disk change only refreshes the form when there are no unsaved edits.
watch(() => props.id, () => scene.value && (Object.assign(draft, fromDisk()), Object.assign(original, fromDisk())), { immediate: true })
watch([() => s.value?.sceneMtime, () => s.value?.scriptMtime], () => {
  if (!scene.value) return
  const disk = fromDisk()
  if (!dirty.value) Object.assign(draft, disk)
  Object.assign(original, disk)
})

const videoUrl = useFileUrl(
  computed(() => (s.value?.hasOutput ? s.value.outputPath : null)),
  computed(() => s.value?.outputMtime ?? 0),
)
const rendered = computed(() => scene.value && ['rendered', 'approved', 'stale'].includes(scene.value.status))

async function save() {
  const fieldsChanged = ['title', 'description', 'voice', 'speed', 'forced', 'durationSec'].some((k) => draft[k as keyof Draft] !== original[k as keyof Draft])
  const scriptChanged = draft.script !== original.script
  const edit = {
    title: draft.title.trim(),
    description: draft.description.trim(),
    voice: draft.voice.trim() || null,
    speed: Number(draft.speed),
    durationSec: draft.forced ? Number(draft.durationSec) : null,
  }
  let ok = true
  if (fieldsChanged) ok = await write((root, st) => saveSceneFields(root, st, props.id, edit))
  if (ok && scriptChanged) ok = await write((root, st) => saveScript(root, st, props.id, draft.script), '旁白已儲存')
  if (ok) Object.assign(original, fromDisk())
}

function discard() {
  Object.assign(draft, fromDisk())
}
</script>

<template>
  <section v-if="s && scene" class="card p-4 sm:p-5" :data-testid="`editor-${id}`">
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-xs text-slate-500">{{ id }} · {{ PURPOSE_LABEL[scene.purpose] ?? scene.purpose }} · {{ scene.visual.type }}</p>
        <h2 class="mt-0.5 truncate text-lg font-semibold">{{ scene.title }}</h2>
      </div>
      <button type="button" class="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label="關閉編輯" @click="emit('close')">✕</button>
    </header>

    <p v-if="scene.status === 'failed' && scene.error" class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
      {{ scene.error.step }} 失敗：{{ scene.error.message }}<span v-if="scene.error.hint"><br />建議：{{ scene.error.hint }}</span>
    </p>
    <p v-if="scene.locked" class="mt-3 rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">已鎖定：Agent 不會修改或重做這個 scene。你仍可以編輯，但 <code>/video-sync</code> 不會套用，直到解除鎖定。</p>

    <video v-if="videoUrl" :key="videoUrl" :src="videoUrl" controls class="mt-4 aspect-video w-full rounded-lg bg-black" data-testid="scene-video" />
    <p v-else class="mt-4 flex aspect-video w-full items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500 dark:bg-slate-800">尚未渲染</p>

    <form class="mt-4 space-y-4" @submit.prevent="save">
      <label class="block">
        <span class="text-sm font-medium">標題</span>
        <input v-model="draft.title" required maxlength="120" class="field" />
      </label>
      <label class="block">
        <span class="text-sm font-medium">旁白（script.md）</span>
        <textarea v-model="draft.script" rows="6" class="field font-mono" data-testid="script-input" />
        <span class="mt-1 block text-xs text-slate-500">一行一句；用 <code>&lt;!-- pause 0.5 --&gt;</code> 插入停頓。</span>
      </label>
      <label class="block">
        <span class="text-sm font-medium">畫面描述</span>
        <textarea v-model="draft.description" required rows="2" class="field" />
      </label>
      <div class="grid gap-4 sm:grid-cols-3">
        <label class="block sm:col-span-2">
          <span class="text-sm font-medium">聲音</span>
          <input v-model="draft.voice" :placeholder="state!.project.project.tts.voice ?? '專案預設'" class="field" />
        </label>
        <label class="block">
          <span class="text-sm font-medium">語速 {{ Number(draft.speed).toFixed(1) }}×</span>
          <input v-model.number="draft.speed" type="range" min="0.5" max="2" step="0.1" class="mt-3 w-full" />
        </label>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-2 text-sm">
          <input v-model="draft.forced" type="checkbox" />
          固定時長
        </label>
        <input v-if="draft.forced" v-model.number="draft.durationSec" type="number" min="0.5" max="120" step="0.5" class="field mt-0 w-28" aria-label="秒數" />
        <span v-else class="text-sm text-slate-500">依旁白長度 + 0.5 秒</span>
      </div>

      <p v-if="dirty && rendered" class="text-sm text-amber-700 dark:text-amber-400">儲存後這個 scene 會標為「需要重做」，由 Agent 執行 <code>/video-sync</code> 重新產生。</p>

      <div class="flex flex-wrap gap-2">
        <button type="submit" class="btn-primary" :disabled="!dirty || ui.saving" data-testid="save">儲存</button>
        <button v-if="dirty" type="button" class="btn-secondary" @click="discard">放棄修改</button>
      </div>
    </form>

    <div class="mt-5 flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
      <button
        v-if="scene.status === 'rendered' && !s.outdated"
        type="button"
        class="btn-secondary"
        :disabled="ui.saving"
        data-testid="approve"
        @click="write((root, st) => approve(root, st, id), '已核准')"
      >
        核准
      </button>
      <button
        v-if="['rendered', 'approved'].includes(scene.status)"
        type="button"
        class="btn-secondary"
        :disabled="ui.saving"
        @click="write((root, st) => markStale(root, st, id), '已標記需要重做')"
      >
        標記需要重做
      </button>
      <button
        v-if="companion.state === 'ready' && !scene.locked"
        type="button"
        class="btn-primary"
        :disabled="ui.saving || !!companion.running || dirty"
        :title="dirty ? '請先儲存修改' : '在本機重新產生旁白、畫面與影片'"
        data-testid="rebuild"
        @click="runCompanion('rebuild', `重新產生 ${id}`, id)"
      >
        立即重新產生
      </button>
      <button type="button" class="btn-secondary" :disabled="ui.saving" @click="write((root, st) => setLocked(root, st, id, !scene!.locked), scene!.locked ? '已解除鎖定' : '已鎖定')">
        {{ scene.locked ? '解除鎖定' : '鎖定' }}
      </button>
      <span class="ml-auto self-center text-xs text-slate-500">{{ STATUS_LABEL[scene.status] ?? scene.status }}<span v-if="s.outdated">（內容已變更）</span></span>
    </div>
  </section>
</template>
