// Whole-project validation: JSON Schema plus the cross-file rules Schema cannot express (SPEC §4.2.1).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NIL_UUID, PROJECT_FILE, UsageError, readJson, resolveProjectPath, sceneFile, scenePaths } from './project.mjs'
import { loadSchemas, schemaErrors } from './schema.mjs'
import { parseScript } from './narration.mjs'
import { inspectScenes } from './status.mjs'

const RATIOS = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5 }
/** The story template ships no capture script, so its projects cannot record web pages. */
const HAS_CAPTURE = existsSync(fileURLToPath(new URL('../capture.mjs', import.meta.url)))
const CAPTURED = ['web-capture', 'screenshot']

/**
 * Validates the project on disk. `overrides` maps absolute file paths to in-memory documents,
 * so a pending write can be checked before it is committed.
 * Returns { errors, warnings, project, inspected }; `inspected` is null when the project is too
 * broken to inspect scenes.
 */
export function validateProject(root, overrides = new Map()) {
  const schemas = loadSchemas(root)
  const read = (file) => (overrides.has(file) ? overrides.get(file) : readJson(file))
  const errors = []
  const warnings = []

  const projectPath = join(root, PROJECT_FILE)
  const project = read(projectPath)
  for (const e of schemaErrors(schemas.project, project)) errors.push(`${PROJECT_FILE}: ${e}`)
  if (errors.length) return { errors, warnings, project, inspected: null }

  const p = project.project
  if (p.id === NIL_UUID) errors.push(`${PROJECT_FILE}: project.id is the template placeholder; initialize the project first (product-video Skill, or agent-guide.md on the site)`)
  const { aspectRatio, width, height } = p.format
  if (Math.abs(width / height - RATIOS[aspectRatio]) / RATIOS[aspectRatio] > 0.005) {
    errors.push(`${PROJECT_FILE}: format ${width}x${height} does not match aspectRatio ${aspectRatio}`)
  }
  if (p.audio?.bgm) {
    try {
      if (!existsSync(resolveProjectPath(root, root, p.audio.bgm))) {
        warnings.push(`${PROJECT_FILE}: audio.bgm ${p.audio.bgm} not found; BGM will be skipped`)
      }
    } catch (err) {
      errors.push(`${PROJECT_FILE}: audio.bgm ${err.message}`)
    }
  }

  const castNames = new Set()
  const castIds = new Set()
  for (const member of p.cast ?? []) {
    if (castIds.has(member.id)) errors.push(`${PROJECT_FILE}: duplicate cast id ${member.id}`)
    if (castNames.has(member.name)) errors.push(`${PROJECT_FILE}: duplicate cast name ${member.name}`)
    castIds.add(member.id)
    castNames.add(member.name)
    if (member.art) {
      try {
        if (!existsSync(resolveProjectPath(root, root, member.art))) warnings.push(`${PROJECT_FILE}: cast ${member.id} art ${member.art} not found`)
      } catch (err) {
        errors.push(`${PROJECT_FILE}: cast ${member.id} art ${err.message}`)
      }
    }
  }

  const seenIds = new Set()
  const seenDirs = new Set()
  const loaded = []
  for (const ref of project.scenes) {
    const label = `${ref.dir}/scene.json`
    if (seenIds.has(ref.id)) errors.push(`${PROJECT_FILE}: duplicate scene id ${ref.id}`)
    if (seenDirs.has(ref.dir)) errors.push(`${PROJECT_FILE}: duplicate scene dir ${ref.dir}`)
    seenIds.add(ref.id)
    seenDirs.add(ref.dir)

    const file = sceneFile(root, ref)
    if (!overrides.has(file) && !existsSync(file)) {
      errors.push(`${label}: missing`)
      continue
    }
    const scene = read(file)
    const schemaErrs = schemaErrors(schemas.scene, scene)
    for (const e of schemaErrs) errors.push(`${label}: ${e}`)
    if (schemaErrs.length) continue
    if (scene.id !== ref.id) errors.push(`${label}: id ${scene.id} does not match ${PROJECT_FILE} entry ${ref.id}`)
    loaded.push({ ref, file, scene })
    if (!HAS_CAPTURE && CAPTURED.includes(scene.visual.type)) {
      errors.push(`${label}: visual.type ${scene.visual.type} needs pnpm run capture, which this project's template (story-video) does not have; use a motion-graphic, or make product videos from the product-video template`)
    }

    const sceneDir = join(root, ref.dir)
    for (const [field, stored] of scenePaths(scene)) {
      try {
        resolveProjectPath(root, sceneDir, stored)
      } catch (err) {
        errors.push(`${label}: ${field} ${err.message}`)
      }
    }
    const scriptPath = join(sceneDir, scene.narration.scriptFile)
    const script = existsSync(scriptPath) ? readFileSync(scriptPath, 'utf8') : null
    if (script === null) {
      errors.push(`${label}: script file ${scene.narration.scriptFile} not found`)
    } else if (!narrationText(script) && scene.durationSec === null) {
      errors.push(`${label}: script is empty, so durationSec must be set`)
    } else {
      const unknown = new Set(parseScript(script).filter((b) => b.speaker && !castNames.has(b.speaker)).map((b) => b.speaker))
      for (const name of unknown) errors.push(`${label}: 【${name}】 is not in project.cast; add the character or fix the name`)
    }
    for (const used of scene.visual.motion?.uses ?? []) {
      try {
        if (!existsSync(resolveProjectPath(root, sceneDir, used))) errors.push(`${label}: visual.motion.uses ${used} not found`)
      } catch {
        // reported by the scenePaths check above
      }
    }
  }
  if (errors.length) return { errors, warnings, project, inspected: null }

  const inspected = inspectScenes(root, project, loaded)
  for (const s of inspected) {
    const label = `${s.ref.dir}/scene.json`
    if (['rendered', 'approved'].includes(s.scene.status) && !s.hasOutput) {
      errors.push(`${label}: status is ${s.scene.status} but ${s.scene.render.outputFile} does not exist`)
    }
    if (s.hashError) errors.push(`${label}: cannot compute input hash: ${s.hashError}`)
    else if (s.outdated && ['rendered', 'approved'].includes(s.scene.status)) {
      const lock = s.scene.locked ? ' (locked: ask the user before re-rendering)' : ''
      warnings.push(`${label}: inputs changed since last render; run /video-sync${lock}`)
    }
  }
  return { errors, warnings, project, inspected }
}

/** Narration text with pause markers and blank lines removed. */
export function narrationText(script) {
  return script
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
}

export function assertValid(result) {
  if (result.errors.length) {
    throw new UsageError(`validation failed:\n${result.errors.map((e) => `  - ${e}`).join('\n')}`)
  }
}
