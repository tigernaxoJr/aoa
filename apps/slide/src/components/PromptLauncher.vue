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
  <section class="card overflow-hidden">
    <div class="border-b border-stone-200 px-5 py-4 dark:border-stone-800">
      <p class="eyebrow"><span class="text-accent">下一步</span> · 交給 Coding Agent</p>
      <h2 class="mt-2 font-serif text-xl font-bold">把這段提示詞貼給你的 Agent</h2>
      <p class="mt-1 text-sm text-stone-600 dark:text-stone-400">
        Claude Code、Codex、Cursor、Gemini CLI 都可以。還沒有 Agent？看<a href="../docs/setup.zh-TW.html" target="_blank" rel="noopener" class="link">準備你的 Agent</a>。
      </p>
    </div>

    <ol class="grid gap-px bg-stone-200 sm:grid-cols-2 dark:bg-stone-800">
      <li class="bg-white px-5 py-4 dark:bg-stone-900">
        <span class="font-mono text-[11px] text-accent">01</span>
        <p class="mt-1 text-sm leading-relaxed">在 Agent 開啟和網頁相同的<strong class="font-semibold">「{{ folderName }}」</strong>資料夾（Agent 問路徑時，選取或貼上它）。</p>
      </li>
      <li class="bg-white px-5 py-4 dark:bg-stone-900">
        <span class="font-mono text-[11px] text-accent">02</span>
        <p class="mt-1 text-sm leading-relaxed">複製下面的提示詞，貼給 Agent 開始製作。</p>
        <CopyButton :text="agentPrompt" label="複製提示詞" primary class="mt-3" />
      </li>
    </ol>

    <textarea
      readonly
      rows="10"
      data-testid="agent-prompt"
      :value="agentPrompt"
      aria-label="給 Agent 的提示詞"
      class="block w-full resize-y border-t border-stone-200 bg-stone-50 p-5 font-mono text-xs leading-relaxed text-stone-800 focus:outline-hidden dark:border-stone-800 dark:bg-stone-950/50 dark:text-stone-200"
    ></textarea>
  </section>
</template>
