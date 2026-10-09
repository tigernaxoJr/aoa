// Reference material the user hands the agent from the web page: documents, images, pasted text.
// Files live in the project's references/ folder; references/index.json keeps the user's note on each
// (what it is, how to use it). The agent reads both and never changes them. Files the agent or the
// user put there by hand count too, with no note.
import { listFiles, removeFile, tryFile, writeFile } from './fsa'

export const REFERENCES_DIR = 'references'
export const REFERENCES_INDEX = `${REFERENCES_DIR}/index.json`

export interface ReferenceEntry {
  /** File name inside references/. */
  name: string
  /** What the user said about it; null when they said nothing. */
  note: string | null
  addedAt: string
}

/** references/index.json */
export interface ReferenceIndex {
  files: ReferenceEntry[]
}

export type ReferenceKind = 'image' | 'document' | 'text' | 'media' | 'other'

export interface ReferenceItem extends ReferenceEntry {
  /** Project-relative path, e.g. references/logo.png. */
  path: string
  size: number
  kind: ReferenceKind
}

const KINDS: [ReferenceKind, RegExp][] = [
  ['image', /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic)$/i],
  ['text', /\.(md|markdown|txt|csv|tsv|json|ya?ml|html?)$/i],
  ['document', /\.(pdf|docx?|pptx?|xlsx?|odt|odp|ods|rtf|key|pages|numbers|epub)$/i],
  ['media', /\.(mp3|wav|m4a|ogg|flac|mp4|mov|webm|mkv)$/i],
]

export const referenceKind = (name: string): ReferenceKind => KINDS.find(([, re]) => re.test(name))?.[0] ?? 'other'

/** A name safe on every OS, keeping the user's words (CJK included); never the index file or hidden. */
export function safeName(name: string): string {
  const cleaned = name
    .normalize('NFC')
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s-]+/, '')
    .replace(/[.\s]+$/, '')
  const base = cleaned || 'reference'
  return base.toLowerCase() === 'index.json' ? `ref-${base}` : base.slice(0, 120)
}

