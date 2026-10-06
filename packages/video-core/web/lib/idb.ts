// Keeps recently opened project folder handles in IndexedDB, so the next visit only needs the user
// to re-grant permission instead of picking the folder again (SPEC §9.1). Shared by both video
// workbenches (same origin); each shows only its own kind.

const DB = 'agent-video-producer'
const STORE = 'handles'
/** Before the recent list: the single last-opened handle. Read once and folded into RECENT. */
const LEGACY_KEY = 'project'
const RECENT = 'recent'
const MAX_RECENT = 6

export interface RecentFolder {
  handle: FileSystemDirectoryHandle
  /** The project's name; null while the folder waits for the agent to create the project. */
  projectName: string | null
  /** project.kind; null when unknown (no project yet). */
  kind: string | null
  openedAt: number
  /** Reopened by itself on the next visit (cleared by "close project"). */
  last: boolean
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

/** Most recent first. Private windows may refuse IndexedDB: then there is simply no history. */
export async function loadRecent(): Promise<RecentFolder[]> {
  try {
    const list = (await run('readonly', (s) => s.get(RECENT))) as RecentFolder[] | undefined
    if (list) return list
    const legacy = (await run('readonly', (s) => s.get(LEGACY_KEY))) as FileSystemDirectoryHandle | undefined
    return legacy ? [{ handle: legacy, projectName: null, kind: null, openedAt: Date.now(), last: true }] : []
  } catch {
    return []
  }
}

async function saveRecent(list: RecentFolder[]) {
  try {
    await run('readwrite', (s) => s.put(list.slice(0, MAX_RECENT), RECENT))
    await run('readwrite', (s) => s.delete(LEGACY_KEY))
  } catch {
    // The app still works for this visit.
  }
}

async function indexOf(list: RecentFolder[], handle: FileSystemDirectoryHandle) {
  for (const [i, r] of list.entries()) if (await r.handle.isSameEntry(handle).catch(() => false)) return i
  return -1
}

/** Records `handle` as the folder open now: first in the list and the one reopened next visit. */
export async function rememberFolder(handle: FileSystemDirectoryHandle, project: { projectName: string | null; kind: string | null }) {
  const list = await loadRecent()
  const at = await indexOf(list, handle)
  if (at >= 0) list.splice(at, 1)
  for (const r of list) r.last = false
  await saveRecent([{ handle, ...project, openedAt: Date.now(), last: true }, ...list])
}

/** The open project was closed: keep it in the list, but do not reopen it by itself. */
export async function forgetLast() {
  const list = await loadRecent()
  if (!list.some((r) => r.last)) return
  for (const r of list) r.last = false
  await saveRecent(list)
}

export async function removeFolder(handle: FileSystemDirectoryHandle) {
  const list = await loadRecent()
  const at = await indexOf(list, handle)
  if (at < 0) return
  list.splice(at, 1)
  await saveRecent(list)
}
