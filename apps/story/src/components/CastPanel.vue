<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from '@video-core/web/components/Icon.vue'
import CastEditor from './CastEditor.vue'
import type { VideoProjectJson } from '@video-core/web/types/protocol'
import { saveCast } from '@video-core/web/lib/writes'
import { notify, root, state, write } from '@video-core/web/lib/store'

type CastMember = NonNullable<VideoProjectJson['project']['cast']>[number]

const castList = computed<CastMember[]>(() => {
  return state.value?.project.project.cast ?? []
})

const selectedId = ref<string | null>(null)
const isCreating = ref(false)

const draftNewMember = ref<CastMember>({
  id: '',
  name: '',
  description: '',
  provider: 'cosyvoice3',
  voice: '中文男 <用熱情開朗的大學生語氣>',
  art: '',
})

// Auto select first member when available and none selected
watch(
  castList,
  (list) => {
    if (isCreating.value) return
    if (!selectedId.value && list.length > 0) {
      selectedId.value = list[0].id
    } else if (selectedId.value && !list.some((c) => c.id === selectedId.value)) {
      selectedId.value = list[0]?.id ?? null
    }
  },
  { immediate: true },
)

const activeMember = computed<CastMember | null>(() => {
  if (isCreating.value) return draftNewMember.value
  return castList.value.find((c) => c.id === selectedId.value) ?? null
})

function startCreate() {
  const nextIdx = castList.value.length + 1
  draftNewMember.value = {
    id: `character-${nextIdx}`,
    name: `新角色 ${nextIdx}`,
    description: '',
    provider: 'cosyvoice3',
    voice: '中文男 <用熱情開朗的大學生語氣>',
    art: '', // set from the final id on save
  }
  isCreating.value = true
  selectedId.value = null
}

function selectMember(id: string) {
  isCreating.value = false
  selectedId.value = id
}

async function handleDelete(id: string) {
  const current = [...castList.value]
  const updated = current.filter((c) => c.id !== id)
  const ok = await write((r, st) => saveCast(r, st, updated), '角色已刪除')
  if (ok) {
    if (selectedId.value === id) {
      selectedId.value = updated[0]?.id ?? null
    }
  }
}

function handleSaved(member: CastMember) {
  isCreating.value = false
  selectedId.value = member.id
}

/** How a member's voice is made, in the voice studio's words; without a provider of its own, the project's speaks. */
function voiceKind(member: CastMember) {
  if (!member.provider && !member.voice) return '預設聲音'
  const provider = member.provider ?? state.value?.project.project.tts.provider
  if (provider === 'cosyvoice3' || provider === 'cosyvoice') return member.voice?.endsWith('.wav') ? '模仿錄音' : '描述語氣'
  return provider === 'edge-tts' ? '微軟標準聲音' : '其他語音服務'
}

function copyAllCastToAgent() {
  const list = castList.value
  if (!list.length) {
    notify('warn', '目前尚未建立任何角色')
    return
  }

  const lines = list.map((c, i) => {
    return `${i + 1}. 【${c.name}】(id: ${c.id})
   - 外觀個性：${c.description || '無描述'}
   - 語音提供：${c.provider || '預設'} (${c.voice || '未指定'})
   - 美術資料夾：${c.art || `@/assets/cast/${c.id}/`}`
  })

  const text = `以下是目前故事影片的登場角色名冊 (Cast)：\n\n${lines.join('\n\n')}\n\n請依據以上角色設定協助編寫後續分鏡與對白。`
  navigator.clipboard.writeText(text)
  notify('ok', '已複製，請貼給 Agent。')
}
</script>

