<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { PURPOSE_LABEL, TONE_CLASS, sceneBadge } from '../lib/site'
import { state, ui, write } from '../lib/store'
import { useFileUrl } from '../lib/useFileUrl'
import { approve, markStale, saveSceneFields, saveScript, setLocked } from '../lib/writes'
import Icon from './Icon.vue'
import SceneFeedback from './SceneFeedback.vue'

const props = defineProps<{ id: string }>()
const emit = defineEmits<{ close: [] }>()
/** Unsaved edits, so the page can ask before they are thrown away. */
const dirtyModel = defineModel<boolean>('dirty', { default: false })

const s = computed(() => state.value!.scenes.find((x) => x.id === props.id) ?? null)
const scene = computed(() => s.value?.scene ?? null)
/** Story projects: the characters a script line can be given to with 【name】. */
const cast = computed(() => state.value!.project.project.cast ?? [])

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
watch(dirty, (d) => (dirtyModel.value = d), { immediate: true })

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

const form = ref<HTMLFormElement | null>(null)
const os = /Mac|iPhone|iPad/.test(navigator.platform) ? 'mac' : 'other'
// ⌘S / Ctrl+S saves (instead of the browser's "save page"); Esc closes when nothing is being typed into a menu.
function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    if (dirty.value && !ui.saving) form.value?.requestSubmit()
  } else if (e.key === 'Escape' && !e.defaultPrevented && !(e.target instanceof HTMLVideoElement)) emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
const badge = computed(() => (s.value ? sceneBadge(s.value) : null))
</script>

