<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { tryFile, writeFile } from '../lib/fsa'
import { notify, root, state } from '../lib/store'
import { useFileUrl } from '../lib/useFileUrl'

const props = defineProps<{
  castId: string
  castName: string
  castDescription: string
}>()

// --- Reference Image ---
const refImgPath = computed(() => `assets/cast/${props.castId}/reference.png`)
const projectMtime = computed(() => state.value?.projectMtime ?? 0)
const refImgUrl = useFileUrl(refImgPath, projectMtime)
const fileInput = ref<HTMLInputElement | null>(null)

async function handleFileDrop(e: DragEvent) {
  e.preventDefault()
  if (!root.value || !e.dataTransfer?.files.length) return
  const file = e.dataTransfer.files[0]
  if (!file.type.startsWith('image/')) {
    notify('warn', '請上傳圖片格式（PNG / JPG / WebP）')
    return
  }
  await saveReferenceImage(file)
}

async function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  if (!root.value || !target.files?.length) return
  const file = target.files[0]
  await saveReferenceImage(file)
}

async function saveReferenceImage(file: File) {
  if (!root.value) return
  try {
    const dest = `assets/cast/${props.castId}/reference.png`
    await writeFile(root.value, dest, file)
    notify('ok', `已儲存參考概念圖至 ${dest}`)
  } catch (err) {
    notify('error', `儲存參考圖失敗：${(err as Error).message}`)
  }
}

// --- Rigged SVG ---
const svgRaw = ref<string | null>(null)
const detectedParts = ref<string[]>([])
const hasHead = computed(() => detectedParts.value.includes('head'))
const hasBody = computed(() => detectedParts.value.includes('body'))
const hasLimbs = computed(() => detectedParts.value.some((p) => p.startsWith('arm-') || p.startsWith('leg-')))
const hasFace = computed(() => detectedParts.value.some((p) => p.startsWith('eye-') || p.startsWith('mouth-')))

async function loadSvg() {
  if (!root.value || !props.castId) {
    svgRaw.value = null
    detectedParts.value = []
    return
  }
  // Check <id>.svg or rig.svg
  let file = await tryFile(root.value, `assets/cast/${props.castId}/${props.castId}.svg`)
  if (!file) {
    file = await tryFile(root.value, `assets/cast/${props.castId}/rig.svg`)
  }
  if (!file) {
    svgRaw.value = null
    detectedParts.value = []
    return
  }

  const text = await file.text()
  svgRaw.value = text

  // Detect <g id="..." data-pivot="..."> parts
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'image/svg+xml')
  const groups = Array.from(doc.querySelectorAll('g[id]'))
  detectedParts.value = groups.map((g) => g.id)
}

watch([() => props.castId, projectMtime], loadSvg, { immediate: true })

// --- Prompt Generator ---
function copyAgentPrompt() {
  const prompt = `請為角色【${props.castName}】（ID: ${props.castId}）繪製符合規範的向量骨骼圖：
- 存放路徑：assets/cast/${props.castId}/${props.castId}.svg
- 角色外觀描述：${props.castDescription || '無特別描述，請參考角色名稱風格'}
- 參考概念圖位置：assets/cast/${props.castId}/reference.png
- 規格要求：viewBox="0 0 400 600"，腳底位於畫布底部中心。包含分層部件 <g id="head" data-pivot="...">, <g id="body">, <g id="arm-l">, <g id="arm-r">, <g id="leg-l">, <g id="leg-r">，以及表情切換部件 (eye-open, eye-closed, mouth-open, mouth-closed)。`

  navigator.clipboard.writeText(prompt)
  notify('ok', '已複製繪製提示詞，請直接貼給 Coding Agent！')
}
</script>

<template>
  <div class="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/60">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
          <Icon name="film" :size="15" />
        </span>
        <h4 class="text-sm font-semibold text-slate-800 dark:text-slate-200">視覺與美術設定 (Art Studio)</h4>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300 transition"
        title="複製提示詞請 Agent 繪製角色 SVG"
        @click="copyAgentPrompt"
      >
        <Icon name="copy" :size="12" />
        <span>請 Agent 繪製 SVG 骨骼</span>
      </button>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <!-- Card 1: Reference Art -->
      <div
        class="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 text-center transition hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-800"
        @dragover.prevent
        @drop="handleFileDrop"
      >
        <div v-if="refImgUrl" class="space-y-2 text-center">
          <img :src="refImgUrl" alt="參考概念圖" class="mx-auto max-h-48 rounded-lg object-contain shadow-xs" />
          <p class="text-xs text-slate-500 dark:text-slate-400">概念參考圖已就緒 (reference.png)</p>
          <button
            type="button"
            class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            @click="fileInput?.click()"
          >
            更換圖片
          </button>
        </div>
        <div v-else class="space-y-2 py-4">
          <span class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-700">
            <Icon name="folder" :size="20" />
          </span>
          <div>
            <p class="text-xs font-medium text-slate-700 dark:text-slate-300">拖曳或上傳參考概念圖</p>
            <p class="text-[11px] text-slate-400 dark:text-slate-500">支援 PNG / JPG / WebP</p>
          </div>
          <button
            type="button"
            class="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            @click="fileInput?.click()"
          >
            選擇本機圖片
          </button>
        </div>
        <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="handleFileSelect" />
      </div>

      <!-- Card 2: AI Rigged SVG Gallery -->
      <div class="flex flex-col rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-800">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-800 dark:text-slate-200">AI 生成向量骨骼 (Rigged SVG)</span>
          <span
            v-if="svgRaw"
            class="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
          >
            <Icon name="check" :size="12" /> 已建立骨骼
          </span>
          <span v-else class="text-[11px] text-amber-600 dark:text-amber-400">尚未繪製</span>
        </div>

        <div class="flex flex-1 items-center justify-center rounded-lg bg-slate-50 p-2 dark:bg-slate-900/50">
          <div
            v-if="svgRaw"
            class="max-h-48 max-w-full overflow-hidden flex items-center justify-center [&_svg]:max-h-48 [&_svg]:w-auto"
            v-html="svgRaw"
          />
          <div v-else class="text-center py-6">
            <span class="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-slate-500 dark:bg-slate-800">
              <Icon name="sparkles" :size="18" />
            </span>
            <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">尚未找到 {{ castId }}.svg</p>
            <p class="text-[11px] text-slate-400">點擊右上角「請 Agent 繪製 SVG 骨骼」</p>
          </div>
        </div>

        <!-- Rig Parts Status -->
        <div v-if="svgRaw" class="mt-3 space-y-1.5 border-t border-slate-100 pt-2.5 dark:border-slate-700/60">
          <div class="text-[11px] font-medium text-slate-600 dark:text-slate-400">部件檢測 ({{ detectedParts.length }} 個)：</div>
          <div class="flex flex-wrap gap-1">
            <span
              class="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium"
              :class="hasHead ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 text-slate-400'"
            >
              {{ hasHead ? '✔️ head' : '❌ head' }}
            </span>
            <span
              class="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium"
              :class="hasBody ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 text-slate-400'"
            >
              {{ hasBody ? '✔️ body' : '❌ body' }}
            </span>
            <span
              class="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium"
              :class="hasLimbs ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 text-slate-400'"
            >
              {{ hasLimbs ? '✔️ 四肢 (arm/leg)' : '❌ 四肢' }}
            </span>
            <span
              class="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium"
              :class="hasFace ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 text-slate-400'"
            >
              {{ hasFace ? '✔️ 表情 (eye/mouth)' : '❌ 表情' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
