// Keeps recently opened project folder handles in IndexedDB, so the next visit only needs the user
// to re-grant permission instead of picking the folder again, and the open project can be switched
// from a list. Each app passes its own database name; the list lives in one record of that database.

const STORE = 'handles'
const RECENT = 'recent'

export interface RecentFolder {
  handle: FileSystemDirectoryHandle
  /** The project's name; null while the folder waits for the agent to create the project. */
  projectName: string | null
  /** What kind of project the folder holds; null when unknown (no project yet). */
  kind: string | null
  openedAt: number
  /** The folder open now, reopened by itself on the next visit (cleared by "close project"). */
  last: boolean
}

export interface RecentOptions {
  /** IndexedDB database name; keep it stable, or the stored folders are lost. */
  db: string
  max?: number
  /** Key an older version stored a single last-opened handle under; read once and folded into the list. */
  legacyKey?: string
}

export function recentFolders({ db, max = 8, legacyKey }: RecentOptions) {
  function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(db, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const conn = await open()
    try {
      return await new Promise<T>((resolve, reject) => {
        const req = fn(conn.transaction(STORE, mode).objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    } finally {
      conn.close()
    }
  }

  /** Most recent first. Private windows may refuse IndexedDB: then there is simply no history. */
  async function load(): Promise<RecentFolder[]> {
    try {
      const list = (await run('readonly', (s) => s.get(RECENT))) as RecentFolder[] | undefined
      if (list) return list
      if (!legacyKey) return []
      const legacy = (await run('readonly', (s) => s.get(legacyKey))) as FileSystemDirectoryHandle | undefined
      return legacy ? [{ handle: legacy, projectName: null, kind: null, openedAt: Date.now(), last: true }] : []
    } catch {
      return []
    }
  }

  async function save(list: RecentFolder[]) {
    try {
      await run('readwrite', (s) => s.put(list.slice(0, max), RECENT))
      if (legacyKey) await run('readwrite', (s) => s.delete(legacyKey))
    } catch {
      // The app still works for this visit.
    }
  }

  async function indexOf(list: RecentFolder[], handle: FileSystemDirectoryHandle) {
    for (const [i, r] of list.entries()) if (await r.handle.isSameEntry(handle).catch(() => false)) return i
    return -1
  }

  return {
    load,
    /** Records `handle` as the folder open now: first in the list and the one reopened next visit. */
    async remember(handle: FileSystemDirectoryHandle, project: { projectName: string | null; kind: string | null }) {
      const list = await load()
      const at = await indexOf(list, handle)
      if (at >= 0) list.splice(at, 1)
      for (const r of list) r.last = false
      await save([{ handle, ...project, openedAt: Date.now(), last: true }, ...list])
    },
    /** The open project was closed: keep it in the list, but do not reopen it by itself. */
    async forgetLast() {
      const list = await load()
      if (!list.some((r) => r.last)) return
      for (const r of list) r.last = false
      await save(list)
    },
    async remove(handle: FileSystemDirectoryHandle) {
      const list = await load()
      const at = await indexOf(list, handle)
      if (at < 0) return
      list.splice(at, 1)
      await save(list)
    },
  }
}
