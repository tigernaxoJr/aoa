<script setup lang="ts">
import { companion, connect, forget, hasPairing } from '../lib/companion'
import { reload } from '../lib/store'
</script>

<template>
  <div class="flex shrink-0 items-center gap-2 text-xs" data-testid="companion-status">
    <template v-if="companion.state === 'ready'">
      <span class="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
      <span class="hidden sm:inline">本機助手已連線</span>
      <button type="button" class="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" title="中斷配對" @click="forget">中斷</button>
    </template>
    <template v-else-if="companion.state === 'connecting'">
      <span class="h-2 w-2 animate-pulse rounded-full bg-amber-400" aria-hidden="true" />
      <span class="hidden sm:inline">連線中…</span>
    </template>
    <template v-else-if="companion.state === 'error'">
      <span class="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
      <button v-if="hasPairing()" type="button" class="text-slate-500 underline hover:text-slate-800 dark:hover:text-slate-200" :title="companion.error ?? ''" @click="connect(undefined, reload)">重新連線本機助手</button>
      <span v-else class="text-slate-500" :title="companion.error ?? ''">本機助手未連線</span>
    </template>
  </div>
</template>
