<script setup lang="ts">
import { companion, connect, forget, hasPairing } from '../lib/companion'
import { reload } from '../lib/store'
</script>

<template>
  <div v-if="companion.state !== 'off'" class="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 py-1 pr-1 pl-2.5 text-xs dark:border-slate-700" data-testid="companion-status">
    <template v-if="companion.state === 'ready'">
      <span class="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
      <span class="hidden sm:inline">本機助手已連線</span>
      <button type="button" class="rounded-full px-2 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200" title="中斷配對" @click="forget">中斷</button>
    </template>
    <template v-else-if="companion.state === 'connecting'">
      <span class="h-2 w-2 animate-pulse rounded-full bg-amber-400" aria-hidden="true" />
      <span class="pr-1.5">連線中…</span>
    </template>
    <template v-else-if="companion.state === 'error'">
      <span class="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
      <button v-if="hasPairing()" type="button" class="rounded-full px-2 py-0.5 underline-offset-2 hover:underline" :title="companion.error ?? ''" @click="connect(undefined, reload)">重新連線本機助手</button>
      <span v-else class="pr-1.5 text-slate-500" :title="companion.error ?? ''">本機助手未連線</span>
    </template>
  </div>
</template>
