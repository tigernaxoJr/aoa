// Reads a video project through a directory handle: JSON + schema validation, scripts, outputs,
// the lock file, and each scene's current input hash (same algorithm as scripts/lib/hash.mjs).
import { MISSING, deriveStatus, hashFiles, hashParts, hashedDirs, projectRelative, scriptSpeakers, suggestNext } from '@core'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import commonSchema from '@specs/common.schema.json'
import projectSchema from '@specs/project.schema.json'
import sceneSchema from '@specs/scene.schema.json'
import activitySchema from '@specs/activity.schema.json'
import workflowJson from '@workflow'
import type { SceneJson, VideoActivityJson, VideoProjectJson } from '../types/protocol'
import { listFiles, readText, tryFile } from '@aoa/web-shared/fsa'
import { START_FILE } from './site'

export const PROJECT_FILE = 'video.project.json'
export const LOCK_FILE = '.video-agent.lock'
/** What the agent is doing; written only by the agent, possibly before the project exists (SPEC §9.2). */
export const ACTIVITY_FILE = 'video.activity.json'
export const FINAL_FILE = 'output/final.mp4'
/** A lock older than this is a leftover from a crashed writer (SPEC §10.2). */
export const LOCK_STALE_MS = 30_000
export const workflow = workflowJson

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
ajv.addSchema(commonSchema)
const validators = { project: ajv.compile(projectSchema), scene: ajv.compile(sceneSchema), activity: ajv.compile(activitySchema) }

export function schemaErrors(kind: 'project' | 'scene' | 'activity', doc: unknown): string[] {
  const validate = validators[kind]
  if (validate(doc)) return []
  return (validate.errors ?? []).map((e) => {
    const where = e.instancePath || '/'
    const extra = e.params?.additionalProperty ?? e.params?.unevaluatedProperty
    return extra ? `${where} has unknown field "${extra}"` : `${where} ${e.message}`
  })
}

/**
 * Removes fields the current schema does not know (left by an older template, e.g. project.renderer)
 * and returns their paths. Keeps the document untouched unless that alone makes it valid, so real
 * errors are left for the agent to fix.
 */
export function dropUnknownFields(kind: 'project' | 'scene', doc: Record<string, unknown>): string[] {
  const validate = validators[kind]
  if (validate(doc)) return []
  const unknown = (validate.errors ?? []).flatMap((e) => {
    const field = e.params?.additionalProperty ?? e.params?.unevaluatedProperty
    return field ? [{ at: e.instancePath, field: String(field) }] : []
  })
  const copy = structuredClone(doc)
  for (const { at, field } of unknown) {
    const parent = at
      .split('/')
      .slice(1)
      .reduce<any>((o, k) => o?.[k.replaceAll('~1', '/').replaceAll('~0', '~')], copy)
    if (parent && typeof parent === 'object') delete parent[field]
  }
  if (!unknown.length || !validate(copy)) return []
  for (const k of Object.keys(doc)) delete doc[k]
  Object.assign(doc, copy)
  return unknown.map(({ at, field }) => `${at}/${field}`)
}

export interface SceneState {
  id: string
  dir: string
  scene: SceneJson | null
  sceneMtime: number
  scriptPath: string
  script: string | null
  scriptMtime: number
  outputPath: string
  outputMtime: number
  hasOutput: boolean
  currentHash: string | null
  /** Rendered before, and inputs changed since. */
  outdated: boolean
  /** Rendered/approved, output present, inputs unchanged. */
  upToDate: boolean
  errors: string[]
}

export interface ProjectState {
  project: VideoProjectJson
  projectMtime: number
  scenes: SceneState[]
  final: { exists: boolean; mtime: number }
  lock: { active: boolean; writer: string | null }
  errors: string[]
  derivedStatus: string | null
  next: { command: string | null; reason: string }
}

const join = (dir: string, p: string) => (p.startsWith('@/') ? p.slice(2) : `${dir}/${p}`)

