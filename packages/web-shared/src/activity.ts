// How fresh an agent's activity (*.activity.json) is. An agent that stopped mid-step never clears its
// message, so an old "working" message is shown as the last thing it did, not as current work.
// Each app passes in the ref its store loads the activity file into.
import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'

/** A working message older than this is shown as history. */
export const ACTIVITY_STALE_MS = 10 * 60_000

/** The fields every app's activity document shares. */
export interface ActivityDoc {
  updatedAt: string
  waitingForUser?: boolean
}

const now = ref(Date.now())
let users = 0
let timer: ReturnType<typeof setInterval> | undefined

export function ago(ms: number): string {
  const sec = Math.floor(ms / 1000)
  if (sec < 30) return '剛剛'
  const min = Math.floor(ms / 60_000)
  if (min < 1) return `${sec} 秒前`
  if (min < 60) return `${min} 分鐘前`
  const hours = Math.floor(min / 60)
  return hours < 24 ? `${hours} 小時前` : `${Math.floor(hours / 24)} 天前`
}

/** The activity with a human-readable age and whether it still describes current work. */
export function useActivity<T extends ActivityDoc>(source: Readonly<Ref<T | null>>) {
  if (users++ === 0) timer = setInterval(() => (now.value = Date.now()), 10_000)
  // The clock ticks slowly; a new message is aged against the time it was read, not the last tick.
  watch(source, () => (now.value = Date.now()))
  onScopeDispose(() => {
    if (--users === 0) clearInterval(timer)
  })
  return computed(() => {
    const doc = source.value
    if (!doc) return null
    const age = Math.max(0, now.value - Date.parse(doc.updatedAt))
    return { ...doc, ago: ago(age), current: !!doc.waitingForUser || age < ACTIVITY_STALE_MS }
  })
}
