// pnpm run music [--engine auto|fluidsynth|webaudio] [--force] [--stems]
//   → assets/music/bgm.wav (+ song.mid, bgm.json) from project.audio.music (SPEC §7.5).
// fluidsynth renders each part as its own stem (each may use a different SoundFont) and mixes them;
// --stems keeps the stems in assets/music/stems/.
// Skips when the score, engine, fonts and scene alignment are unchanged since the last run (bgm.json).
// Writes files only; to use the music, the agent sets project.audio.bgm via `pnpm run state`.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseArgs, run } from './lib/cli.mjs'
import { ffmpeg, probeDuration, probeVideoDuration } from './lib/media.mjs'
import { MIDI_FILE, MUSIC_DIR, MUSIC_FILE, MUSIC_META, compose, partOf, resolveSections, toMidi } from './lib/music.mjs'
import { PARTS, SAMPLE_RATE, findFluidSynth, renderFluidSynth, renderWebAudio } from './lib/music-engines.mjs'
import { UsageError, findRoot, loadProject } from './lib/project.mjs'
import { inspectScenes } from './lib/status.mjs'
import { layout } from './lib/timeline.mjs'

const ENGINES = ['auto', 'fluidsynth', 'webaudio']
const END_FADE_SEC = 0.3
const STEMS_DIR = `${MUSIC_DIR}/stems`