<template>
  <section v-if="s && scene" class="card relative p-4 sm:p-5" :data-testid="`editor-${id}`">
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-xs text-slate-500 dark:text-slate-400">{{ id }} · {{ PURPOSE_LABEL[scene.purpose] ?? scene.purpose }} · {{ scene.visual.type }}</p>
        <h2 class="mt-0.5 flex items-center gap-2 text-lg font-semibold">
          <span class="truncate">{{ scene.title }}</span>
          <span v-if="badge" class="chip" :class="TONE_CLASS[badge.tone]">{{ badge.text }}</span>
          <Icon v-if="scene.locked" name="lock" :size="14" class="text-slate-400" />
        </h2>
      </div>
      <button type="button" class="icon-btn -mt-1 -mr-1" aria-label="關閉編輯" title="關閉（Esc）" @click="emit('close')"><Icon name="x" /></button>
    </header>

    <div v-if="scene.status === 'failed' && scene.error" class="callout mt-3 bg-red-50 text-red-900 dark:bg-red-950/60 dark:text-red-200">
      <Icon name="alert" class="mt-0.5" />
      <p>{{ scene.error.step }} 失敗：{{ scene.error.message }}<span v-if="scene.error.hint" class="mt-1 block">建議：{{ scene.error.hint }}</span></p>
    </div>
    <div v-if="scene.locked" class="callout mt-3 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
      <Icon name="lock" class="mt-0.5" />
      <p>已鎖定：Agent 不會修改或重做這一段。你仍可以編輯，但要解除鎖定後，修改才會被套用。</p>
    </div>

    <SceneFeedback :id="id" :video-url="videoUrl">
      <!-- Review: the decisions about this scene's current video. -->
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <button
          v-if="scene.status === 'rendered' && !s.outdated"
          type="button"
          class="btn-success"
          :disabled="ui.saving"
          data-testid="approve"
          @click="write((root, st) => approve(root, st, id), '已核准')"
        >
          <Icon name="check" :size="14" />核准
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
          type="button"
          class="btn-ghost ml-auto"
          :disabled="ui.saving"
          :aria-pressed="scene.locked"
          :title="scene.locked ? '讓 Agent 可以再修改這一段' : '不讓 Agent 修改或重做這一段'"
          @click="write((root, st) => setLocked(root, st, id, !scene!.locked), scene!.locked ? '已解除鎖定' : '已鎖定')"
        >
          <Icon :name="scene.locked ? 'unlock' : 'lock'" :size="14" />{{ scene.locked ? '解除鎖定' : '鎖定' }}
        </button>
      </div>
    </SceneFeedback>

    <form ref="form" class="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800" @submit.prevent="save">
      <fieldset class="space-y-4">
        <legend class="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">內容</legend>
        <label class="block">
          <span class="label">標題</span>
          <input v-model="draft.title" required maxlength="120" class="field" />
        </label>
        <label class="block">
          <span class="label">{{ cast.length ? '旁白與對白' : '旁白' }}</span>
          <textarea v-model="draft.script" rows="6" class="field font-mono leading-relaxed" data-testid="script-input" />
          <span class="hint">一行一句；用 <code>&lt;!-- pause 0.5 --&gt;</code> 插入停頓。存在 script.md。</span>
          <span v-if="cast.length" class="hint" data-testid="cast-hint">
            角色說的話在行首寫【名字】，例如「【{{ cast[0].name }}】你好！」；沒有標的行是旁白。角色：<template v-for="(m, i) in cast" :key="m.id"><template v-if="i">、</template>【{{ m.name }}】</template>
          </span>
        </label>
        <label class="block">
          <span class="label">畫面描述</span>
          <textarea v-model="draft.description" required rows="2" class="field" />
        </label>
      </fieldset>

      <fieldset class="mt-6 space-y-4">
        <legend class="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">聲音與時長</legend>
        <div class="grid gap-4 sm:grid-cols-3">
          <label class="block sm:col-span-2">
            <span class="label">聲音</span>
            <input v-model="draft.voice" :placeholder="state!.project.project.tts.voice ?? '專案預設'" class="field" />
          </label>
          <label class="block">
            <span class="label">語速 <span class="font-mono text-sky-700 dark:text-sky-400">{{ Number(draft.speed).toFixed(1) }}×</span></span>
            <input v-model.number="draft.speed" type="range" min="0.5" max="2" step="0.1" class="mt-3 w-full accent-sky-600" />
          </label>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <label class="flex items-center gap-2 text-sm">
            <input v-model="draft.forced" type="checkbox" class="h-4 w-4 accent-sky-600" />
            固定時長
          </label>
          <span v-if="draft.forced" class="flex items-center gap-2 text-sm">
            <input v-model.number="draft.durationSec" type="number" min="0.5" max="120" step="0.5" class="field mt-0 w-24" aria-label="秒數" />秒
          </span>
          <span v-else class="text-sm text-slate-500 dark:text-slate-400">依旁白長度 + 0.5 秒</span>
        </div>
      </fieldset>

      <!-- Save bar: sticks to the bottom of the screen while there are unsaved edits. -->
      <div
        class="-mx-4 mt-6 flex flex-wrap items-center gap-2 border-t px-4 py-3 sm:-mx-5 sm:px-5"
        :class="dirty ? 'sticky bottom-0 z-10 rounded-b-2xl border-sky-200 bg-sky-50/95 backdrop-blur dark:border-sky-900 dark:bg-slate-900/95' : 'border-slate-100 dark:border-slate-800'"
      >
        <p v-if="dirty" class="mr-auto text-sm">
          <span class="font-medium">有尚未儲存的修改</span>
          <span v-if="rendered" class="block text-xs text-amber-700 dark:text-amber-400">儲存後這一段會標為「需要重做」，再請 Agent 套用修改。</span>
        </p>
        <p v-else class="mr-auto text-sm text-slate-500 dark:text-slate-400">修改會存回專案資料夾。</p>
        <button v-if="dirty" type="button" class="btn-ghost" @click="discard">放棄修改</button>
        <button type="submit" class="btn-primary" :disabled="!dirty || ui.saving" data-testid="save">
          儲存 <span class="kbd hidden border-white/30 bg-white/10 text-white sm:inline dark:border-white/30 dark:bg-white/10 dark:text-white">{{ os === 'mac' ? '⌘S' : 'Ctrl+S' }}</span>
        </button>
      </div>
    </form>
  </section>
</template>
