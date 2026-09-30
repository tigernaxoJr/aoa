// Status rules: allowed transitions come from workflow.json; project status is derived from scenes.
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { computeInputHash } from './hash.mjs'
import { DEFAULTS, loadScenes } from './project.mjs'

/**
 * Builds { project: Map<to, Set<from>|'any'>, scene: ... } from every transition in workflow.json.
 * A transition without `from` may be entered from any status.
 */
export function allowedTransitions(workflow) {
  const allowed = { project: new Map(), scene: new Map() }
  for (const step of [...workflow.steps, ...workflow.operations]) {
    for (const action of step.actions) {
      for (const t of action.transitions ?? []) {
        const map = allowed[t.target]
        if (!t.from) map.set(t.to, 'any')
        else if (map.get(t.to) !== 'any') map.set(t.to, new Set([...(map.get(t.to) ?? []), ...t.from]))
      }
    }
  }
  return allowed
}

/** Returns an error message when `from → to` is not a transition defined in workflow.json. */
export function checkTransition(workflow, target, from, to) {
  if (from === to) return null
  const froms = allowedTransitions(workflow)[target].get(to)
  if (froms === 'any' || froms?.has(from)) return null
  const options = froms ? [...froms].join(', ') : 'nowhere'
  return `${target} status ${from} → ${to} is not allowed by workflow.json (${to} is reachable from: ${options})`
}

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
  if (project.scenes.length === 0) return null
  if (['failed', 'initialized', 'analyzed'].includes(project.status)) return null
  if (inspected.length && inspected.every((s) => s.upToDate)) {
    const final = join(root, DEFAULTS.finalFile)
    const finalMtime = existsSync(final) ? statSync(final).mtimeMs : 0
    const newest = Math.max(...inspected.map((s) => s.outputMtime))
    return finalMtime > newest ? 'completed' : 'ready_to_assemble'
  }
  if (inspected.some((s) => s.scene && s.scene.status !== 'draft')) return 'producing'
  return 'script_generated'
}
