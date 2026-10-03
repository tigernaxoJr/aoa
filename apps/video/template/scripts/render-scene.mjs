// pnpm run render:scene <scene-id>...   → <scene>/output/scene.mp4 (SPEC §7.6)
// Several ids render in parallel, each in its own process (--jobs N, default from the CPU count);
// each render shoots frames in several browsers (--pages N, the CPU budget left per scene).
// Writes files only; the agent records status via `pnpm run state` (SPEC §7.3).
// The previous output is replaced only when the new render succeeds.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { availableParallelism, freemem } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, run } from './lib/cli.mjs'
import { normalizeVideo, probeDuration } from './lib/media.mjs'
import { DEFAULTS, UsageError, findRoot, findSceneRef, loadProject, readJson, resolveProjectPath, sceneFile } from './lib/project.mjs'
import { renderHtml } from './lib/render-html.mjs'
import { buildPlan, videoLayers } from './lib/scene-plan.mjs'
import { serveProject } from './lib/serve.mjs'
import { toAss } from './lib/timeline.mjs'

run(async (argv) => {
  const { positional, flags } = parseArgs(argv, { jobs: 1, pages: 1 })
  if (!positional.length) throw new UsageError('usage: render:scene <scene-id>... [--jobs N] [--pages N]')
  const root = findRoot()
  const project = loadProject(root)
  for (const id of positional) findSceneRef(project, id) // unknown ids fail before anything starts
  const ids = [...new Set(positional)]
  const jobs = Math.min(count(flags, 'jobs', budget()), ids.length)
  // Scenes rendering side by side share the budget; four browsers already use most of it.
  const pages = count(flags, 'pages', Math.max(1, Math.min(4, Math.floor(budget() / jobs))))
  if (ids.length === 1) return renderOne(root, project, ids[0], pages)
  return renderMany(ids, jobs, pages)
})

function count(flags, name, fallback) {
  if (flags[name] === undefined) return fallback
  const n = Number(flags[name])
  if (!Number.isInteger(n) || n < 1) throw new UsageError(`--${name} expects a positive whole number`)
  return n
}

/**
 * Browsers to run at once: half the cores (more adds little: each browser and x264 already use
 * several threads), and about 1 GB of free memory each.
 */
function budget() {
  return Math.max(1, Math.min(Math.floor(availableParallelism() / 2), Math.floor(freemem() / 2 ** 30)))
}

/** Renders each id in a child process, `jobs` at a time. Returns 1 when any of them failed. */
async function renderMany(ids, jobs, pages) {
  console.log(`rendering ${ids.length} scenes, ${jobs} at a time`)
  const failed = []
  const queue = [...ids]
  const worker = async () => {
    for (let id; (id = queue.shift()); ) {
      const code = await new Promise((resolve) => {
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), id, '--pages', String(pages)], { stdio: 'inherit', windowsHide: true })
        child.on('error', () => resolve(1))
        child.on('close', resolve)
      })
      if (code !== 0) failed.push(id)
    }
  }
  await Promise.all(Array.from({ length: jobs }, worker))
  const ok = ids.filter((id) => !failed.includes(id))
  console.log(`rendered: ${ok.join(', ') || 'none'}${failed.length ? `; failed: ${failed.join(', ')}` : ''}`)
  return failed.length ? 1 : 0
}

async function renderOne(root, project, id, pages) {
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
  const progress = (msg) => log(`${id}: ${msg.trim()}`)
  log(`${id}: ${plan.frames} frames @ ${plan.fps} fps (${plan.durationSec.toFixed(2)}s)`)

  // Every video layer becomes an exact-length, constant-fps clip before the renderer sees it.
  for (const [i, layer] of videoLayers(plan).entries()) {
    layer.clip = join(work, `clip-${i}.mp4`)
    const frames = Math.max(1, Math.round((layer.span ?? plan.durationSec) * plan.fps))
    normalizeVideo(layer.file, { trimStart: layer.trimStart, trimEnd: layer.trimEnd, fps: plan.fps, frames }, layer.clip)
  }

  // captions.mode burn: the scene's captions are drawn into its video here, not at assemble.
  const { captions = {}, format } = project.project
  const captionsFile = join(sceneDir, DEFAULTS.captionsFile)
  let subtitles = null
  if (captions.mode === 'burn' && existsSync(captionsFile)) {
    const cues = JSON.parse(readFileSync(captionsFile, 'utf8'))
      .filter((c) => c.start < plan.durationSec)
      .map((c) => ({ ...c, end: Math.min(c.end, plan.durationSec) }))
    subtitles = 'captions.ass'
    writeFileSync(join(work, subtitles), toAss(cues, format, captions.style))
  }

  const server = await serveProject(root)
  try {
    await renderHtml({ root, plan, work, server, out: partial, log: progress, subtitles, pages })
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
}
