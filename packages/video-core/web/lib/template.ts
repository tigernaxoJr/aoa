// Updates an existing project's tools (scripts, schemas, AGENTS.md…) to this site's template, the
// same sync the Skill does (SKILL「既有專案：同步範本」): compare each template file with the
// manifest, write the differing ones from the hash-checked zip, never touching video content.
import { unzipSync } from 'fflate'
import type { VideoProjectJson } from '../types/protocol'
import { readText, tryFile, writeText } from '@aoa/web-shared/fsa'
import { PROJECT_FILE, dropUnknownFields } from './project'
import { TEMPLATE, api } from './site'
import { assertUnlocked } from './writes'

interface Manifest {
  specVersion: string
  zip: { sha256: string }
  files: { path: string; sha256: string }[]
}

export interface TemplateDiff {
  manifest: Manifest
  /** Template files missing or different in the project folder. */
  paths: string[]
}

async function sha256(data: BufferSource) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Null when the project matches this site's template, or the manifest is unavailable (e.g. dev server). */
export async function templateDiff(root: FileSystemDirectoryHandle): Promise<TemplateDiff | null> {
  let manifest: Manifest
  try {
    const res = await fetch(api(`templates/${TEMPLATE}/manifest.json`), { cache: 'no-cache' })
    if (!res.ok) return null
    manifest = await res.json()
  } catch {
    return null
  }
  const paths: string[] = []
  for (const f of manifest.files) {
    if (f.path === PROJECT_FILE) continue
    const file = await tryFile(root, f.path)
    if (!file || (await sha256(await file.arrayBuffer())) !== f.sha256) paths.push(f.path)
  }
  return paths.length ? { manifest, paths } : null
}

/**
 * Writes the differing template files, then moves the project data to the new schema: drops fields
 * it no longer has and sets specVersion. Returns what still needs the agent (pnpm install).
 */
export async function updateTemplate(root: FileSystemDirectoryHandle, diff: TemplateDiff) {
  await assertUnlocked(root)
  const res = await fetch(api(`templates/${TEMPLATE}.zip`), { cache: 'no-cache' })
  if (!res.ok) throw new Error(`下載範本失敗（HTTP ${res.status}）`)
  const zip = new Uint8Array(await res.arrayBuffer())
  if ((await sha256(zip)) !== diff.manifest.zip.sha256) throw new Error('下載的範本雜湊不符，已停止更新。請重新整理網頁再試一次。')
  const files = unzipSync(zip)
  for (const path of diff.paths) if (files[path]) await writeText(root, path, files[path] as Uint8Array<ArrayBuffer>)

  const dropped: string[] = []
  const project = JSON.parse(await readText(root, PROJECT_FILE)) as VideoProjectJson
  const projectDropped = dropUnknownFields('project', project as unknown as Record<string, unknown>)
  dropped.push(...projectDropped.map((p) => `${PROJECT_FILE}${p}`))
  if (projectDropped.length || project.specVersion !== diff.manifest.specVersion) {
    project.specVersion = diff.manifest.specVersion
    project.updatedAt = new Date().toISOString()
    project.updatedBy = 'user'
    await writeText(root, PROJECT_FILE, `${JSON.stringify(project, null, 2)}\n`)
  }
  for (const ref of project.scenes ?? []) {
    const path = `${ref.dir}/scene.json`
    const text = await tryFile(root, path).then((f) => f?.text())
    if (!text) continue
    const scene = JSON.parse(text)
    const sceneDropped = dropUnknownFields('scene', scene)
    if (!sceneDropped.length) continue
    dropped.push(...sceneDropped.map((p) => `${path}${p}`))
    await writeText(root, path, `${JSON.stringify(scene, null, 2)}\n`)
  }
  return { dropped, needsInstall: diff.paths.includes('package.json') }
}
