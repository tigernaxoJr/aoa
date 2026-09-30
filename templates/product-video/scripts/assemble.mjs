// npm run assemble   → output/final.mp4 (+ output/final.srt unless captions.mode is none)
// Joins scene outputs in video.project.json order with transitions, merges captions, mixes BGM.
// Writes files only; the agent records status via `npm run state` (SPEC §7.3).
// The previous final.mp4 / final.srt are replaced only when the new assemble succeeds.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseArgs, run } from './lib/cli.mjs'
import { AUDIO_ENCODE, VIDEO_ENCODE, ffmpeg, probeDuration, probeVideoDuration } from './lib/media.mjs'
import { DEFAULTS, UsageError, findRoot, loadProject, resolveProjectPath } from './lib/project.mjs'
import { inspectScenes } from './lib/status.mjs'
import { filterGraph, layout, mergeCaptions, toAss, toSrt } from './lib/timeline.mjs'

run(async (argv) => {
  parseArgs(argv)
  const root = findRoot()
  const project = loadProject(root)
  const { format, renderer, rendererLicense, captions = {}, audio = {} } = project.project
  if (renderer === 'remotion' && !rendererLicense?.acknowledged) {
    throw new UsageError(
      'gate rendererLicense: Remotion needs a license check before assembling. Ask the user, record it in ' +
        'project.rendererLicense, or switch project.renderer to html-capture.',
    )
  }
  if (project.scenes.length === 0) throw new UsageError('video.project.json lists no scenes')

  // Every scene must be rendered/approved, have its output, and be unchanged since it was rendered.
  const inspected = inspectScenes(root, project)
  const notReady = inspected.filter((s) => !s.upToDate)
  if (notReady.length) {
    const why = (s) =>
      s.missing ? 'scene.json missing'
        : !['rendered', 'approved'].includes(s.scene.status) ? `status ${s.scene.status}`
        : !s.hasOutput ? 'output missing'
        : 'inputs changed since render'
    throw new UsageError(
      `not ready to assemble; redo these scenes first (npm run status):\n${notReady.map((s) => `  - ${s.ref.id}: ${why(s)}`).join('\n')}`,
    )
  }

  const warnings = []
  const clips = inspected.map((s) => ({
    file: s.output,
    duration: Math.round(probeVideoDuration(s.output) * format.fps) / format.fps,
    transition: s.scene.visual.transitionIn ?? 'none',
  }))
  const timeline = layout(clips, format.fps)

  const mode = captions.mode ?? 'srt'
  const cues = mergeCaptions(
    timeline,
    inspected.map((s) => {
      const file = join(root, s.ref.dir, DEFAULTS.captionsFile)
      if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
      if (mode !== 'none') warnings.push(`${s.ref.id}: no ${DEFAULTS.captionsFile}; run npm run tts -- ${s.ref.id} to get captions`)
      return []
    }),
  )

  let bgm = null
  if (audio.bgm) {
    const file = resolveProjectPath(root, root, audio.bgm)
    if (existsSync(file)) bgm = { file, volume: audio.bgmVolume ?? 0.25, ducking: audio.ducking ?? true }
    else warnings.push(`audio.bgm ${audio.bgm} not found; assembling without background music`)
  }

  const work = join(root, '.tmp', 'assemble')
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  const outDir = join(root, 'output')
  mkdirSync(outDir, { recursive: true })
  const finalFile = join(root, DEFAULTS.finalFile)
  const partial = finalFile.replace(/\.mp4$/, '.partial.mp4')

  try {
    const burn = mode === 'burn' ? 'captions.ass' : null
    if (burn) writeFileSync(join(work, burn), toAss(cues, format, captions.style))
    const graph = filterGraph(timeline, { fps: format.fps, bgm, burn })
    const inputs = clips.flatMap((c) => ['-i', c.file])
    if (bgm) inputs.push('-stream_loop', '-1', '-i', bgm.file)
    console.log(`assembling ${clips.length} scene(s), ${timeline.total.toFixed(2)}s${bgm ? ', with BGM' : ''}${burn ? ', burning captions' : ''}`)
    ffmpeg(
      [...inputs, '-filter_complex', graph, '-map', '[vout]', '-map', '[aout]', ...VIDEO_ENCODE, '-r', String(format.fps), ...AUDIO_ENCODE, '-movflags', '+faststart', '-t', timeline.total.toFixed(3), partial],
      { cwd: work },
    )
    renameSync(partial, finalFile)
    if (mode !== 'none') {
      const srt = join(outDir, 'final.srt')
      writeFileSync(`${srt}.tmp`, toSrt(cues))
      renameSync(`${srt}.tmp`, srt)
    }
  } catch (err) {
    rmSync(partial, { force: true })
    throw err
  } finally {
    rmSync(work, { recursive: true, force: true })
  }

  for (const w of warnings) console.warn(`warning: ${w}`)
  const rel = (p) => relative(root, p).split('\\').join('/')
  console.log(`assembled ${rel(finalFile)} (${probeDuration(finalFile).toFixed(2)}s)${mode !== 'none' ? `, ${cues.length} caption(s) → output/final.srt` : ''}`)
  return 0
})
