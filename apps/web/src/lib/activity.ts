// How fresh the agent's activity is (SPEC §9.2). An agent that stopped mid-step never clears its
// message, so an old "working" message is shown as the last thing it did, not as current work.
import { computed, onScopeDispose, ref, watch } from 'vue'
import { activity } from './store'

/** A working message older than this is shown as history. */
export const ACTIVITY_STALE_MS = 10 * 60_000

const now = ref(Date.now())
let users = 0
let timer: ReturnType<typeof setInterval> | undefined
// The clock ticks slowly; a new message is aged against the time it was read, not the last tick.
watch(activity, () => (now.value = Date.now()))

export function ago(ms: number) {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return '剛剛'
  if (min < 60) return `${min} 分鐘前`
  const hours = Math.floor(min / 60)
  return hours < 24 ? `${hours} 小時前` : `${Math.floor(hours / 24)} 天前`
}

export function useActivity() {
  if (users++ === 0) timer = setInterval(() => (now.value = Date.now()), 30_000)
  onScopeDispose(() => {
    if (--users === 0) clearInterval(timer)
  })
  return computed(() => {
    const doc = activity.value
    if (!doc) return null
    const age = Math.max(0, now.value - Date.parse(doc.updatedAt))
    return { ...doc, ago: ago(age), current: doc.waitingForUser || age < ACTIVITY_STALE_MS }
  })
}
