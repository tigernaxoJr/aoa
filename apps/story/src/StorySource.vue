<script setup lang="ts">
// Step 2 of the start page: the story (or just an idea), who it is for and the preferred voice engine.
import type { SourceInput } from '@video-core/web/lib/site'
import Icon from '@video-core/web/components/Icon.vue'

const props = defineProps<{ form: SourceInput }>()
const form = props.form
</script>

<template>
  <h2 class="font-semibold">告訴 Agent 你的故事</h2>
  <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">貼上整篇故事、寫個大綱，或只寫一個點子都可以；不完整的地方，Agent 會一題一題問你。</p>
  <div class="mt-5 space-y-5">
    <label class="block">
      <span class="label">故事</span>
      <textarea
        v-model="form.story"
        rows="7"
        placeholder="例如：一隻小狐狸以為月亮掉進了池塘，想盡辦法要把它撈起來……"
        class="field"
        data-testid="story-text"
      />
    </label>
    <label class="block">
      <span class="label">給誰看 <span class="font-normal text-slate-500">（選填）</span></span>
      <input v-model.trim="form.audience" type="text" placeholder="例如：4–7 歲的小朋友、社群上的大人" class="field" data-testid="story-audience" />
    </label>
    <div class="block">
      <span class="label">語音引擎偏好</span>
      <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          class="flex flex-col items-start rounded-xl border p-3 text-left transition cursor-pointer"
          :class="(form.ttsProvider === 'cosyvoice3' || !form.ttsProvider) ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-500/20 dark:bg-sky-950/40' : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'"
          data-testid="tts-cosyvoice3"
          @click="form.ttsProvider = 'cosyvoice3'"
        >
          <span class="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
            <Icon name="sparkles" :size="15" class="text-sky-600" />CosyVoice 3（AI 角色配音）
          </span>
          <span class="mt-1 text-xs text-slate-500 dark:text-slate-400">
            AI 依角色性格與年齡自動配音色（自然語言語氣指令），亦支援錄音克隆
          </span>
        </button>
        <button
          type="button"
          class="flex flex-col items-start rounded-xl border p-3 text-left transition cursor-pointer"
          :class="form.ttsProvider === 'edge-tts' ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-500/20 dark:bg-sky-950/40' : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'"
          data-testid="tts-edge-tts"
          @click="form.ttsProvider = 'edge-tts'"
        >
          <span class="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
            <Icon name="film" :size="15" class="text-slate-600" />微軟 Edge-TTS
          </span>
          <span class="mt-1 text-xs text-slate-500 dark:text-slate-400">
            微軟雲端標準發音人庫（曉臻、雲哲等），免設定本地模型
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
