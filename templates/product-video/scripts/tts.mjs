// npm run tts -- <scene-id>          → <scene>/assets/narration.mp3 + assets/captions.json
// npm run tts -- --list-voices       → voices of the project's provider
// Writes files only; the agent records status via `npm run state` (SPEC §7.3).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs, run } from './lib/cli.mjs'
import { ffmpeg, probeDuration } from './lib/media.mjs'
import { blockCues, parseScript } from './lib/narration.mjs'
import { DEFAULTS, UsageError, findRoot, findSceneRef, loadProject, readJson, resolveProjectPath, sceneFile } from './lib/project.mjs'
import { ONLINE_PROVIDERS, getProvider } from './lib/tts-providers.mjs'

/** Offline stand-in for tests and dry runs (VIDEO_AGENT_FAKE_TTS=1): a quiet tone, 0.25 s per character. */
const fakeProvider = {
  async synthesize({ text, workDir }) {
    const file = join(workDir, 'fake.wav')
    const sec = Math.max(0.5, text.replace(/\s+/g, '').length * 0.25)
    ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=440:duration=${sec}`, '-af', 'volume=0.05', file])
    return { file, words: null }
  },
}

run(async (argv) => {
  const { positional, flags } = parseArgs(argv)
  const root = findRoot()
  const project = loadProject(root)
  const settings = project.project.tts

  if (flags['list-voices']) {
    const provider = getProvider(settings.provider)
    if (!provider.listVoices) throw new UsageError(`${settings.provider} cannot list voices`)
    for (const line of await provider.listVoices()) console.log(line)
    return 0
  }

  const [id] = positional
  if (!id) throw new UsageError('usage: tts <scene-id> | --list-voices')
  const ref = findSceneRef(project, id)
  const scene = readJson(sceneFile(root, ref))
  const sceneDir = join(root, ref.dir)
  const narration = scene.narration
  const providerName = process.env.VIDEO_AGENT_FAKE_TTS ? 'fake' : (narration.provider ?? settings.provider)
  const voice = narration.voice ?? settings.voice
  const speed = narration.speed ?? 1
  const audioFile = resolveProjectPath(root, sceneDir, narration.audioFile ?? DEFAULTS.audioFile)
  const captionsFile = join(sceneDir, DEFAULTS.captionsFile)
  const script = readFileSync(resolveProjectPath(root, sceneDir, narration.scriptFile), 'utf8')
  const blocks = parseScript(script)
  mkdirSync(join(sceneDir, 'assets'), { recursive: true })

  if (!blocks.some((b) => b.type === 'text')) {
    writeFileSync(captionsFile, '[]\n')
    rmSync(audioFile, { force: true })
    console.log(`${id}: no narration; durationSec must be set in scene.json`)
    return 0
  }

  if (providerName === 'manual') {
    if (!existsSync(audioFile)) throw new UsageError(`manual narration: record ${ref.dir}/${narration.audioFile ?? DEFAULTS.audioFile} first`)
    const duration = probeDuration(audioFile)
    const lines = blocks.filter((b) => b.type === 'text').flatMap((b) => b.lines)
    writeCaptions(captionsFile, blockCues(lines, duration))
    console.log(`${id}: manual narration ${duration.toFixed(2)}s, captions estimated from text length`)
    return 0
  }

  if (ONLINE_PROVIDERS.has(providerName) && !settings.consent?.onlineTts) {
    throw new UsageError(
      `gate onlineTtsConsent: ${providerName} sends the narration text to an online service. ` +
        'Ask the user, then record consent in project.tts.consent, or switch to piper, system or manual.',
    )
  }
  if (!voice && !['fake', 'system'].includes(providerName)) throw new UsageError(`no voice set for ${id} (narration.voice or project.tts.voice)`)

  const provider = providerName === 'fake' ? fakeProvider : getProvider(providerName)
  const work = mkdtempSync(join(tmpdir(), 'avp-tts-'))
  try {
    // Synthesize each text block, render pauses as silence, normalize everything to the same WAV format.
    const parts = []
    const cues = []
    let offset = 0
    for (const [i, block] of blocks.entries()) {
      const part = join(work, `part-${String(i).padStart(3, '0')}.wav`)
      if (block.type === 'pause') {
        ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(block.sec), part])
      } else {
        const blockDir = join(work, `block-${i}`)
        mkdirSync(blockDir)
        const { file, words } = await provider.synthesize({ text: block.lines.join('\n'), voice, speed, workDir: blockDir })
        ffmpeg(['-i', file, '-ar', '48000', '-ac', '1', part])
        const duration = probeDuration(part)
        for (const cue of blockCues(block.lines, duration, words)) {
          cues.push({ start: round(cue.start + offset), end: round(cue.end + offset), text: cue.text })
        }
      }
      offset += probeDuration(part)
      parts.push(part)
    }
    const list = join(work, 'parts.txt')
    writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'))
    ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'libmp3lame', '-b:a', '128k', audioFile])
    writeCaptions(captionsFile, cues)
    console.log(`${id}: ${providerName} narration ${probeDuration(audioFile).toFixed(2)}s, ${cues.length} caption(s)`)
    return 0
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
})

function writeCaptions(file, cues) {
  writeFileSync(file, JSON.stringify(cues, null, 2) + '\n')
}

const round = (n) => Math.round(n * 1000) / 1000
