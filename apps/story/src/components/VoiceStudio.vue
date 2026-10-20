<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Icon from '@video-core/web/components/Icon.vue'
import { audioBlobToWav } from '../audio'
import { tryFile, writeFile } from '@aoa/web-shared/fsa'
import { notify, root, state } from '@video-core/web/lib/store'
import { useFileUrl } from '@video-core/web/lib/useFileUrl'

interface VoiceConfig {
  provider?: string
  voice?: string
}

const props = defineProps<{
  castId: string
  castName: string
  modelValue: VoiceConfig
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: VoiceConfig): void
}>()

// Mode: 'clone' (recording/sample) | 'instruct' (CosyVoice 3 instruct) | 'edge' (Edge-TTS)
type Mode = 'clone' | 'instruct' | 'edge'
const activeMode = ref<Mode>('instruct')

// Determine mode from initial voice/provider
watch(
  () => props.modelValue,
  (val) => {
    if (val.provider === 'cosyvoice3' || val.provider === 'cosyvoice') {
      if (val.voice?.includes('voice-sample.wav') || val.voice?.endsWith('.wav')) {
        activeMode.value = 'clone'
      } else {
        activeMode.value = 'instruct'
      }
    } else {
      activeMode.value = 'edge'
    }
  },
  { immediate: true },
)

// --- Mode 1: Clone / Recording ---
const recording = ref(false)
const recordDuration = ref(0)
const recordedBlob = ref<Blob | null>(null)
const recordedAudioUrl = ref<string | null>(null)
const sampleExists = ref(false)
let mediaRecorder: MediaRecorder | null = null
let recordTimer: ReturnType<typeof setInterval> | null = null
let audioChunks: Blob[] = []

// Check if voice-sample.wav already exists
async function checkSampleExists() {
  if (!root.value || !props.castId) return
  const f = await tryFile(root.value, `assets/cast/${props.castId}/voice-sample.wav`)
  sampleExists.value = !!f
}
watch(() => props.castId, checkSampleExists, { immediate: true })

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaRecorder = new MediaRecorder(stream)
    audioChunks = []
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data)
    }
    mediaRecorder.onstop = () => {
      const rawBlob = new Blob(audioChunks, { type: mediaRecorder?.mimeType || 'audio/webm' })
      recordedBlob.value = rawBlob
      if (recordedAudioUrl.value) URL.revokeObjectURL(recordedAudioUrl.value)
      recordedAudioUrl.value = URL.createObjectURL(rawBlob)
      stream.getTracks().forEach((t) => t.stop())
    }
    mediaRecorder.start(200)
    recording.value = true
    recordDuration.value = 0
    recordTimer = setInterval(() => {
      recordDuration.value++
      if (recordDuration.value >= 15) stopRecording()
    }, 1000)
  } catch (err) {
    notify('error', `無法存取麥克風：${(err as Error).message}`)
  }
}

function stopRecording() {
  if (recordTimer) clearInterval(recordTimer)
  recordTimer = null
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  recording.value = false
}

async function saveRecordedSample() {
  if (!root.value || !recordedBlob.value) return
  try {
    notify('ok', '正在儲存錄音…')
    const wav = await audioBlobToWav(recordedBlob.value)
    const dest = `assets/cast/${props.castId}/voice-sample.wav`
    await writeFile(root.value, dest, wav)
    sampleExists.value = true
    emit('update:modelValue', {
      provider: 'cosyvoice3',
      voice: `@/${dest}`,
    })
    notify('ok', '已儲存錄音，配音會模仿它')
  } catch (err) {
    notify('error', `儲存錄音失敗：${(err as Error).message}`)
  }
}

// --- Mode 2: CosyVoice 3 Instruct ---
const instructBaseVoice = ref('中文男')
const instructPrompt = ref('用熱情開朗的大學生語氣')

const BASE_VOICES = [
  { id: '中文男', label: '中文男聲（沉穩青年）' },
  { id: '中文女', label: '中文女聲（溫和清晰）' },
  { id: '粵語女', label: '粵語女聲（生動地道）' },
  { id: '英文男', label: '英文男聲（自然流利）' },
  { id: '英文女', label: '英文女聲（清晰國際）' },
  { id: 'default', label: '預設聲音' },
]