// Hash cache: key = scene JSON + (path, size, mtime) of every hashed file; value = hash.
const hashCache = new Map<string, string>()

async function sha256Hex(chunks: Uint8Array[]) {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const all = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.length
  }
  const digest = await crypto.subtle.digest('SHA-256', all)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function inputHash(root: FileSystemDirectoryHandle, project: VideoProjectJson, dir: string, scene: SceneJson) {
  const assets = (await Promise.all(hashedDirs(dir, scene).map((d) => listFiles(root, d)))).flat()
  const files = hashFiles(dir, scene, assets)
  const found = await Promise.all(files.map((f) => tryFile(root, f)))
  const key = JSON.stringify([scene, project.project.format, project.project.captions, project.project.cast, files.map((f, i) => [f, found[i]?.size, found[i]?.lastModified])])
  const cached = hashCache.get(key)
  if (cached) return cached
  const scriptFile = found[files.indexOf(projectRelative(dir, scene.narration.scriptFile) ?? '')]
  const speakers = scriptFile ? scriptSpeakers(await scriptFile.text()) : []
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  for (const part of hashParts(project, scene, files, speakers)) {
    let data: Uint8Array
    if (part.file === undefined) data = enc.encode(part.text)
    else {
      const file = found[files.indexOf(part.file)]
      data = file ? new Uint8Array(await file.arrayBuffer()) : enc.encode(MISSING)
    }
    chunks.push(enc.encode(`${part.label}\0`), data, enc.encode('\0'))
  }
  const hash = `sha256:${await sha256Hex(chunks)}`
  hashCache.set(key, hash)
  return hash
}

async function loadScene(root: FileSystemDirectoryHandle, project: VideoProjectJson, ref: { id: string; dir: string }): Promise<SceneState> {
  const state: SceneState = {
    id: ref.id,
    dir: ref.dir,
    scene: null,
    sceneMtime: 0,
    scriptPath: `${ref.dir}/script.md`,
    script: null,
    scriptMtime: 0,
    outputPath: `${ref.dir}/output/scene.mp4`,
    outputMtime: 0,
    hasOutput: false,
    currentHash: null,
    outdated: false,
    upToDate: false,
    errors: [],
  }
  const file = await tryFile(root, `${ref.dir}/scene.json`)
  if (!file) {
    state.errors.push(`${ref.dir}/scene.json: missing`)
    return state
  }
  state.sceneMtime = file.lastModified
  let scene: SceneJson
  try {
    scene = JSON.parse(await file.text())
  } catch (err) {
    state.errors.push(`${ref.dir}/scene.json: ${(err as Error).message}`)
    return state
  }
  state.scene = scene
  state.errors.push(...schemaErrors('scene', scene).map((e) => `${ref.dir}/scene.json: ${e}`))
  if (scene.id !== ref.id) state.errors.push(`${ref.dir}/scene.json: id ${scene.id} does not match ${ref.id}`)

  state.scriptPath = join(ref.dir, scene.narration?.scriptFile ?? 'script.md')
  const script = await tryFile(root, state.scriptPath)
  if (script) {
    state.script = await script.text()
    state.scriptMtime = script.lastModified
  }
  state.outputPath = join(ref.dir, scene.render?.outputFile ?? 'output/scene.mp4')
  const output = await tryFile(root, state.outputPath)
  state.hasOutput = Boolean(output)
  state.outputMtime = output?.lastModified ?? 0
  if (scene.render && state.errors.length === 0) {
    state.currentHash = await inputHash(root, project, ref.dir, scene)
    state.outdated = state.currentHash !== scene.render.inputHash
  }
  state.upToDate = ['rendered', 'approved'].includes(scene.status) && state.hasOutput && !state.outdated
  return state
}

/** Files an OS drops into any folder; they don't make a folder unusable for a new project. */
const IGNORABLE = /^(\..*|desktop\.ini|Thumbs\.db)$/i

