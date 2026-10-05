// Reads a product's source folder the user picked, to prefill the guided start. Browsers never
// reveal a folder's full path, so the user pastes it; when they don't, the agent finds the folder by
// name and checks candidates against the hints (package name, git remote, top-level entries).
import { tryFile } from '@aoa/web-shared/fsa'
import type { SourceHints } from './site'

export interface SourceInfo {
  folder: string
  name: string | null
  description: string | null
  homepage: string | null
  hints: SourceHints
}

const MAX_ENTRIES = 30

/** First prose paragraph of a README: skips headings, badges, images, HTML and code. */
export function readmeSummary(text: string): string | null {
  let fenced = false
  const para: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('```')) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const skip = !line || /^(#|!\[|\[!\[|<|>|\||-{3,}|={3,})/.test(line)
    if (skip) {
      if (para.length) break
      continue
    }
    para.push(line)
  }
  const summary = para.join(' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').trim()
  if (!summary) return null
  return summary.length > 200 ? `${summary.slice(0, 199)}…` : summary
}

export async function readSourceFolder(dir: FileSystemDirectoryHandle): Promise<SourceInfo> {
  const info: SourceInfo = { folder: dir.name, name: null, description: null, homepage: null, hints: { packageName: null, gitRemote: null, entries: [] } }
  const pkg = await tryFile(dir, 'package.json')
  if (pkg) {
    try {
      const json = JSON.parse(await pkg.text())
      info.name = typeof json.name === 'string' ? json.name : null
      info.description = typeof json.description === 'string' && json.description.trim() ? json.description.trim() : null
      info.homepage = typeof json.homepage === 'string' && /^https?:\/\//.test(json.homepage) ? json.homepage : null
    } catch {
      // not JSON; ignore
    }
  }
  if (!info.description) {
    for (const name of ['README.md', 'readme.md', 'README.MD', 'README', 'README.txt']) {
      const file = await tryFile(dir, name)
      if (file) {
        info.description = readmeSummary(await file.text())
        break
      }
    }
  }
  info.hints.packageName = info.name
  const git = await tryFile(dir, '.git/config')
  // Drop any user:token@ so credentials never leave the folder.
  if (git) info.hints.gitRemote = (await git.text()).match(/^\s*url\s*=\s*(\S+)/m)?.[1].replace(/\/\/[^@/]+@/, '//') ?? null
  for await (const [name] of dir.entries()) if (!name.startsWith('.')) info.hints.entries.push(name)
  info.hints.entries = info.hints.entries.sort().slice(0, MAX_ENTRIES)
  return info
}

/** How to copy a folder's full path in this OS's file manager. */
export function pathHelp(os: ReturnType<typeof platform>) {
  if (os === 'windows') return '在檔案總管打開該資料夾，點一下上方的網址列，按 Ctrl+C 複製，再到這裡按 Ctrl+V 貼上。'
  if (os === 'mac') return '在 Finder 選取該資料夾，按 Option+Command+C（⌥⌘C）複製路徑，再到這裡按 ⌘V 貼上。'
  return '在檔案管理員打開該資料夾，按 Ctrl+L 顯示路徑後複製，再到這裡貼上。'
}

/** Last folder name of a typed path, for checking it against the picked folder. */
export const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? ''

/** Rough platform guess for terminal instructions. */
export function platform(): 'windows' | 'mac' | 'other' {
  const ua = navigator.userAgent
  if (/Windows/i.test(ua)) return 'windows'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'mac'
  return 'other'
}
