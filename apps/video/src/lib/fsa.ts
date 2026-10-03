// File System Access API helpers (SPEC §9.1). Paths are project-relative with forward slashes.
// Works with any FileSystemDirectoryHandle: a folder the user picked, or OPFS in tests.

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

export async function readText(root: FileSystemDirectoryHandle, path: string) {
  return (await fileAt(root, path)).text()
}

/** Replaces a file's contents. createWritable() writes to a temporary file and swaps it in on close. */
export async function writeText(root: FileSystemDirectoryHandle, path: string, text: string | Uint8Array<ArrayBuffer>) {
  const { dirs, name } = split(path)
  const dir = await dirAt(root, dirs, true)
  const handle = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

/** Project-relative paths of every file under `path` (empty when the directory is missing). */
export async function listFiles(root: FileSystemDirectoryHandle, path: string): Promise<string[]> {
  let dir: FileSystemDirectoryHandle
  try {
    dir = await dirAt(root, path.split('/').filter(Boolean))
  } catch {
    return []
  }
  const out: string[] = []
  const walk = async (d: FileSystemDirectoryHandle, prefix: string) => {
    for await (const [name, handle] of d.entries()) {
      if (handle.kind === 'file') out.push(`${prefix}/${name}`)
      else await walk(handle as FileSystemDirectoryHandle, `${prefix}/${name}`)
    }
  }
  await walk(dir, path.replace(/\/+$/, ''))
  return out.sort()
}

export function isSupported() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

/** Asks for read/write permission on a stored handle; returns false when the user declines. */
export async function ensurePermission(handle: FileSystemDirectoryHandle, prompt: boolean) {
  const opts = { mode: 'readwrite' as const }
  if (typeof handle.queryPermission !== 'function') return true // OPFS handles are always granted
  if ((await handle.queryPermission(opts)) === 'granted') return true
  if (!prompt) return false
  return (await handle.requestPermission(opts)) === 'granted'
}