/** `name`, or name-2.ext, name-3.ext… when it is taken. */
function unique(name: string, taken: Set<string>) {
  const at = name.lastIndexOf('.')
  const [stem, ext] = at > 0 ? [name.slice(0, at), name.slice(at)] : [name, '']
  let candidate = name
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem}-${n}${ext}`
  taken.add(candidate.toLowerCase())
  return candidate
}

export async function readReferenceIndex(root: FileSystemDirectoryHandle): Promise<ReferenceIndex> {
  const file = await tryFile(root, REFERENCES_INDEX)
  if (!file) return { files: [] }
  try {
    const doc = JSON.parse(await file.text())
    const files = Array.isArray(doc?.files) ? doc.files : []
    return {
      files: files
        .filter((f: any) => typeof f?.name === 'string')
        .map((f: any) => ({ name: f.name, note: typeof f.note === 'string' && f.note.trim() ? f.note : null, addedAt: typeof f.addedAt === 'string' ? f.addedAt : '' })),
    }
  } catch {
    return { files: [] }
  }
}

async function writeIndex(root: FileSystemDirectoryHandle, index: ReferenceIndex) {
  await writeFile(root, REFERENCES_INDEX, `${JSON.stringify(index, null, 2)}\n`)
}

/** Every file in references/ in the order added, with the user's note when the index has one. */
export async function listReferences(root: FileSystemDirectoryHandle): Promise<ReferenceItem[]> {
  const paths = (await listFiles(root, REFERENCES_DIR)).filter((p) => p !== REFERENCES_INDEX && !p.split('/').some((part) => part.startsWith('.')))
  const index = await readReferenceIndex(root)
  const byName = new Map(index.files.map((f) => [f.name, f]))
  const items = await Promise.all(
    paths.map(async (path): Promise<ReferenceItem | null> => {
      const file = await tryFile(root, path)
      if (!file) return null
      const name = path.slice(REFERENCES_DIR.length + 1)
      const entry = byName.get(name)
      return { name, path, size: file.size, kind: referenceKind(name), note: entry?.note ?? null, addedAt: entry?.addedAt || new Date(file.lastModified).toISOString() }
    }),
  )
  // The order they were added: the index's order, then files put there by hand, oldest first.
  const order = new Map(index.files.map((f, i) => [f.name, i]))
  const rank = (i: ReferenceItem) => order.get(i.name) ?? Infinity
  return items.filter((i): i is ReferenceItem => i !== null).sort((a, b) => rank(a) - rank(b) || a.addedAt.localeCompare(b.addedAt) || a.name.localeCompare(b.name))
}

/** Copies the files into references/ under names not taken yet; returns the names used. */
export async function addReferenceFiles(root: FileSystemDirectoryHandle, files: File[], note: string | null = null): Promise<string[]> {
  const index = await readReferenceIndex(root)
  const taken = new Set((await listFiles(root, REFERENCES_DIR)).map((p) => p.slice(REFERENCES_DIR.length + 1).toLowerCase()))
  taken.add('index.json')
  const now = new Date().toISOString()
  const names: string[] = []
  for (const file of files) {
    const name = unique(safeName(file.name), taken)
    await writeFile(root, `${REFERENCES_DIR}/${name}`, file)
    index.files = index.files.filter((f) => f.name !== name)
    index.files.push({ name, note: note?.trim() || null, addedAt: now })
    names.push(name)
  }
  await writeIndex(root, index)
  return names
}

/** Saves pasted text as references/<title>.md; returns the name used. */
export async function addReferenceText(root: FileSystemDirectoryHandle, title: string, text: string, note: string | null = null): Promise<string> {
  const stem = safeName(title.trim() || `筆記 ${new Date().toLocaleDateString('sv')}`).replace(/\.(md|txt)$/i, '')
  const body = text.endsWith('\n') ? text : `${text}\n`
  const file = new File([body], `${stem}.md`, { type: 'text/markdown' })
  const [name] = await addReferenceFiles(root, [file], note)
  return name
}

export async function setReferenceNote(root: FileSystemDirectoryHandle, name: string, note: string) {
  const index = await readReferenceIndex(root)
  const entry = index.files.find((f) => f.name === name)
  const value = note.trim() || null
  if (entry) entry.note = value
  else index.files.push({ name, note: value, addedAt: new Date().toISOString() })
  await writeIndex(root, index)
}

/** Deletes the file from references/ and its note from the index. */
export async function removeReference(root: FileSystemDirectoryHandle, name: string) {
  await removeFile(root, `${REFERENCES_DIR}/${name}`)
  const index = await readReferenceIndex(root)
  if (!index.files.some((f) => f.name === name)) return
  index.files = index.files.filter((f) => f.name !== name)
  await writeIndex(root, index)
}

/** True for a top-level folder entry the page itself may create before the agent builds the project. */
export const isReferencesEntry = (name: string) => name === REFERENCES_DIR

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** The line a launch message adds when the folder already holds references. */
export function referencesLine(count: number) {
  return `參考資料：我在資料夾的 ${REFERENCES_DIR}/ 放了 ${count} 份參考資料（文件、圖片或文字），每份的用途寫在 ${REFERENCES_INDEX}。請在規劃內容前先讀過，並依我寫的說明使用。`
}

/** What the user tells the agent after adding references to a project already under way. */
export function referencesAddedSay(names: string[], what: string) {
  const list = names.length > 5 ? `${names.slice(0, 5).join('、')} 等 ${names.length} 份` : names.join('、')
  return `我在 ${REFERENCES_DIR}/ 新增了參考資料：${list}。請讀取它們（用途寫在 ${REFERENCES_INDEX}），告訴我你打算怎麼用，確認後再更新${what}。`
}
