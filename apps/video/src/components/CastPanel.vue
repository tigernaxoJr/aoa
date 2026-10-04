<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from './Icon.vue'
import CastEditor from './CastEditor.vue'
import type { VideoProjectJson } from '../types/protocol'
import { saveCast } from '../lib/writes'
import { notify, root, state, write } from '../lib/store'

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
    id: `character_${nextIdx}`,
    name: `新角色 ${nextIdx}`,
    description: '',
    provider: 'cosyvoice3',
    voice: '中文男 <用熱情開朗的大學生語氣>',
    art: `@/assets/cast/character_${nextIdx}/`,
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
  notify('ok', '已複製角色名冊，請直接貼給 Coding Agent！')
}
</script>

<template>
  <div class="grid items-start gap-4 lg:grid-cols-[minmax(300px,1.2fr)_2.5fr]">
    <!-- Left Column: Character Roster -->
    <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div class="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
        <div class="flex items-center gap-2">
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Icon name="user" :size="15" />
          </span>
          <h3 class="text-sm font-semibold text-slate-800 dark:text-slate-100">登場角色名冊 ({{ castList.length }} 人)</h3>
        </div>
        <button
          type="button"
          class="btn-primary btn-sm"
          @click="startCreate"
        >
          <span>➕ 新增角色</span>
        </button>
      </div>

      <!-- Empty State -->
      <div v-if="!castList.length && !isCreating" class="py-8 text-center">
        <span class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
          <Icon name="user" :size="20" />
        </span>
        <p class="mt-2 text-xs font-medium text-slate-600 dark:text-slate-400">尚未建立登場角色</p>
        <p class="text-[11px] text-slate-400">點擊上方「新增角色」，或由 Agent 協助產生</p>
      </div>

      <!-- List -->
      <div v-else class="space-y-2">
        <button
          v-if="isCreating"
          type="button"
          class="w-full text-left rounded-xl border-2 border-dashed border-sky-400 bg-sky-50/60 p-3 dark:border-sky-700 dark:bg-sky-950/30"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-sky-800 dark:text-sky-200">✨ 正在新增角色...</span>
            <span class="rounded bg-sky-200 px-1.5 py-0.5 text-[10px] font-medium text-sky-900 dark:bg-sky-900 dark:text-sky-300">草稿</span>
          </div>
          <p class="mt-1 text-xs text-sky-700 dark:text-sky-300">{{ draftNewMember.name || '未命名' }} ({{ draftNewMember.id }})</p>
        </button>

        <button
          v-for="member in castList"
          :key="member.id"
          type="button"
          class="group w-full text-left rounded-xl border p-3 transition shadow-2xs"
          :class="
            !isCreating && selectedId === member.id
              ? 'border-indigo-500 bg-indigo-50/40 ring-1 ring-indigo-500/20 dark:border-indigo-500 dark:bg-indigo-950/20'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
          "
          @click="selectMember(member.id)"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
              👤 {{ member.name }}
            </span>
            <span class="font-mono text-[10px] text-slate-400 dark:text-slate-500">{{ member.id }}</span>
          </div>

          <p v-if="member.description" class="mt-1 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
            {{ member.description }}
          </p>

          <div class="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
            <span
              v-if="member.provider === 'cosyvoice3' || member.provider === 'cosyvoice'"
              class="rounded bg-sky-100 px-1.5 py-0.5 font-medium text-sky-800 dark:bg-sky-900/60 dark:text-sky-300"
            >
              {{ member.voice?.endsWith('.wav') ? '🎤 錄音克隆' : '⚡ CosyVoice 3' }}
            </span>
            <span
              v-else-if="member.provider === 'edge-tts'"
              class="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              🔊 Edge-TTS
            </span>
            <span v-else class="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500 dark:bg-slate-800">
              {{ member.provider || '預設聲音' }}
            </span>
          </div>
        </button>
      </div>

      <div v-if="castList.length > 0" class="border-t border-slate-100 pt-3 dark:border-slate-800">
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
        class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900"
      >
        <span class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
          <Icon name="user" :size="24" />
        </span>
        <h4 class="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">請從左側選擇角色或新增角色</h4>
        <p class="mt-1 text-xs text-slate-400">角色工坊支援自訂錄音、聲音克隆、AI 骨骼圖與參考概念圖管理。</p>
        <button type="button" class="btn-primary btn-sm mt-4" @click="startCreate">
          <span>➕ 立即新增角色</span>
        </button>
      </div>
    </div>
  </div>
</template>
