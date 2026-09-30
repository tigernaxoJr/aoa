// Scene input hash (SPEC §4.2): changes whenever anything that affects the rendered scene changes.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { resolveProjectPath } from './project.mjs'

/** Fields that describe state rather than content; excluded from the hash. */
const EXCLUDED = new Set(['$schema', 'status', 'render', 'error', 'attempts', 'locked', 'updatedAt', 'updatedBy'])

/** JSON with object keys sorted, so key order never changes the hash. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function listFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath ?? d.path, d.name))
    .sort()
}

/**
 * Hashes: scene content fields, every file under the scene's assets/ directory, the script file,
 * files referenced via `@/` paths, and the project's format + renderer.
 */
export function computeInputHash(root, project, ref, scene) {
  const sceneDir = join(root, ref.dir)
  const h = createHash('sha256')
  const part = (label, data) => {
    h.update(`${label}\0`)
    h.update(data)
    h.update('\0')
  }

  const content = Object.fromEntries(Object.entries(scene).filter(([k]) => !EXCLUDED.has(k)))
  part('scene', canonical(content))
  part('project', canonical({ format: project.project.format, renderer: project.project.renderer }))

  const files = new Set(listFiles(join(sceneDir, 'assets')))
  const referenced = [
    scene.narration?.scriptFile ?? 'script.md',
    scene.visual?.code?.file,
    scene.visual?.asset?.src,
    ...(scene.visual?.elements ?? []).map((el) => el.src),
  ].filter(Boolean)
  for (const p of referenced) files.add(resolveProjectPath(root, sceneDir, p))

  for (const file of [...files].sort()) {
    const label = relative(root, file).split('\\').join('/')
    part(`file:${label}`, existsSync(file) && statSync(file).isFile() ? readFileSync(file) : '<missing>')
  }
  return `sha256:${h.digest('hex')}`
}