const QUICK_INSTRUCTS = [
  '用熱情開朗的大學生語氣',
  '用溫柔親切的童話大姐姐語氣',
  '用專業嚴肅的紀錄片旁白語氣',
  '用調皮淘氣的小男孩聲線',
  '用台語說',
  '用誇張幽默的喜劇聲線',
]

// Parse voice into baseVoice and instruct
watch(
  () => props.modelValue.voice,
  (voiceStr) => {
    if (!voiceStr) return
    const match = voiceStr.match(/^(.*?)\s*<([^>]+)>$/)
    if (match) {
      instructBaseVoice.value = match[1].trim() || '中文男'
      instructPrompt.value = match[2].trim()
    } else if (BASE_VOICES.some((v) => v.id === voiceStr)) {
      instructBaseVoice.value = voiceStr
    }
  },
  { immediate: true },
)

function updateInstruct() {
  const p = instructPrompt.value.trim()
  const voice = p ? `${instructBaseVoice.value} <${p}>` : instructBaseVoice.value
  emit('update:modelValue', {
    provider: 'cosyvoice3',
    voice,
  })
}

function applyQuickInstruct(text: string) {
  instructPrompt.value = text
  updateInstruct()
}

// --- Mode 3: Edge-TTS ---
const EDGE_VOICES = [
  {
    region: '台灣華語',
    voices: [
      { id: 'zh-TW-HsiaoChenNeural', label: '曉晨（女，溫和自然，適合旁白與女性角色）' },
      { id: 'zh-TW-HsiaoYuNeural', label: '曉涵（女，年輕活力）' },
      { id: 'zh-TW-YunJheNeural', label: '雲哲（男，清朗自然）' },
    ],
  },
  {
    region: '中國普通話',
    voices: [
      { id: 'zh-CN-XiaoxiaoNeural', label: '曉曉（女，溫柔）' },
      { id: 'zh-CN-XiaoyiNeural', label: '曉伊（女，生動活潑）' },
      { id: 'zh-CN-YunxiNeural', label: '雲希（男，陽光少年）' },
      { id: 'zh-CN-YunxiaNeural', label: '雲夏（男童）' },
      { id: 'zh-CN-YunjianNeural', label: '雲健（男，沉穩大氣）' },
    ],
  },
  {
    region: '美式英語',
    voices: [
      { id: 'en-US-JennyNeural', label: 'Jenny（女）' },
      { id: 'en-US-GuyNeural', label: 'Guy（男）' },
      { id: 'en-US-AnaNeural', label: 'Ana（女童）' },
    ],
  },
]

/** The three ways to give a character a voice, as the toggle names them. */
const MODES: { id: Mode; label: string }[] = [
  { id: 'clone', label: '模仿錄音' },
  { id: 'instruct', label: '描述語氣' },
  { id: 'edge', label: '微軟標準聲音' },
]

function selectEdgeVoice(voiceId: string) {
  emit('update:modelValue', {
    provider: 'edge-tts',
    voice: voiceId,
  })
}

function switchMode(m: Mode) {
  activeMode.value = m
  if (m === 'clone') {
    if (sampleExists.value) {
      emit('update:modelValue', {
        provider: 'cosyvoice3',
        voice: `@/assets/cast/${props.castId}/voice-sample.wav`,
      })
    }
  } else if (m === 'instruct') {
    updateInstruct()
  } else if (m === 'edge') {
    selectEdgeVoice(props.modelValue.voice || 'zh-TW-HsiaoChenNeural')
  }
}

