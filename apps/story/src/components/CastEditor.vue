<script setup lang="ts">
import { ref, watch } from 'vue'
import Icon from '@video-core/web/components/Icon.vue'
import VoiceStudio from './VoiceStudio.vue'
import ArtStudio from './ArtStudio.vue'
import type { VideoProjectJson } from '@video-core/web/types/protocol'
import { saveCast } from '@video-core/web/lib/writes'
import { notify, root, state, write } from '@video-core/web/lib/store'

type CastMember = NonNullable<VideoProjectJson['project']['cast']>[number]

const props = defineProps<{
  cast: CastMember
  isNew?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'delete', id: string): void
  (e: 'saved', member: CastMember): void
}>()

const localMember = ref<CastMember>({ ...props.cast })
const voiceConfig = ref<{ provider?: string; voice?: string }>({
  provider: props.cast.provider,
  voice: props.cast.voice,
})

watch(
  () => props.cast,
  (val) => {
    localMember.value = { ...val }
    voiceConfig.value = { provider: val.provider, voice: val.voice }
  },
  { deep: true },
)

watch(
  voiceConfig,
  (val) => {
    localMember.value.provider = val.provider as CastMember['provider']
    localMember.value.voice = val.voice
  },
  { deep: true },
)

const saving = ref(false)

async function handleSave() {
  const member = localMember.value
  const name = member.name.trim()
  const id = member.id.trim().toLowerCase()

  if (!name) {
    notify('warn', '請填寫角色名稱')
    return
  }
  if (!id) {
    notify('warn', '請填寫角色識別碼 (id)')
    return
  }
  // Same rule as project.schema.json cast[].id (it is also the art folder name).
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(id)) {
    notify('warn', '角色識別碼須以英文小寫開頭，只能包含英文小寫、數字與連字號（例如 old-farmer）')
    return
  }

  saving.value = true
  try {
    const currentCast = [...(state.value?.project.project.cast ?? [])]
    const updatedMember: CastMember = {
      ...member,
      id,
      name,
      art: member.art || `@/assets/cast/${id}/`,
    }

    const index = currentCast.findIndex((c) => c.id === props.cast.id)
    if (index >= 0) {
      currentCast[index] = updatedMember
    } else {
      currentCast.push(updatedMember)
    }

    const ok = await write((r, st) => saveCast(r, st, currentCast), `角色【${name}】已儲存`)
    if (ok) {
      emit('saved', updatedMember)
    }
  } finally {
    saving.value = false
  }
}

function handleDelete() {
  if (confirm(`確定要刪除角色【${props.cast.name}】嗎？`)) {
    emit('delete', props.cast.id)
  }
}
</script>

<template>
  <div class="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
      <div class="flex items-center gap-2">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
          <Icon name="user" :size="16" />
        </span>
        <div>
          <h3 class="text-base font-semibold text-slate-800 dark:text-slate-100">
            {{ isNew ? '新增角色' : `編輯角色：${cast.name}` }}
          </h3>
          <p class="text-xs text-slate-400 dark:text-slate-500">識別碼：{{ localMember.id || '尚未設定' }}</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          v-if="!isNew"
          type="button"
          class="btn-ghost btn-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          title="刪除此角色"
          @click="handleDelete"
        >
          <Icon name="x" :size="14" />
          <span class="hidden sm:inline">刪除</span>
        </button>
        <button type="button" class="btn-ghost btn-sm" @click="emit('close')">
          <span>關閉</span>
        </button>
        <button type="button" class="btn-primary btn-sm" :disabled="saving" @click="handleSave">
          <Icon name="check" :size="14" />
          <span>儲存角色</span>
        </button>
      </div>
    </div>

    <!-- Basic Info -->
    <div class="grid gap-4 sm:grid-cols-2">
      <div>
        <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">角色名稱 (劇本【】中使用的稱呼)</label>
        <input
          v-model="localMember.name"
          type="text"
          placeholder="例如：志明"
          class="input-sm mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
        />
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">識別碼 (ID / 資料夾名稱)</label>
        <input
          v-model="localMember.id"
          type="text"
          placeholder="例如：zhiming"
          :disabled="!isNew"
          class="input-sm mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-60"
        />
        <p v-if="!isNew" class="mt-0.5 text-[11px] text-slate-400">建立後識別碼固定，若需修改請先確認相關檔案。</p>
      </div>
    </div>

    <div>
      <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">角色外觀與個性描述 (供畫圖與配音參考)</label>
      <textarea
        v-model="localMember.description"
        rows="2"
        placeholder="例如：20歲熱血青年，個性樂觀開朗，穿著紅色連帽外套與休閒牛仔褲。"
        class="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
      />
    </div>

    <!-- Sub Studio 1: Voice -->
    <VoiceStudio
      v-if="localMember.id"
      :cast-id="localMember.id"
      :cast-name="localMember.name || '未命名角色'"
      v-model="voiceConfig"
    />

    <!-- Sub Studio 2: Art -->
    <ArtStudio
      v-if="localMember.id"
      :cast-id="localMember.id"
      :cast-name="localMember.name || '未命名角色'"
      :cast-description="localMember.description || ''"
    />
  </div>
</template>
