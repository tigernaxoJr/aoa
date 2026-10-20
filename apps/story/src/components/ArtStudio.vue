<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from '@video-core/web/components/Icon.vue'
import { tryFile, writeFile } from '@aoa/web-shared/fsa'
import { notify, root, state } from '@video-core/web/lib/store'
import { useFileUrl } from '@video-core/web/lib/useFileUrl'

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
    notify('warn', '請放圖片（PNG、JPG 或 WebP）')
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
    notify('ok', '已儲存參考圖')
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
// Parts holding a data-morph-* path. A missing tail curl or body squash is only a hint: adding it later means
// editing a character file every scene shares, so it is cheaper to draw while the character is being made.
const morphParts = ref<string[]>([])
const morphHints = computed(() => {
  const hints: string[] = []
  if (detectedParts.value.includes('tail') && !morphParts.value.includes('tail')) hints.push('尾巴捲起')
  if (hasBody.value && !morphParts.value.includes('body')) hints.push('身體蹲下、落地時壓扁')
  return hints
})
/** The parts a scene can move separately, in plain words. */
const moves = computed(() => [
  { label: '頭', ok: hasHead.value },
  { label: '身體', ok: hasBody.value },
  { label: '手腳', ok: hasLimbs.value },
  { label: '表情', ok: hasFace.value },
])
const MORPH_LABEL: Record<string, string> = { tail: '尾巴捲起', body: '身體壓扁' }

async function loadSvg() {
  if (!root.value || !props.castId) {
    svgRaw.value = null
    detectedParts.value = []
    morphParts.value = []
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
    morphParts.value = []
    return
  }

  const text = await file.text()
  svgRaw.value = text

  // Detect <g id="..." data-pivot="..."> parts
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'image/svg+xml')
  const groups = Array.from(doc.querySelectorAll('g[id]'))
  detectedParts.value = groups.map((g) => g.id)
  const morphed = Array.from(doc.querySelectorAll('*')).filter((el) => el.getAttributeNames().some((n) => n.startsWith('data-morph-')))
  morphParts.value = [...new Set(morphed.map((el) => el.closest('g[id]')?.id).filter((id): id is string => !!id))]
}

watch([() => props.castId, projectMtime], loadSvg, { immediate: true })

// --- Prompt Generator ---
function copyAgentPrompt() {
  const prompt = `請為角色【${props.castName}】（ID: ${props.castId}）繪製符合規範的向量骨骼圖：
- 存放路徑：assets/cast/${props.castId}/${props.castId}.svg
- 角色外觀描述：${props.castDescription || '無特別描述，請參考角色名稱風格'}
- 參考概念圖位置：assets/cast/${props.castId}/reference.png
- 規格要求：viewBox="0 0 400 600"，腳底位於畫布底部中心。包含分層部件 <g id="head" data-pivot="...">, <g id="body">, <g id="arm-l">, <g id="arm-r">, <g id="leg-l">, <g id="leg-r">，以及表情切換部件 (eye-open, eye-closed, mouth-open, mouth-closed)。
- 變形形狀：有尾巴時在 tail 的 path 加 data-morph-curl；會跳、蹲或落地的角色在 body 的 path 加 data-morph-squash（與原形相同的指令與順序，只改座標）。`

  navigator.clipboard.writeText(prompt)
  notify('ok', '已複製，請貼給 Agent；畫好後會出現在這裡。')
}
</script>

