<script setup lang="ts">
// The workbench's references tab: what the user hands the agent beyond the form (documents, images, text).
import ReferencesPanel from '@aoa/web-shared/ReferencesPanel.vue'
import { VIDEO_KIND } from '../lib/site'
import { root } from '../lib/store'
</script>

<template>
  <div class="card max-w-3xl p-5">
    <h2 class="font-semibold">參考資料</h2>
    <ReferencesPanel
      class="mt-3"
      :root="root"
      :ask="VIDEO_KIND === 'story' ? '故事與分鏡' : '影片內容'"
      intro="想讓 Agent 參考的文件、圖片或文字放在這裡（存進專案資料夾的 references/）。加入後把下方那句話交給 Agent，它會讀過、說明打算怎麼用，再修改影片。"
    />
  </div>
</template>