// --- Audition (試聽音檔) ---
// `tts --sample` reads the voice from video.project.json, so the cast member must be saved first.
const auditionPath = computed(() => `brief/voices/${props.castId}.mp3`)
const auditionMtime = ref(0)
// The sample file is not the project file: follow its own mtime (re-read on every project reload).
watch(
  [state, auditionPath],
  async () => {
    const file = root.value ? await tryFile(root.value, auditionPath.value) : null
    auditionMtime.value = file?.lastModified ?? 0
  },
  { immediate: true },
)
const auditionUrl = useFileUrl(auditionPath, auditionMtime)
const auditionLoading = ref(false)
const savedMember = computed(() => state.value?.project.project.cast?.find((c) => c.id === props.castId) ?? null)
const voiceUnsaved = computed(
  () => !savedMember.value || savedMember.value.provider !== props.modelValue.provider || savedMember.value.voice !== props.modelValue.voice,
)
/** What the user hands the agent to make the audition clip; the command in brackets is for the agent. */
const sampleRequest = computed(() => `請用【${props.castName}】目前的聲音設定產生試聽檔。（pnpm run tts --sample ${props.castId}）`)

async function triggerAudition() {
  if (voiceUnsaved.value) return
  auditionLoading.value = true
  try {
    await navigator.clipboard.writeText(sampleRequest.value)
    notify('ok', '已複製，請貼給 Agent；試聽做好後會出現在這裡。')
  } catch (err) {
    notify('error', (err as Error).message)
  } finally {
    auditionLoading.value = false
  }
}

onBeforeUnmount(() => {
  stopRecording()
  if (recordedAudioUrl.value) URL.revokeObjectURL(recordedAudioUrl.value)
})
</script>

