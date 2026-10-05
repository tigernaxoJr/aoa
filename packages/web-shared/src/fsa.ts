// File System Access API helpers shared by every app. Paths are project-relative with forward slashes.
// Works with any FileSystemDirectoryHandle: a folder the user picked, or OPFS in tests.

// File System Access API pieces not yet in TypeScript's DOM lib.
declare global {
  interface FileSystemHandle {
    queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
    requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  }
  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>
  }
  interface Window {
    showDirectoryPicker?(options?: { mode?: 'read' | 'readwrite'; id?: string }): Promise<FileSystemDirectoryHandle>
  }
}

export class NotFound extends Error {}

async function dirAt(root: FileSystemDirectoryHandle, parts: string[], create = false) {
  let dir = root
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create })
  return dir
}

function split(path: string) {
  const parts = path.split('/').filter(Boolean)
  if (parts.some((p) => p === '..')) throw new Error(`path leaves the project: ${path}`)
  return { dirs: parts.slice(0, -1), name: parts.at(-1)! }
}

export async function fileAt(root: FileSystemDirectoryHandle, path: string): Promise<File> {
  const { dirs, name } = split(path)
  try {
    const dir = await dirAt(root, dirs)
    return await (await dir.getFileHandle(name)).getFile()
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'NotFoundError' || err.name === 'TypeMismatchError')) {
      throw new NotFound(path)
    }
    throw err
  }
}

/** The file, or null when it does not exist. */
export async function tryFile(root: FileSystemDirectoryHandle, path: string): Promise<File | null> {
  try {
    return await fileAt(root, path)
  } catch (err) {
    if (err instanceof NotFound) return null
    throw err
  }
}

export async function readText(root: FileSystemDirectoryHandle, path: string): Promise<string> {
  return (await fileAt(root, path)).text()
}

/** Replaces a file's contents with text, binary buffer, or Blob. */
export async function writeFile(root: FileSystemDirectoryHandle, path: string, data: Blob | BufferSource | string) {
  const { dirs, name } = split(path)
  const dir = await dirAt(root, dirs, true)
  const handle = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(data)
  await writable.close()
}

/** Replaces a file's contents with text or Uint8Array. */
export async function writeText(root: FileSystemDirectoryHandle, path: string, text: string | Uint8Array<ArrayBuffer>) {
  return writeFile(root, path, text)
}

/**
 * Project-relative paths of every file under `path` (the whole project when empty), sorted.
 * Empty when the directory is missing.
 */
export async function listFiles(root: FileSystemDirectoryHandle, path = ''): Promise<string[]> {
  const base = path.split('/').filter(Boolean)
  let dir: FileSystemDirectoryHandle
  try {
    dir = await dirAt(root, base)
  } catch {
    return []
  }
  const out: string[] = []
  const walk = async (d: FileSystemDirectoryHandle, prefix: string) => {
    for await (const [name, handle] of d.entries()) {
      const rel = prefix ? `${prefix}/${name}` : name
      if (handle.kind === 'file') out.push(rel)
      else await walk(handle as FileSystemDirectoryHandle, rel)
    }
  }
  await walk(dir, base.join('/'))
  return out.sort()
}

export function isSupported() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

/** Asks for read/write permission on a stored handle; returns false when the user declines. */
export async function ensurePermission(handle: FileSystemDirectoryHandle, prompt: boolean): Promise<boolean> {
  const opts = { mode: 'readwrite' as const }
  if (typeof handle.queryPermission !== 'function') return true // OPFS handles are always granted
  if ((await handle.queryPermission(opts)) === 'granted') return true
  if (!prompt) return false
  return (await handle.requestPermission(opts)) === 'granted'
}
