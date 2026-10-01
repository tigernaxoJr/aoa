// Scene input hash (SPEC §4.2): changes whenever anything that affects the rendered scene changes.
// What is hashed comes from core.mjs, so the Web UI computes the same hash in the browser.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { MISSING, hashFiles, hashParts, hashedDirs, projectRelative, referencedPaths, scriptSpeakers } from './core.mjs'
import { resolveProjectPath } from './project.mjs'

const toPosix = (p) => p.split('\\').join('/')

function listFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath ?? d.path, d.name))
}

/**
 * Hashes: scene content fields, every file under the scene's assets/ directory and the folders in
 * `motion.uses`, the script file, files referenced by the scene (including `@/` paths), and the
 * project's format (plus burned-caption settings and the cast's voices when present).
 */
export function computeInputHash(root, project, ref, scene) {
  const sceneDir = join(root, ref.dir)
  // Referenced paths must stay inside the project; this throws like every other path check.
  for (const p of referencedPaths(scene)) resolveProjectPath(root, sceneDir, p)
  const dir = toPosix(ref.dir)
  const assets = hashedDirs(dir, scene).flatMap((d) => listFiles(join(root, d))).map((f) => toPosix(relative(root, f)))
  const script = join(root, projectRelative(dir, scene.narration?.scriptFile ?? 'script.md') ?? '')
  const speakers = existsSync(script) && statSync(script).isFile() ? scriptSpeakers(readFileSync(script, 'utf8')) : []
  const h = createHash('sha256')
  for (const part of hashParts(project, scene, hashFiles(dir, scene, assets), speakers)) {
    let data = part.text
    if (part.file !== undefined) {
      const file = join(root, part.file)
      data = existsSync(file) && statSync(file).isFile() ? readFileSync(file) : MISSING
    }
    h.update(`${part.label}\0`).update(data).update('\0')
  }
  return `sha256:${h.digest('hex')}`
}
