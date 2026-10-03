<script setup lang="ts">
import { computed } from 'vue'
import { dirHandle, project } from '../lib/store'
import CopyButton from './CopyButton.vue'

const folderName = computed(() => dirHandle.value?.name || '專案資料夾')

const agentPrompt = computed(() => {
  const p = project.value
  const title = p?.title || '新簡報'
  const desc = p?.description || ''
  const pages = p?.pagesCount || 5
  const theme = p?.theme || 'default'

  return `請在此目錄（${folderName.value}）為我製作一份高質感 Slidev 簡報：

【簡報基本資訊】
- 主題：${title}
- 預估頁數：約 ${pages} 頁
- 主題風格：${theme}
${desc ? `- 說明與指引：${desc}` : ''}

【執行規範】
1. 請先檢查目錄內的 \`slide.start.json\` 與 \`slide.project.json\`。
2. 若尚未安裝依賴，請執行 \`pnpm install\`。
3. 遵循 AOFA 簡報工作流程：
   - 階段一：規劃簡報大綱（規劃頁數與各頁核心訊息），更新 \`slide.activity.json\`。
   - 階段二：撰寫 \`slides.md\`，合理配置 Slidev 內建版型（\`cover\`、\`two-cols\`、\`center\`、\`quote\` 等）與 \`<!-- notes -->\` 講者講稿。
   - 階段三：運用前端視覺能力升級版面（內嵌原生向量 SVG 架構/流程圖、運用 Three.js 3D 組件如 \`<ThreeGlobe />\`、加入 \`v-click\` 動效）。
   - 階段四：執行 \`pnpm run export\` 匯出無損向量 PDF 至 \`output/slides.pdf\`，並更新 \`slide.project.json\` 狀態為 \`exported\`。
4. 全程使用繁體中文，追求 Apple/Stripe 等級的乾淨專業視覺。`
})

const exportCommand = 'pnpm run export'
const devCommand = 'pnpm run dev'
const validateCommand = 'node scripts/validate.mjs'
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
