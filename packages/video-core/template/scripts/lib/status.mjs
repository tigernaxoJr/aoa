// Status rules: allowed transitions come from workflow.json; project status is derived from scenes.
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { deriveStatus } from './core.mjs'
import { computeInputHash } from './hash.mjs'
import { DEFAULTS, loadScenes } from './project.mjs'

export { allowedTransitions, checkTransition } from './core.mjs'

const RENDERED = new Set(['rendered', 'approved'])

/** Per-scene facts used by status reports, derivation and validation. */
export function inspectScenes(root, project, loaded = loadScenes(root, project)) {
  return loaded.map(({ ref, file, scene }) => {
    if (!scene) return { ref, file, scene, missing: true }
    const output = join(root, ref.dir, scene.render?.outputFile ?? DEFAULTS.outputFile)
    const hasOutput = existsSync(output)
    const hadRender = Boolean(scene.render)
    let currentHash = null
    let hashError = null
    if (hadRender) {
      try {
        currentHash = computeInputHash(root, project, ref, scene)
      } catch (err) {
        hashError = err.message
      }
    }
    const outdated = hadRender && currentHash !== scene.render.inputHash
    return {
      ref,
      file,
      scene,
      missing: false,
      output,
      hasOutput,
      outputMtime: hasOutput ? statSync(output).mtimeMs : 0,
      outdated,
      hashError,
      /** Rendered/approved, output present and inputs unchanged since the render. */
      upToDate: RENDERED.has(scene.status) && hasOutput && !outdated,
    }
  })
}

/**
 * Applies workflow.json `derivedProjectStatus` (SPEC §6.1). Returns the derived status, or null
 * when derivation does not apply (no scenes, project failed, or still before storyboard).
 */
export function deriveProjectStatus(root, project, inspected = inspectScenes(root, project)) {
  const final = join(root, DEFAULTS.finalFile)
  const facts = inspected.map((s) => (s.missing ? null : { status: s.scene.status, upToDate: s.upToDate, outputMtime: s.outputMtime }))
  return deriveStatus(project.status, facts, existsSync(final) ? statSync(final).mtimeMs : 0)
}