<template>
  <div class="grid items-start gap-4 lg:grid-cols-[minmax(300px,1.2fr)_2.5fr]">
    <!-- Left Column: Character Roster -->
    <div class="space-y-3 rounded-md border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <div class="flex items-center justify-between border-b border-stone-100 pb-2.5 dark:border-stone-800">
        <div class="flex items-center gap-2">
          <span class="flex h-7 w-7 items-center justify-center rounded-md bg-vermilion-500/10 text-vermilion-600 dark:text-vermilion-400">
            <Icon name="user" :size="15" />
          </span>
          <h3 class="text-sm font-semibold text-stone-800 dark:text-stone-100">登場角色名冊（{{ castList.length }} 人）</h3>
        </div>
        <button
          type="button"
          class="btn-primary btn-sm"
          @click="startCreate"
        >
          <Icon name="plus" :size="14" />新增角色
        </button>
      </div>

      <!-- Empty State -->
      <div v-if="!castList.length && !isCreating" class="py-8 text-center">
        <span class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-400 dark:bg-stone-800">
          <Icon name="user" :size="20" />
        </span>
        <p class="mt-2 text-xs font-medium text-stone-600 dark:text-stone-400">尚未建立登場角色</p>
        <p class="text-[11px] text-stone-400">點擊上方「新增角色」，或由 Agent 協助產生</p>
      </div>

      <!-- List -->
      <div v-else class="space-y-2">
        <button
          v-if="isCreating"
          type="button"
          class="w-full text-left rounded-md border-2 border-dashed border-vermilion-400 bg-vermilion-50/60 p-3 dark:border-vermilion-700 dark:bg-vermilion-950/30"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-vermilion-800 dark:text-vermilion-200">正在新增角色…</span>
            <span class="rounded bg-vermilion-200 px-1.5 py-0.5 text-[10px] font-medium text-vermilion-900 dark:bg-vermilion-900 dark:text-vermilion-300">草稿</span>
          </div>
          <p class="mt-1 text-xs text-vermilion-700 dark:text-vermilion-300">{{ draftNewMember.name || '未命名' }} ({{ draftNewMember.id }})</p>
        </button>

        <button
          v-for="member in castList"
          :key="member.id"
          type="button"
          class="group w-full text-left rounded-md border p-3 transition shadow-2xs"
          :class="
            !isCreating && selectedId === member.id
              ? 'border-stone-400 bg-stone-100 shadow-[inset_2px_0_0_var(--color-accent)] dark:border-stone-600 dark:bg-stone-800'
              : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50/60 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700'
          "
          @click="selectMember(member.id)"
        >
          <span class="block text-xs font-semibold text-stone-900 group-hover:text-vermilion-600 dark:text-stone-100 dark:group-hover:text-vermilion-400">{{ member.name }}</span>

          <p v-if="member.description" class="mt-1 line-clamp-1 text-[11px] text-stone-500 dark:text-stone-400">
            {{ member.description }}
          </p>

          <div class="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
            <span class="rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-300">{{ voiceKind(member) }}</span>
          </div>
        </button>
      </div>

      <div v-if="castList.length > 0" class="border-t border-stone-100 pt-3 dark:border-stone-800">
        <button
          type="button"
          class="btn-ghost btn-sm w-full justify-center text-xs"
          @click="copyAllCastToAgent"
        >
          <Icon name="copy" :size="13" />
          <span>複製角色名冊給 Agent</span>
        </button>
      </div>
    </div>

    <!-- Right Column: Cast Editor -->
    <div>
      <CastEditor
        v-if="activeMember"
        :cast="activeMember"
        :is-new="isCreating"
        @close="isCreating = false"
        @delete="handleDelete"
        @saved="handleSaved"
      />
      <div
        v-else
        class="flex flex-col items-center justify-center rounded-md border border-dashed border-stone-300 bg-white p-12 text-center dark:border-stone-800 dark:bg-stone-900"
      >
        <span class="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-400 dark:bg-stone-800">
          <Icon name="user" :size="24" />
        </span>
        <h4 class="mt-3 text-sm font-semibold text-stone-700 dark:text-stone-300">請從左側選擇角色或新增角色</h4>
        <p class="mt-1 text-xs text-stone-400">每個角色可以挑聲音、放參考圖，再請 Agent 畫出會動的角色。</p>
        <button type="button" class="btn-primary btn-sm mt-4" @click="startCreate">
          <Icon name="plus" :size="14" />新增角色
        </button>
      </div>
    </div>
  </div>
</template>