/** True when a folder without a project holds only the start and activity files (or nothing), so a project can be built in it. */
export async function readyForNewProject(root: FileSystemDirectoryHandle) {
  for await (const [name] of root.entries()) if (name !== START_FILE && name !== ACTIVITY_FILE && !IGNORABLE.test(name)) return false
  return true
}

export const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/** Null when the folder has no project yet (the agent has not run init). */
export async function loadProject(root: FileSystemDirectoryHandle): Promise<ProjectState | null> {
  const file = await tryFile(root, PROJECT_FILE)
  if (!file) return null
  const project = JSON.parse(await file.text()) as VideoProjectJson
  // The unzipped template ships with a placeholder id; treat it as still being initialized by the agent.
  if (project.project?.id === NIL_UUID) return null

  const startFile = await tryFile(root, START_FILE)
  if (startFile) {
    try {
      const startData = JSON.parse(await startFile.text())
      if (startData.kind && !project.project.kind) {
        project.project.kind = startData.kind
      }
    } catch {}
  }

  const errors = schemaErrors('project', project).map((e) => `${PROJECT_FILE}: ${e}`)
  const scenes = errors.length ? [] : await Promise.all(project.scenes.map((ref) => loadScene(root, project, ref)))
  for (const s of scenes) errors.push(...s.errors)

  const final = await tryFile(root, FINAL_FILE)
  const lockFile = await tryFile(root, LOCK_FILE)
  let writer: string | null = null
  if (lockFile) {
    try {
      writer = JSON.parse(await lockFile.text()).writer ?? null
    } catch {
      // partially written lock; still treat it as held
    }
  }
  const facts = scenes.map((s) => (s.scene ? { status: s.scene.status, upToDate: s.upToDate, outputMtime: s.outputMtime } : null))
  return {
    project,
    projectMtime: file.lastModified,
    scenes,
    final: { exists: Boolean(final), mtime: final?.lastModified ?? 0 },
    lock: { active: Boolean(lockFile && Date.now() - lockFile.lastModified < LOCK_STALE_MS), writer },
    errors,
    derivedStatus: errors.length ? null : deriveStatus(project.status, facts, final?.lastModified ?? 0),
    next: suggestNext(
      project,
      scenes.map((s) => ({ id: s.id, status: s.scene?.status ?? 'missing', outdated: s.outdated, locked: Boolean(s.scene?.locked), error: s.scene?.error?.message ?? null })),
      errors,
    ),
  }
}

/** The agent's activity, or null when there is none or it is unreadable (a half-written file shows nothing rather than an error). */
export async function loadActivity(root: FileSystemDirectoryHandle): Promise<VideoActivityJson | null> {
  const file = await tryFile(root, ACTIVITY_FILE)
  if (!file) return null
  try {
    const doc = JSON.parse(await file.text())
    return schemaErrors('activity', doc).length ? null : doc
  } catch {
    return null
  }
}

/**
 * Cheap change detector for polling (SPEC §9.1): lastModified of every file the UI shows.
 * A different fingerprint means something changed on disk and the project should be reloaded.
 */
export async function fingerprint(root: FileSystemDirectoryHandle, state: ProjectState | null): Promise<string> {
  const paths = [PROJECT_FILE, LOCK_FILE, FINAL_FILE, ACTIVITY_FILE]
  for (const s of state?.scenes ?? []) paths.push(`${s.dir}/scene.json`, s.scriptPath, s.outputPath)
  const dirs = new Set((state?.scenes ?? []).flatMap((s) => hashedDirs(s.dir, s.scene ?? {})))
  const assets = await Promise.all([...dirs].map((d) => listFiles(root, d)))
  paths.push(...assets.flat())
  const files = await Promise.all(paths.map((p) => tryFile(root, p)))
  return paths.map((p, i) => `${p}:${files[i]?.lastModified ?? '-'}:${files[i]?.size ?? '-'}`).join('|')
}

export { readText }
