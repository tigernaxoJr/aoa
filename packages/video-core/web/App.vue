<script setup lang="ts">
// The video workbench shared by apps/product and apps/story. Each app mounts it with its start form
// (step 2 of the start page) and any extra tabs beside the scene board (the story's cast studio).
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { portalHome } from '@aoa/web-shared/lang'
import FinalPanel from './components/FinalPanel.vue'
import HomeView from './components/HomeView.vue'
import Icon from './components/Icon.vue'
import SceneBoard from './components/SceneBoard.vue'
import SceneEditor from './components/SceneEditor.vue'
import ProjectSwitcher from './components/ProjectSwitcher.vue'
import WorkflowBar from './components/WorkflowBar.vue'
import ActivityBanner from './components/ActivityBanner.vue'
import AgentSay from './components/AgentSay.vue'
import ReferencesTab from './components/ReferencesTab.vue'
import { VIDEO_KIND, workbenchUrl } from './lib/site'
import type { WorkbenchTab } from './lib/workbench'
import { close, outdated, pickFolder, restore, root, state, switchTo, syncTemplate, ui } from './lib/store'

const props = withDefaults(defineProps<{ sourceForm: Component; tabs?: WorkbenchTab[] }>(), { tabs: () => [] })

const TITLE = VIDEO_KIND === 'story' ? '故事動畫工作台' : '產品介紹影片工作台'
/** The open project is the other kind: it belongs in the other workbench. */
const otherKind = computed(() => {
  const kind = state.value?.project.project.kind === 'story' ? 'story' : 'product'
  return state.value && kind !== VIDEO_KIND ? kind : null
})

const current = ref<string | null>(null)
/** The open editor has edits not saved yet. */
const dirty = ref(false)
const detail = ref<HTMLElement | null>(null)
const activeTab = ref('scenes')
/** The app's own tabs, then the references every project has. */
const allTabs = computed<WorkbenchTab[]>(() => [...props.tabs, { id: 'references', icon: 'paperclip', label: '參考資料', component: ReferencesTab }])
const extraTab = computed(() => allTabs.value.find((t) => t.id === activeTab.value) ?? null)
/** Every tab as shown: the scene board first. */
const tabBar = computed(() => [
  { id: 'scenes', icon: 'film' as const, label: '分鏡故事板', count: state.value?.scenes.length ?? 0, testid: undefined },
  ...allTabs.value.map((t) => ({ id: t.id, icon: t.icon, label: t.label, count: state.value && t.count ? t.count(state.value) : null, testid: `tab-${t.id}` })),
])