<template>
  <div class="space-y-4 rounded-md border border-stone-200 bg-stone-50/60 p-4 dark:border-stone-800 dark:bg-stone-900/60">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="flex h-7 w-7 items-center justify-center rounded-md bg-vermilion-500/10 text-vermilion-600 dark:text-vermilion-400">
          <Icon name="film" :size="15" />
        </span>
        <h4 class="text-sm font-semibold text-stone-800 dark:text-stone-200">角色圖</h4>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-vermilion-200 bg-vermilion-50 px-2.5 py-1 text-xs font-semibold text-vermilion-700 hover:bg-vermilion-100 dark:border-vermilion-900/60 dark:bg-vermilion-950/40 dark:text-vermilion-300 transition"
        title="複製一段話，請 Agent 依參考圖和描述畫出會動的角色"
        data-testid="draw-request"
        @click="copyAgentPrompt"
      >
        <Icon name="copy" :size="12" />
        <span>複製給 Agent：畫角色圖</span>
      </button>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <!-- Card 1: Reference Art -->
      <div
        class="relative flex flex-col items-center justify-center rounded-md border-2 border-dashed border-stone-300 bg-white p-4 text-center transition hover:border-vermilion-400 dark:border-stone-700 dark:bg-stone-800"
        @dragover.prevent
        @drop="handleFileDrop"
      >
        <div v-if="refImgUrl" class="space-y-2 text-center">
          <img :src="refImgUrl" alt="參考圖" class="mx-auto max-h-48 rounded-md object-contain" />
          <p class="text-xs text-stone-500 dark:text-stone-400">參考圖</p>
          <button
            type="button"
            class="text-xs font-medium text-vermilion-600 hover:underline dark:text-vermilion-400"
            @click="fileInput?.click()"
          >
            更換圖片
          </button>
        </div>
        <div v-else class="space-y-2 py-4">
          <span class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-400 dark:bg-stone-700">
            <Icon name="folder" :size="20" />
          </span>
          <div>
            <p class="text-xs font-medium text-stone-700 dark:text-stone-300">把參考圖拖到這裡</p>
            <p class="text-[11px] text-stone-400 dark:text-stone-500">草稿、照片或喜歡的畫風都可以（PNG、JPG、WebP）</p>
          </div>
          <button
            type="button"
            class="rounded-md border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200"
            @click="fileInput?.click()"
          >
            選擇圖片…
          </button>
        </div>
        <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="handleFileSelect" />
      </div>

      <!-- Card 2: AI Rigged SVG Gallery -->
      <div class="flex flex-col rounded-md border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-800">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-xs font-semibold text-stone-800 dark:text-stone-200">Agent 畫的角色</span>
          <span
            v-if="svgRaw && detectedParts.length"
            class="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
          >
            <Icon name="check" :size="12" />已畫好
          </span>
          <span v-else-if="svgRaw" class="text-[11px] text-amber-600 dark:text-amber-400">已畫好，還不能動</span>
          <span v-else class="text-[11px] text-amber-600 dark:text-amber-400">還沒畫</span>
        </div>

        <div class="flex flex-1 items-center justify-center rounded-md bg-stone-50 p-2 dark:bg-stone-900/50">
          <div
            v-if="svgRaw"
            class="max-h-48 max-w-full overflow-hidden flex items-center justify-center [&_svg]:max-h-48 [&_svg]:w-auto"
            v-html="svgRaw"
          />
          <div v-else class="text-center py-6">
            <span class="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-stone-200 text-stone-500 dark:bg-stone-800">
              <Icon name="sparkles" :size="18" />
            </span>
            <p class="mt-2 text-xs text-stone-500 dark:text-stone-400">還沒有角色圖</p>
            <p class="text-[11px] text-stone-400">按上方「複製給 Agent：畫角色圖」，貼給 Agent。</p>
          </div>
        </div>

        <!-- The parts a scene can move; with none the character only moves as one picture. -->
        <div v-if="svgRaw" class="mt-3 space-y-1.5 border-t border-stone-100 pt-2.5 dark:border-stone-700/60" data-testid="rig-parts">
          <p v-if="!detectedParts.length" class="text-[11px] text-amber-700 dark:text-amber-400">
            還沒有分出能動的部位，角色只能整張移動。要做動作，請 Agent 依規格重畫（再按一次上方的按鈕）。
          </p>
          <template v-else>
            <div class="text-[11px] font-medium text-stone-600 dark:text-stone-400">能分開動的部位：</div>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="m in moves"
                :key="m.label"
                class="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium"
                :class="m.ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-stone-100 text-stone-400 line-through dark:bg-stone-900'"
              >
                <Icon :name="m.ok ? 'check' : 'x'" :size="10" />{{ m.label }}
              </span>
              <span
                v-for="id in morphParts"
                :key="id"
                class="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
              >
                <Icon name="check" :size="10" />{{ MORPH_LABEL[id] ?? `${id} 變形` }}
              </span>
            </div>
            <p v-if="morphHints.length" class="text-[11px] text-amber-700 dark:text-amber-400">還可以請 Agent 補上：{{ morphHints.join('、') }}</p>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
