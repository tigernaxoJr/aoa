<script setup lang="ts">
import { computed } from 'vue'
import { api } from '../lib/site'
import { referencesLine } from '@aoa/web-shared/references'
import { dirHandle, project, referenceCount, start } from '../lib/store'
import CopyButton from './CopyButton.vue'

const folderName = computed(() => dirHandle.value?.name || '專案資料夾')

// Existing projects only need the Skill; a prepared (empty) folder also needs the template steps,
// which live in the Skill so the prompt stays short and the Agent verifies the zip's checksum. A prepared
// folder's prompt also repeats the form's answers, so the request does not hinge on the Agent reading the file.
const agentPrompt = computed(() => {
  const title = project.value?.title || start.value?.title || '新簡報'
  const skill = api('skills/slidev-deck/SKILL.md')
  const lead = project.value
    ? `你的工作資料夾是我在網頁上開啟的「${folderName.value}」。請確認工作目錄已在此資料夾，繼續製作 Slidev 簡報「${title}」。`
    : `你的工作資料夾是我在網頁上準備好的「${folderName.value}」。請確認你的工作目錄已切換至「${folderName.value}」，為我製作一份 Slidev 簡報「${title}」。這個資料夾是網頁準備的，需求寫在 slide.start.json，不要在其他地方建立專案。${missingContent()}`
  const request = project.value ? '' : requestLines()
  return `${lead}
${request ? `\n${request}\n` : ''}
請先閱讀並遵循這份 Skill：${skill}`
})

/** Without written content the Agent asks first, unless the references can say what the deck is about. */
function missingContent() {
  if (start.value?.content) return ''
  if (referenceCount.value) return '我沒有另外寫簡報內容，請以 references/ 的參考資料為主規劃；讀完仍不確定要講什麼，再問我。'
  return '我還沒寫簡報內容，請先問我要講什麼，再開始規劃大綱。'
}

// Long pasted material stays in slide.start.json; the prompt quotes its start so the request is visible either way.
const CONTENT_LIMIT = 600

/** The form's answers, spelled out so they reach the Agent even before it opens slide.start.json. */
function requestLines() {
  const s = start.value
  if (!s) return ''
  const lines = ['我的需求：']
  const content = s.content?.trim()
  if (content) {
    const cut = content.length > CONTENT_LIMIT
    lines.push(`- 簡報內容：${cut ? `${content.slice(0, CONTENT_LIMIT)}…（全文見 slide.start.json 的 content）` : content}`)
  }
  if (s.audience?.trim()) lines.push(`- 目標受眾與場合：${s.audience.trim()}`)
  lines.push(`- 頁數：${s.pagesCount ? `${s.pagesCount} 頁` : '請依內容評估，在大綱中提出建議頁數'}`)
  if (s.theme) lines.push(`- 主題風格：${s.theme}`)
  if (s.notes?.trim()) lines.push(`- 視覺偏好：${s.notes.trim()}`)
  if (referenceCount.value) lines.push(`- ${referencesLine(referenceCount.value)}`)
  return lines.length > 1 ? lines.join('\n') : ''
}
</script>

<template>
  <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div class="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
      <div>
        <h3 class="font-semibold text-slate-900 dark:text-white">Coding Agent 啟動指令</h3>
        <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          複製以下提示詞貼至本機 Claude Code、Cursor、Windsurf 等 Coding Agent。還沒有 Agent？看<a href="../docs/setup.zh-TW.html" target="_blank" rel="noopener" class="text-sky-700 underline underline-offset-2 hover:text-sky-900 dark:text-sky-300">準備你的 Agent</a>
        </p>
      </div>
      <CopyButton :text="agentPrompt" label="複製完整提示詞" />
    </div>

    <!-- Instructions banner -->
    <div class="mt-4 rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 text-xs text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">
      <div class="flex items-start gap-2">
        <span class="font-semibold shrink-0">💡 提示：</span>
        <span>請在 Agent 中開啟與網頁相同的<strong>「{{ folderName }}」</strong>資料夾（若 Agent 詢問路徑，請選取或貼上該資料夾），再貼上下方的提示詞開始執行。</span>
      </div>
    </div>

    <!-- Prompt Box -->
    <div class="mt-3">
      <div class="relative">
        <textarea
          readonly
          rows="10"
          :value="agentPrompt"
          class="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 focus:outline-hidden dark:border-slate-700/60 dark:bg-slate-950/50 dark:text-slate-200"
        ></textarea>
      </div>
    </div>
  </div>
</template>