/** The scene in the detail pane (null: the full video). Leaving unsaved edits asks first. */
const selected = computed<string | null>({
  get: () => current.value,
  set(id) {
    if (id === current.value) return
    if (dirty.value && !confirm('這一段有尚未儲存的修改，要放棄嗎？')) return
    dirty.value = false
    current.value = id
    // On a narrow screen the detail pane sits below the list: bring it into view.
    if (id && !matchMedia('(min-width: 1024px)').matches) nextTick(() => detail.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  },
})

function closeProject() {
  if (dirty.value && !confirm('有尚未儲存的修改，仍要關閉專案嗎？')) return
  dirty.value = false
  close()
}

/** Leaving for another project drops unsaved edits: ask first. */
function leave(go: () => void) {
  if (dirty.value && !confirm('有尚未儲存的修改，仍要切換專案嗎？')) return
  go()
}

const warnUnsaved = (e: BeforeUnloadEvent) => {
  if (dirty.value) e.preventDefault()
}
onMounted(() => {
  restore()
  window.addEventListener('beforeunload', warnUnsaved)
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnUnsaved))
// Another project opened: start from its overview (scene ids repeat across projects).
watch(root, () => {
  current.value = null
  dirty.value = false
  activeTab.value = 'scenes'
})
// Drop the selection when that scene leaves the project.
watch(state, (st) => {
  if (current.value && !st?.scenes.some((s) => s.id === current.value)) {
    current.value = null
    dirty.value = false
  }
})
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-stone-200 bg-paper/90 backdrop-blur-sm dark:border-stone-800">
    <div class="mx-auto flex h-14 max-w-7xl items-center gap-2.5 px-4 sm:gap-3 sm:px-6">
      <a :href="portalHome()" class="flex shrink-0 items-baseline gap-2" title="回到 AOA 首頁">
        <span class="font-serif text-lg font-bold tracking-tight">AOA</span>
        <span class="font-mono text-[11px] text-stone-500">/ {{ VIDEO_KIND }}</span>
      </a>
      <span v-if="!state" class="hidden truncate text-sm text-stone-600 sm:inline dark:text-stone-400">{{ TITLE }}</span>
      <template v-if="state">
        <span class="text-stone-300 dark:text-stone-700" aria-hidden="true">/</span>
        <ProjectSwitcher
          :name="state.project.project.name"
          @switch="(h) => leave(() => switchTo(h))"
          @pick="leave(pickFolder)"
          @close="closeProject"
        />
      </template>
      <span class="ml-auto" />
    </div>
  </header>

  <main>
    <HomeView v-if="!state" :source-form="sourceForm" />
    <div v-else-if="otherKind" class="mx-auto max-w-3xl px-4 py-10">
      <div class="callout bg-amber-50 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100" role="status" data-testid="other-kind">
        <Icon name="alert" class="mt-0.5" />
        <div class="min-w-0 flex-1">
          <p>「{{ state.project.project.name }}」是{{ otherKind === 'story' ? '故事動畫' : '產品介紹影片' }}專案，請到{{ otherKind === 'story' ? '故事動畫' : '產品介紹影片' }}工作台開啟。</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <a :href="workbenchUrl(otherKind)" class="btn-primary btn-sm" data-testid="open-other-kind"><Icon name="link" :size="14" />前往{{ otherKind === 'story' ? '故事動畫' : '產品介紹影片' }}工作台</a>
            <button type="button" class="btn-secondary btn-sm" @click="closeProject">選擇其他資料夾</button>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:py-6">
      <div v-if="outdated" class="callout bg-amber-50 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100" role="status" data-testid="template-outdated">
        <Icon name="refresh" class="mt-0.5" />
        <div class="min-w-0 flex-1">
          <p>這個專案的工具（腳本、格式定義）是舊版範本建立的，和網站目前的版本不一致（{{ outdated.paths.length }} 個檔案）。更新後網頁與 Agent 才會用同一套規則；影片內容（分鏡、旁白、素材）不會被覆蓋。</p>
          <button type="button" class="btn-primary btn-sm mt-2" :disabled="ui.saving" data-testid="template-update" @click="syncTemplate">
            <Icon name="refresh" :size="14" />更新專案工具
          </button>
        </div>
      </div>
      <div v-if="ui.needsInstall" class="callout bg-amber-50 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100" role="status" data-testid="needs-install">
        <Icon name="refresh" class="mt-0.5" />
        <div class="min-w-0 flex-1">
          <p>專案工具更新後需要的套件變了，Agent 下次動手前要先安裝。</p>
          <AgentSay command="pnpm install" class="mt-2" />
        </div>
        <button type="button" class="icon-btn -mt-1 -mr-1" aria-label="我已經告訴 Agent 了" title="我已經告訴 Agent 了" @click="ui.needsInstall = false"><Icon name="x" /></button>
      </div>
      <div v-if="state.errors.length" class="callout bg-red-50 text-red-900 dark:bg-red-950/60 dark:text-red-200" role="alert">
        <Icon name="alert" class="mt-0.5" />
        <div class="min-w-0">
          <p>專案檔有問題{{ outdated ? '，請先按上方「更新專案工具」；仍有問題時' : '。' }}</p>
          <AgentSay command="pnpm run validate" class="mt-2" />
          <details class="mt-2 text-xs">
            <summary class="cursor-pointer">錯誤細節（給 Agent 看的）</summary>
            <span v-for="e in state.errors.slice(0, 5)" :key="e" class="mt-1 block font-mono break-all">{{ e }}</span>
          </details>
        </div>
      </div>
      <ActivityBanner />
      <WorkflowBar />

      <!-- Tabs: the scene board, plus the app's own (e.g. the story's cast studio) -->
      <div class="-mx-4 flex items-center gap-1 overflow-x-auto border-b border-stone-200 px-4 sm:mx-0 sm:px-0 dark:border-stone-800" role="tablist">
        <button
          v-for="tab in tabBar"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          class="-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition"
          :class="activeTab === tab.id ? 'border-accent font-semibold text-stone-900 dark:text-white' : 'border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-800 dark:text-stone-400 dark:hover:border-stone-600 dark:hover:text-stone-200'"
          :data-testid="tab.testid"
          @click="activeTab = tab.id"
        >
          <Icon :name="tab.icon" :size="16" />
          <span>{{ tab.label }}</span>
          <span
            v-if="tab.count !== null"
            class="rounded-full px-1.5 text-xs font-medium tabular-nums"
            :class="activeTab === tab.id ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'"
            >{{ tab.count }}</span
          >
        </button>
      </div>

      <div v-if="extraTab">
        <component :is="extraTab.component" />
      </div>

      <!-- Default Scenes Board View -->
      <div v-else class="grid items-start gap-4 lg:grid-cols-[minmax(320px,2fr)_3fr]">
        <div class="lg:sticky lg:top-18 lg:max-h-[calc(100vh-5.5rem)] lg:overflow-y-auto lg:rounded-md">
          <SceneBoard v-model:selected="selected" />
        </div>
        <div ref="detail" class="scroll-mt-18">
          <SceneEditor v-if="selected" :id="selected" v-model:dirty="dirty" @close="selected = null" @go="selected = $event" />
          <FinalPanel v-else @select="selected = $event" />
        </div>
      </div>
    </div>
  </main>

  <div class="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end">
    <div
      v-if="ui.notice"
      class="pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-md px-4 py-3 text-sm shadow-lg"
      :class="{
        'bg-emerald-700 text-white': ui.notice.kind === 'ok',
        'bg-amber-400 text-stone-950': ui.notice.kind === 'warn',
        'bg-red-700 text-white': ui.notice.kind === 'error',
      }"
      role="status"
      data-testid="notice"
    >
      <Icon :name="ui.notice.kind === 'ok' ? 'check' : 'alert'" class="mt-0.5" />
      <span class="min-w-0">{{ ui.notice.text }}</span>
    </div>
  </div>
</template>
