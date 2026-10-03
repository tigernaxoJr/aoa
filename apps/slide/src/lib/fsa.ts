// File System Access API helpers for Slide Studio.
// Standard browser API with graceful fallback.

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

/** Replaces a file's contents safely via atomic temp swap. */
export async function writeText(root: FileSystemDirectoryHandle, path: string, text: string | Uint8Array<ArrayBuffer>) {
  const { dirs, name } = split(path)
  const dir = await dirAt(root, dirs, true)
  const handle = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

/** Project-relative paths of every file under `path` (empty when missing). */
export async function listFiles(root: FileSystemDirectoryHandle, path = ''): Promise<string[]> {
  let dir: FileSystemDirectoryHandle
  try {
    dir = path ? await dirAt(root, path.split('/').filter(Boolean)) : root
  } catch {
    return []
  }
  const out: string[] = []
  const walk = async (d: FileSystemDirectoryHandle, prefix: string) => {
    for await (const [name, handle] of (d as any).entries()) {
      if (handle.kind === 'file') out.push(prefix ? `${prefix}/${name}` : name)
      else await walk(handle as FileSystemDirectoryHandle, prefix ? `${prefix}/${name}` : name)
    }
  }
  await walk(dir, path.replace(/\/+$/, ''))
  return out.sort()
}

export function isSupported() {
  return typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function'
}

/** Prompts for directory access or asks for permission if stored. */
export async function ensurePermission(handle: FileSystemDirectoryHandle, prompt = true): Promise<boolean> {
  const opts = { mode: 'readwrite' as const }
  if (typeof (handle as any).queryPermission !== 'function') return true
  if ((await (handle as any).queryPermission(opts)) === 'granted') return true
  if (!prompt) return false
  return (await (handle as any).requestPermission(opts)) === 'granted'
}
