// npm run render:scene -- <scene-id>   → <scene>/output/scene.mp4 with the project's renderer (SPEC §7.6)
// Writes files only; the agent records status via `npm run state` (SPEC §7.3).
// The previous output is replaced only when the new render succeeds.
import { mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { parseArgs, run } from './lib/cli.mjs'
import { normalizeVideo, probeDuration } from './lib/media.mjs'
import { DEFAULTS, UsageError, findRoot, findSceneRef, loadProject, readJson, resolveProjectPath, sceneFile } from './lib/project.mjs'
import { renderHtml } from './lib/render-html.mjs'
import { renderRemotion } from './lib/render-remotion.mjs'
import { buildPlan, videoLayers } from './lib/scene-plan.mjs'
import { serveProject } from './lib/serve.mjs'

run(async (argv) => {
  const { positional } = parseArgs(argv)
  const [id] = positional
  if (!id) throw new UsageError('usage: render:scene <scene-id>')
  const root = findRoot()
  const project = loadProject(root)
  const { renderer, rendererLicense } = project.project
  if (renderer === 'remotion' && !rendererLicense?.acknowledged) {
    throw new UsageError(
      'gate rendererLicense: Remotion needs a license check before rendering. Ask the user, record it in ' +
        'project.rendererLicense, or switch project.renderer to html-capture.',
    )
  }
  const ref = findSceneRef(project, id)
  const scene = readJson(sceneFile(root, ref))
  const sceneDir = join(root, ref.dir)
  const { plan, warnings } = buildPlan(root, project, ref, scene)
  for (const w of warnings) console.warn(`warning: ${id}: ${w}`)

  const outFile = resolveProjectPath(root, sceneDir, scene.render?.outputFile ?? DEFAULTS.outputFile)
  const partial = outFile.replace(/(\.mp4)?$/i, '.partial.mp4')
  const work = join(root, '.tmp', `render-${id}`)
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  mkdirSync(dirname(outFile), { recursive: true })
  const log = (msg) => console.log(msg)
  log(`${id}: ${renderer}, ${plan.frames} frames @ ${plan.fps} fps (${plan.durationSec.toFixed(2)}s)`)

  // Every video layer becomes an exact-length, constant-fps clip before either renderer sees it.
  for (const [i, layer] of videoLayers(plan).entries()) {
    layer.clip = join(work, `clip-${i}.mp4`)
    const frames = Math.max(1, Math.round((layer.span ?? plan.durationSec) * plan.fps))
    normalizeVideo(layer.file, { trimStart: layer.trimStart, trimEnd: layer.trimEnd, fps: plan.fps, frames }, layer.clip)
  }

  const server = await serveProject(root)
  try {
    const render = renderer === 'html-capture' ? renderHtml : renderRemotion
    await render({ root, plan, work, server, out: partial, log })
    renameSync(partial, outFile)
  } catch (err) {
    rmSync(partial, { force: true })
    throw err
  } finally {
    await server.close()
    rmSync(work, { recursive: true, force: true })
  }

  const actual = probeDuration(outFile)
  log(`${id}: rendered ${relative(root, outFile).split('\\').join('/')} (${actual.toFixed(2)}s)`)
  return 0
})
