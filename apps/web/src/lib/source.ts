// Reads a product's source folder the user picked, to prefill the guided start. Browsers never
// reveal a folder's full path, so the launch command refers to it by name (./<folder>) and the guide
// tells the user to open the terminal in the folder that contains it.
import { tryFile } from './fsa'

export interface SourceInfo {
  folder: string
  name: string | null
  description: string | null
  homepage: string | null
}

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
  const info: SourceInfo = { folder: dir.name, name: null, description: null, homepage: null }
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
  return info
}

/** Rough platform guess for terminal instructions. */
export function platform(): 'windows' | 'mac' | 'other' {
  const ua = navigator.userAgent
  if (/Windows/i.test(ua)) return 'windows'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'mac'
  return 'other'
}
