<script setup lang="ts">
import { computed } from 'vue'
import { api } from '../lib/site'
import { dirHandle, project, start } from '../lib/store'
import CopyButton from './CopyButton.vue'

const folderName = computed(() => dirHandle.value?.name || '專案資料夾')

// Existing projects only need the Skill; a prepared (empty) folder also needs the template steps,
// which live in the Skill so the prompt stays short and the Agent verifies the zip's checksum.
const agentPrompt = computed(() => {
  const title = project.value?.title || start.value?.title || '新簡報'
  const skill = api('skills/slidev-deck/SKILL.md')
  const lead = project.value
    ? `請繼續製作「${folderName.value}」資料夾裡的 Slidev 簡報「${title}」。`
    : `請在「${folderName.value}」資料夾為我製作一份 Slidev 簡報「${title}」。這個資料夾是網頁準備的，需求寫在 slide.start.json。`
  return `${lead}

請先閱讀並遵循這份 Skill：${skill}
（新專案依 Skill §1 下載範本、以 manifest 的 SHA-256 驗證後解壓，再依 slide.start.json 填寫 slide.project.json；不要另建子資料夾。）

全程使用繁體中文，每個階段結束時停下來讓我確認。`
})

const exportCommand = 'pnpm run export'
const devCommand = 'pnpm run dev'
const validateCommand = 'pnpm run validate'
</script>

<template>
  <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div class="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
      <div>
        <h3 class="font-semibold text-slate-900 dark:text-white">Coding Agent 啟動指令</h3>
        <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          複製以下提示詞貼至本機 Claude Code、Cursor、Windsurf 等 Coding Agent
        </p>
      </div>
      <CopyButton :text="agentPrompt" label="複製完整提示詞" />
    </div>

    <!-- Prompt Box -->
    <div class="mt-4">
      <div class="relative">
        <textarea
          readonly
          rows="7"
          :value="agentPrompt"
          class="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 focus:outline-hidden dark:border-slate-700/60 dark:bg-slate-950/50 dark:text-slate-200"
        ></textarea>
      </div>
    </div>

    <!-- Quick Terminal Commands -->
    <div class="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
      <h4 class="text-xs font-medium text-slate-600 dark:text-slate-400">本機常用快捷指令 (Terminal Commands)</h4>
      <div class="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div class="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/50">
          <span class="font-mono text-slate-700 dark:text-slate-300">{{ devCommand }}</span>
          <CopyButton :text="devCommand" label="複製" />
        </div>
        <div class="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/50">
          <span class="font-mono text-slate-700 dark:text-slate-300">{{ exportCommand }}</span>
          <CopyButton :text="exportCommand" label="複製" />
        </div>
        <div class="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/50">
          <span class="font-mono text-slate-700 dark:text-slate-300">{{ validateCommand }}</span>
          <CopyButton :text="validateCommand" label="複製" />
        </div>
      </div>
    </div>
  </div>
</template>