run(async (argv) => {
  const { flags } = parseArgs(argv, { engine: 1 })
  const root = findRoot()
  const project = loadProject(root)
  const { audio = {} } = project.project
  const music = audio.music
  if (!music) throw new UsageError('project.audio.music is not set; write the score first (Skill rendering-guide.md#music)')

  const wanted = flags.engine ?? music.engine ?? 'auto'
  if (!ENGINES.includes(wanted)) throw new UsageError(`--engine must be one of ${ENGINES.join(', ')}`)
  const fluid = findFluidSynth(music.soundfonts)
  let engine = wanted === 'auto' ? (fluid.missing ? 'webaudio' : 'fluidsynth') : wanted
  if (engine === 'fluidsynth' && fluid.missing) {
    throw new UsageError(`fluidsynth engine needs ${fluid.missing.join(' and ')}; run pnpm run music:setup (ask the user first), or use --engine webaudio`)
  }
  if (wanted === 'auto' && fluid.missing) {
    console.log('note: FluidSynth is not installed, using webaudio (synthesized sound). pnpm run music:setup installs it once per machine for real instrument sounds.')
  }
  if (engine === 'fluidsynth' && fluid.fallbacks.length) {
    console.warn(`warning: SoundFont not installed, using the default instead for ${fluid.fallbacks.join(', ')} (pnpm run music:setup --list)`)
  }
  if (process.env.VIDEO_AGENT_FAKE_MUSIC) engine = 'fake'

  // Sections aligned to scenes need the final timeline, i.e. every scene's rendered length.
  const timeline = sceneTimeline(root, project, music.sections.some((s) => s.scenes))
  const sections = resolveSections(music, { timeline, order: project.scenes.map((s) => s.id) })
  const song = compose(music, sections)
  const parts = PARTS.filter((part) => song.events.some((e) => partOf(e.track) === part))

  const outFile = join(root, MUSIC_FILE)
  const metaFile = join(root, MUSIC_META)
  const fonts = engine === 'fluidsynth' ? Object.fromEntries(parts.map((p) => [p, basename(fluid.fonts[p])])) : null
  const hash = createHash('sha256').update(JSON.stringify({ v: 1, music, engine, fonts, bars: sections.map((s) => s.bars) })).digest('hex')
  const stemsWanted = Boolean(flags.stems) && engine === 'fluidsynth'
  if (!flags.force && existsSync(outFile) && existsSync(metaFile) && JSON.parse(readFileSync(metaFile, 'utf8')).hash === hash && (!stemsWanted || existsSync(join(root, STEMS_DIR)))) {
    console.log(`${MUSIC_FILE} is up to date (${engine}); --force to render again`)
    report(audio, song.duration, timeline)
    return 0
  }

  mkdirSync(join(root, MUSIC_DIR), { recursive: true })
  const work = join(root, '.tmp', 'music')
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  const midiFile = join(root, MIDI_FILE)
  const partial = join(work, 'bgm.wav')
  const gain = (part) => `volume=${(music.mix?.[part] ?? 0).toFixed(2)}dB`
  const tail = `atrim=0:${song.duration.toFixed(3)},afade=t=out:st=${Math.max(0, song.duration - END_FADE_SEC).toFixed(3)}:d=${END_FADE_SEC}`
  // A common loudness, so both engines sit the same under narration and bgmVolume means the same thing.
  const level = 'loudnorm=I=-18:TP=-2:LRA=11'
  const pcm = ['-ar', String(SAMPLE_RATE), '-ac', '2', '-c:a', 'pcm_s16le']
  const t = Date.now()
  try {
    writeFileSync(midiFile, toMidi(song, music.instruments))
    if (engine === 'fluidsynth') {
      // One render per part, each with its own SoundFont, then mixed with the part's gain.
      const stems = parts.map((part) => {
        const mid = join(work, `${part}.mid`)
        const wav = join(work, `${part}.wav`)
        writeFileSync(mid, toMidi(song, music.instruments, part))
        renderFluidSynth(fluid.exe, fluid.fonts[part], mid, wav)
        return { part, wav }
      })
      const inputs = stems.flatMap((s) => ['-i', s.wav])
      const graph = [
        ...stems.map((s, i) => `[${i}:a]${gain(s.part)}[s${i}]`),
        `${stems.map((_, i) => `[s${i}]`).join('')}amix=inputs=${stems.length}:normalize=0,${tail},${level}[out]`,
      ].join(';')
      ffmpeg([...inputs, '-filter_complex', graph, '-map', '[out]', ...pcm, partial])
      if (stemsWanted) {
        const dir = join(root, STEMS_DIR)
        rmSync(dir, { recursive: true, force: true })
        mkdirSync(dir, { recursive: true })
        for (const s of stems) ffmpeg(['-i', s.wav, '-af', `${gain(s.part)},${tail}`, ...pcm, join(dir, `${s.part}.wav`)])
      }
    } else {
      const raw = join(work, 'raw.wav')
      if (engine === 'webaudio') await renderWebAudio(song, { seed: music.seed ?? 1, mix: music.mix ?? {} }, raw)
      else ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=220:duration=${song.duration + 1}`, '-af', 'volume=0.05', raw])
      ffmpeg(['-i', raw, '-af', engine === 'fake' ? tail : `${tail},${level}`, ...pcm, partial])
    }
    renameSync(partial, outFile)
    const meta = {
      hash,
      engine,
      ...(fonts && { soundfonts: fonts }),
      bpm: music.bpm,
      bars: sections.reduce((n, s) => n + s.bars, 0),
      durationSec: Number(song.duration.toFixed(3)),
      generatedAt: new Date().toISOString(),
    }
    writeFileSync(`${metaFile}.tmp`, `${JSON.stringify(meta, null, 2)}
`)
    renameSync(`${metaFile}.tmp`, metaFile)
    const how = fonts ? `fluidsynth (${parts.length} stems: ${[...new Set(Object.values(fonts))].join(', ')})` : engine
    console.log(`music: ${how}, ${meta.bars} bars at ${music.bpm} BPM, ${probeDuration(outFile).toFixed(2)}s → ${MUSIC_FILE} (${Date.now() - t} ms); score as MIDI → ${MIDI_FILE}${stemsWanted ? `; stems → ${STEMS_DIR}/` : ''}`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
  report(audio, song.duration, timeline)
  return 0
})

/** The final timeline (as assemble lays it out) when `needed`; every scene must have its output. */
function sceneTimeline(root, project, needed) {
  const inspected = inspectScenes(root, project)
  const ready = inspected.length > 0 && inspected.every((s) => !s.missing && s.hasOutput)
  if (!ready) {
    if (needed) throw new UsageError('music.sections uses scenes, but not every scene has been rendered yet; render them first, or give the sections bars')
    return null
  }
  const fps = project.project.format.fps
  return layout(
    inspected.map((s) => ({ duration: Math.round(probeVideoDuration(s.output) * fps) / fps, transition: s.scene.visual.transitionIn ?? 'none' })),
    fps,
  )
}

function report(audio, musicSec, timeline) {
  if (timeline && musicSec + 0.5 < timeline.total) {
    console.warn(`warning: the music (${musicSec.toFixed(1)}s) is shorter than the video (${timeline.total.toFixed(1)}s); assemble will loop it. Add bars, or align the last section to the last scene.`)
  }
  if (audio.bgm !== MUSIC_FILE) {
    console.log(`to use it as BGM: pnpm run state project --patch '[{"op":"add","path":"/project/audio/bgm","value":"${MUSIC_FILE}"}]'`)
  }
}
