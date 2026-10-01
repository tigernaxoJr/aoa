// UI write rules (SPEC §9.3, §10.2 item 4). The UI may only change:
//   script.md; scene.json title, visual.description, narration.voice/speed, durationSec, locked,
//   status approved|stale; and the order of video.project.json scenes.
// Every write: refuse while an agent holds the lock, detect conflicts by lastModified, validate
// against the schema, set updatedBy "user", then re-derive the project status.
import { checkTransition, deriveStatus } from '@core'
import type { SceneJson, VideoProjectJson } from '../types/protocol'
import { tryFile, writeText } from './fsa'
import { FINAL_FILE, LOCK_FILE, LOCK_STALE_MS, PROJECT_FILE, type ProjectState, type SceneState, schemaErrors, workflow } from './project'

export class LockedError extends Error {}
export class ConflictError extends Error {}

type Root = FileSystemDirectoryHandle

export async function assertUnlocked(root: Root) {
  const lock = await tryFile(root, LOCK_FILE)
  if (lock && Date.now() - lock.lastModified < LOCK_STALE_MS) {
    throw new LockedError('Agent 正在寫入專案檔，請稍候幾秒再儲存。')
  }
}

/** Writes `text` to `path` unless the file changed since it was read (`expectedMtime`; 0 = must not exist). */
async function guardedWrite(root: Root, path: string, expectedMtime: number, text: string) {
  await assertUnlocked(root)
  const current = await tryFile(root, path)
  if ((current?.lastModified ?? 0) !== expectedMtime) {
    throw new ConflictError(`${path} 在你編輯期間被修改了（可能是 Agent）。已重新載入，請確認後再改一次。`)
  }
  await writeText(root, path, text)
}

const json = (doc: unknown) => `${JSON.stringify(doc, null, 2)}\n`
const now = () => new Date().toISOString()

function assertValid(kind: 'project' | 'scene', doc: unknown) {
  const errors = schemaErrors(kind, doc)
  if (errors.length) throw new Error(`內容不符合格式：${errors.join('；')}`)
}

/** Content edits make a rendered/approved scene stale (SPEC §6.3). Other statuses keep theirs. */
function staleIfRendered(scene: SceneJson) {
  if (scene.status === 'rendered' || scene.status === 'approved') scene.status = 'stale'
}

async function writeScene(root: Root, state: ProjectState, s: SceneState, scene: SceneJson) {
  scene.updatedAt = now()
  scene.updatedBy = 'user'
  assertValid('scene', scene)
  await guardedWrite(root, `${s.dir}/scene.json`, s.sceneMtime, json(scene))
  await rederive(root, state, s.id, scene)
}

/** Recomputes project.status per workflow.json derivedProjectStatus after a scene write. */
async function rederive(root: Root, state: ProjectState, changedId: string, changed: SceneJson) {
  const facts = state.scenes.map((s) => {
    const scene = s.id === changedId ? changed : s.scene
    if (!scene) return null
    // Same definition as SceneState.upToDate, applied to the status being written.
    const upToDate = ['rendered', 'approved'].includes(scene.status) && s.hasOutput && !s.outdated
    return { status: scene.status, upToDate, outputMtime: s.outputMtime }
  })
  const derived = deriveStatus(state.project.status, facts, state.final.mtime)
  if (!derived || derived === state.project.status) return
  const project: VideoProjectJson = { ...state.project, status: derived as VideoProjectJson['status'], updatedAt: now(), updatedBy: 'user' }
  assertValid('project', project)
  await guardedWrite(root, PROJECT_FILE, state.projectMtime, json(project))
}

function sceneOf(state: ProjectState, id: string) {
  const s = state.scenes.find((x) => x.id === id)
  if (!s?.scene) throw new Error(`找不到 scene ${id}`)
  return { s, scene: structuredClone(s.scene) as SceneJson }
}

export async function saveScript(root: Root, state: ProjectState, id: string, text: string) {
  const { s, scene } = sceneOf(state, id)
  await guardedWrite(root, s.scriptPath, s.scriptMtime, text.endsWith('\n') ? text : `${text}\n`)
  if (scene.status === 'rendered' || scene.status === 'approved') {
    staleIfRendered(scene)
    await writeScene(root, state, s, scene)
  }
}

export interface SceneEdit {
  title?: string
  description?: string
  voice?: string | null
  speed?: number | null
  durationSec?: number | null
}

export async function saveSceneFields(root: Root, state: ProjectState, id: string, edit: SceneEdit) {
  const { s, scene } = sceneOf(state, id)
  const before = JSON.stringify(scene)
  if (edit.title !== undefined) scene.title = edit.title
  if (edit.description !== undefined) scene.visual.description = edit.description
  if (edit.voice !== undefined) {
    if (edit.voice) scene.narration.voice = edit.voice
    else delete scene.narration.voice
  }
  if (edit.speed !== undefined) {
    if (edit.speed === null || edit.speed === 1) delete scene.narration.speed
    else scene.narration.speed = edit.speed
  }
  if (edit.durationSec !== undefined) scene.durationSec = edit.durationSec
  if (JSON.stringify(scene) === before) return
  staleIfRendered(scene)
  await writeScene(root, state, s, scene)
}

export async function setLocked(root: Root, state: ProjectState, id: string, locked: boolean) {
  const { s, scene } = sceneOf(state, id)
  scene.locked = locked
  await writeScene(root, state, s, scene)
}

export async function approve(root: Root, state: ProjectState, id: string) {
  const { s, scene } = sceneOf(state, id)
  const problem = checkTransition(workflow, 'scene', scene.status, 'approved')
  if (problem) throw new Error('只有已渲染（rendered）的 scene 可以核准。')
  if (s.outdated) throw new Error('這個 scene 的內容在渲染後改過了，請先重新產生再核准。')
  scene.status = 'approved'
  await writeScene(root, state, s, scene)
}

/** Marks a rendered/approved scene stale without editing it (e.g. "please redo this one"). */
export async function markStale(root: Root, state: ProjectState, id: string) {
  const { s, scene } = sceneOf(state, id)
  if (checkTransition(workflow, 'scene', scene.status, 'stale')) throw new Error('只有已渲染或已核准的 scene 可以標記為需要重做。')
  scene.status = 'stale'
  await writeScene(root, state, s, scene)
}

/**
 * Reorders scenes. Order only affects assembling (SPEC §9.3); a completed project goes back to
 * ready_to_assemble because output/final.mp4 no longer matches the order.
 */
export async function reorder(root: Root, state: ProjectState, ids: string[]) {
  const byId = new Map(state.project.scenes.map((r) => [r.id, r]))
  if (ids.length !== byId.size || ids.some((id) => !byId.has(id))) throw new Error('排序內容與專案不一致，請重新載入。')
  const project: VideoProjectJson = { ...state.project, scenes: ids.map((id) => byId.get(id)!), updatedAt: now(), updatedBy: 'user' }
  if (project.status === 'completed') project.status = 'ready_to_assemble'
  assertValid('project', project)
  await guardedWrite(root, PROJECT_FILE, state.projectMtime, json(project))
}

export { FINAL_FILE }