<template>
  <div class="space-y-4 rounded-md border border-stone-200 bg-stone-50/60 p-4 dark:border-stone-800 dark:bg-stone-900/60">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="flex h-7 w-7 items-center justify-center rounded-md bg-vermilion-500/10 text-vermilion-600 dark:text-vermilion-400">
          <Icon name="mic" :size="15" />
        </span>
        <h4 class="text-sm font-semibold text-stone-800 dark:text-stone-200">聲音</h4>
      </div>
      <div class="flex rounded-md bg-stone-100 p-0.5 text-xs dark:bg-stone-800" role="group" aria-label="聲音的做法">
        <button
          v-for="m in MODES"
          :key="m.id"
          type="button"
          class="rounded-md px-2.5 py-1 font-medium transition"
          :class="activeMode === m.id ? 'bg-white text-stone-900 dark:bg-stone-950 dark:text-white' : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'"
          :aria-pressed="activeMode === m.id"
          @click="switchMode(m.id)"
        >
          {{ m.label }}
        </button>
      </div>
    </div>

    <!-- Mode A: Clone / Recording -->
    <div v-if="activeMode === 'clone'" class="space-y-3 rounded-md border border-emerald-100 bg-emerald-50/50 p-3.5 dark:border-emerald-950/60 dark:bg-emerald-950/20">
      <div class="flex items-start justify-between">
        <div>
          <p class="text-xs font-semibold text-emerald-900 dark:text-emerald-200">錄一句 3～5 秒的話</p>
          <p class="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">用這個角色的口氣說一句話，配音會模仿你的音色和情緒（CosyVoice 3）。</p>
        </div>
        <span v-if="sampleExists" class="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
          <Icon name="check" :size="12" /> 已有錄音樣本
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-3 pt-1">
        <button
          v-if="!recording"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition"
          @click="startRecording"
        >
          <Icon name="mic" :size="14" />
          <span>{{ recordedBlob || sampleExists ? '重新錄音' : '開始錄音' }}</span>
        </button>
        <button
          v-else
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 animate-pulse transition"
          @click="stopRecording"
        >
          <Icon name="square" :size="14" />
          <span>停止錄音（{{ recordDuration }} 秒）</span>
        </button>

        <audio v-if="recordedAudioUrl" :src="recordedAudioUrl" controls class="h-8 max-w-[220px]" />

        <button
          v-if="recordedBlob"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-emerald-600 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:bg-stone-800 dark:text-emerald-300 dark:border-emerald-500 transition"
          @click="saveRecordedSample"
        >
          <Icon name="check" :size="13" />
          <span>使用這段錄音</span>
        </button>
      </div>
    </div>

    <!-- Mode B: CosyVoice 3 Instruct -->
    <div v-else-if="activeMode === 'instruct'" class="space-y-3 rounded-md border border-vermilion-100 bg-vermilion-50/50 p-3.5 dark:border-vermilion-950/60 dark:bg-vermilion-950/20">
      <div>
        <p class="text-xs font-semibold text-vermilion-950 dark:text-vermilion-200">用一句話描述語氣</p>
        <p class="mt-0.5 text-xs text-vermilion-700 dark:text-vermilion-400">選一個基本聲音，再用白話說明口氣、情緒或方言，例如台語、粵語（CosyVoice 3）。</p>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="block text-xs font-medium text-stone-700 dark:text-stone-300">基本聲音</label>
          <select
            v-model="instructBaseVoice"
            class="input-sm mt-1 w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs dark:border-stone-700 dark:bg-stone-800 text-stone-800 dark:text-stone-200"
            @change="updateInstruct"
          >
            <option v-for="v in BASE_VOICES" :key="v.id" :value="v.id">{{ v.label }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-stone-700 dark:text-stone-300">語氣、情緒或方言</label>
          <input
            v-model="instructPrompt"
            type="text"
            placeholder="例如：用熱情開朗的大學生語氣、用台語說"
            class="input-sm mt-1 w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs dark:border-stone-700 dark:bg-stone-800 text-stone-800 dark:text-stone-200"
            @input="updateInstruct"
          />
        </div>
      </div>

      <div>
        <span class="text-[11px] font-medium text-stone-500 dark:text-stone-400">常用：</span>
        <div class="mt-1 flex flex-wrap gap-1.5">
          <button
            v-for="tag in QUICK_INSTRUCTS"
            :key="tag"
            type="button"
            class="rounded bg-vermilion-100 px-2 py-0.5 text-[11px] text-vermilion-800 hover:bg-vermilion-200 dark:bg-vermilion-900/60 dark:text-vermilion-300 transition"
            @click="applyQuickInstruct(tag)"
          >
            {{ tag }}
          </button>
        </div>
      </div>
    </div>

    <!-- Mode C: Edge-TTS -->
    <div v-else class="space-y-3 rounded-md border border-stone-200 bg-white p-3.5 dark:border-stone-800 dark:bg-stone-900">
      <div>
        <p class="text-xs font-semibold text-stone-800 dark:text-stone-200">選一個現成的聲音</p>
        <p class="mt-0.5 text-xs text-stone-500 dark:text-stone-400">微軟 Edge 的線上語音（Edge-TTS），免費，電腦不需要額外設定。</p>
      </div>

      <div>
        <label class="block text-xs font-medium text-stone-700 dark:text-stone-300">聲音</label>
        <select
          :value="modelValue.voice || 'zh-TW-HsiaoChenNeural'"
          class="input-sm mt-1 w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs dark:border-stone-700 dark:bg-stone-800 text-stone-800 dark:text-stone-200"
          @change="selectEdgeVoice(($event.target as HTMLSelectElement).value)"
        >
          <optgroup v-for="g in EDGE_VOICES" :key="g.region" :label="g.region">
            <option v-for="v in g.voices" :key="v.id" :value="v.id">{{ v.label }}</option>
          </optgroup>
        </select>
      </div>
    </div>

    <!-- Audition Bar (試聽音檔) -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-3 dark:border-stone-800">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-stone-700 dark:text-stone-300">試聽：</span>
        <audio v-if="auditionUrl" :src="auditionUrl" controls class="h-8 max-w-[260px]" />
        <span v-else class="text-xs text-stone-400 dark:text-stone-500">還沒有試聽</span>
        <span v-if="voiceUnsaved" class="text-[11px] text-amber-600 dark:text-amber-400" data-testid="audition-unsaved">聲音設定尚未儲存，儲存角色後才能試聽</span>
      </div>

      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700 transition"
        :disabled="auditionLoading || voiceUnsaved"
        :title="voiceUnsaved ? '試聽使用已儲存的聲音設定，請先儲存角色' : ''"
        data-testid="audition"
        @click="triggerAudition"
      >
        <Icon name="copy" :size="13" />
        <span>複製給 Agent：產生試聽</span>
      </button>
    </div>
  </div>
</template>
