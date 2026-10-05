// Keeps the last opened project folder handle in IndexedDB, so the next visit only needs the user
// to re-grant permission instead of picking the folder again (SPEC §9.1).

const DB = 'agent-video-producer'
const STORE = 'handles'
const KEY = 'project'

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

export async function saveHandle(handle: FileSystemDirectoryHandle) {
  try {
    await run('readwrite', (s) => s.put(handle, KEY))
  } catch {
    // Private windows may refuse IndexedDB; the app still works for this visit.
  }
}

export async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return ((await run('readonly', (s) => s.get(KEY))) as FileSystemDirectoryHandle | undefined) ?? null
  } catch {
    return null
  }
}

export async function forgetHandle() {
  try {
    await run('readwrite', (s) => s.delete(KEY))
  } catch {
    // ignore
  }
}
