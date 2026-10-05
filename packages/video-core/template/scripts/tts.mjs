// pnpm run tts <scene-id>          → <scene>/assets/narration.mp3 + assets/captions.json
// pnpm run tts --list-voices       → voices of the project's provider
// pnpm run tts --sample <cast-id|narrator> [--text "…"]  → brief/voices/<id>.mp3, to let the user hear a voice
// Lines marked 【name】 in script.md use that cast member's provider and voice (story projects).
// Writes files only; the agent records status via `pnpm run state` (SPEC §7.3).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs, run } from './lib/cli.mjs'
import { ffmpeg, probeDuration } from './lib/media.mjs'
import { blockCues, parseScript } from './lib/narration.mjs'
import { DEFAULTS, UsageError, findRoot, findSceneRef, loadProject, readJson, resolveProjectPath, sceneFile } from './lib/project.mjs'
import { ONLINE_PROVIDERS, getProvider } from './lib/tts-providers.mjs'
import { checkAsrConsent, getAsrProvider } from './lib/asr-providers.mjs'
import { diffPronunciation, suggestPatches } from './lib/pronunciation.mjs'

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
  const { positional, flags } = parseArgs(argv, { sample: 1, text: 1, verify: 0, 'no-auto-patch': 0 })
  const root = findRoot()
  const project = loadProject(root)
  const settings = project.project.tts

  if (flags['list-voices']) {
    const provider = getProvider(settings.provider)
    if (!provider.listVoices) throw new UsageError(`${settings.provider} cannot list voices`)
    for (const line of await provider.listVoices()) console.log(line)
    return 0
  }

  if (flags.sample) return sample(root, project, flags.sample, flags.text)

  const [id] = positional
  if (!id) throw new UsageError('usage: tts <scene-id> [--verify] | --list-voices | --sample <cast-id|narrator>')
  const ref = findSceneRef(project, id)
  const scene = readJson(sceneFile(root, ref))
  const sceneDir = join(root, ref.dir)
  const narration = scene.narration
  const narrator = { provider: narration.provider ?? settings.provider, voice: narration.voice ?? settings.voice }
  const providerName = process.env.VIDEO_AGENT_FAKE_TTS ? 'fake' : narrator.provider
  const speed = narration.speed ?? 1
  const audioFile = resolveProjectPath(root, sceneDir, narration.audioFile ?? DEFAULTS.audioFile)
  const captionsFile = join(sceneDir, DEFAULTS.captionsFile)
  const script = readFileSync(resolveProjectPath(root, sceneDir, narration.scriptFile), 'utf8')
  let pronunciation = { ...(settings.pronunciation ?? {}), ...(narration.pronunciation ?? {}) }
  let blocks = parseScript(script, { pronunciation })
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
    const lines = blocks.filter((b) => b.type === 'text').flatMap((b) => b.displayLines ?? b.lines)
    writeCaptions(captionsFile, blockCues(lines, duration))
    console.log(`${id}: manual narration ${duration.toFixed(2)}s, captions estimated from text length`)
    return 0
  }

  const voices = new Map(blocks.filter((b) => b.type === 'text').map((b) => [b.speaker ?? null, voiceFor(project, narrator, b.speaker)]))
  for (const [speaker, v] of voices) checkVoice(settings, v, speaker ? `【${speaker}】 in ${id}` : `${id} (narration.voice or project.tts.voice)`)

  // Synthesizes the scene audio and writes captions
  async function doSynthesis(currentBlocks) {
    const work = mkdtempSync(join(tmpdir(), 'avp-tts-'))
    try {
      const parts = []
      const cues = []
      let offset = 0
      for (const [i, block] of currentBlocks.entries()) {
        const part = join(work, `part-${String(i).padStart(3, '0')}.wav`)
        if (block.type === 'pause') {
          ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(block.sec), part])
        } else {
          const blockDir = join(work, `block-${i}`)
          mkdirSync(blockDir)
          const v = voices.get(block.speaker ?? null)
          const spokenText = (block.spokenLines ?? block.lines).join('\n')
          const { file, words } = await synth(v.provider).synthesize({ text: spokenText, voice: v.voice, speed, workDir: blockDir })
          ffmpeg(['-i', file, '-ar', '48000', '-ac', '1', part])
          const duration = probeDuration(part)
          const displayLines = block.displayLines ?? block.lines
          for (const cue of blockCues(displayLines, duration, words)) {
            cues.push({ start: round(cue.start + offset), end: round(cue.end + offset), text: cue.text, ...(block.speaker && { speaker: block.speaker }) })
          }
        }
        offset += probeDuration(part)
        parts.push(part)
      }
      const list = join(work, 'parts.txt')
      writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'))
      ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'libmp3lame', '-b:a', '128k', audioFile])
      writeCaptions(captionsFile, cues)
      return cues
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  }

  let cues = await doSynthesis(blocks)

  // ASR verification and pronunciation auto-correction
  const asrConfig = project.project.asr ?? {}
  const asrProviderName = process.env.VIDEO_AGENT_FAKE_ASR
    ? 'fake'
    : flags.verify
      ? (asrConfig.provider && asrConfig.provider !== 'none' ? asrConfig.provider : 'qwen-asr')
      : (asrConfig.provider && asrConfig.provider !== 'none' ? asrConfig.provider : null)

  if (asrProviderName) {
    if (!process.env.VIDEO_AGENT_FAKE_ASR && asrProviderName !== 'fake') {
      checkAsrConsent(asrConfig)
    }
    const asr = getAsrProvider(asrProviderName)
    const expectedText = cues.map((c) => c.text).join('')
    let res = await asr.transcribe({
      audioFile,
      expectedText,
      language: project.project.language ?? 'zh',
      model: asrConfig.model,
    })
    let diff = diffPronunciation(expectedText, res.text)
    const autoPatchEnabled = !flags['no-auto-patch'] && asrConfig.autoPatch !== false

    if (!diff.passed && autoPatchEnabled && diff.issues.length > 0) {
      const patches = suggestPatches(diff)
      if (Object.keys(patches).length > 0) {
        console.log(`${id}: ASR pronunciation mismatch detected; auto-applying patch:`, patches)
        pronunciation = { ...pronunciation, ...patches }
        blocks = parseScript(script, { pronunciation })
        cues = await doSynthesis(blocks)
        res = await asr.transcribe({ audioFile, expectedText, language: project.project.language ?? 'zh' })
        diff = diffPronunciation(expectedText, res.text)
        diff.autoPatched = true
        diff.appliedPatches = patches
      }
    }

    const reportFile = join(sceneDir, 'assets', 'pronunciation-report.json')
    writeFileSync(reportFile, JSON.stringify(diff, null, 2) + '\n')
    if (diff.passed) {
      console.log(`${id}: ASR pronunciation check passed (${Math.round(diff.score * 100)}%)`)
    } else {
      console.warn(`${id}: ASR pronunciation warning (${diff.issues.length} issue(s)). Report written to ${ref.dir}/assets/pronunciation-report.json`)
    }
  }

  const used = [...new Set([...voices.values()].map((v) => v.provider))].join(' + ')
  console.log(`${id}: ${used} narration ${probeDuration(audioFile).toFixed(2)}s, ${cues.length} caption(s)`)
  return 0
})

/** The narrator's voice, or a cast member's (their provider and voice, falling back to the project's). */
function voiceFor(project, narrator, speaker) {
  const fake = process.env.VIDEO_AGENT_FAKE_TTS
  if (!speaker) return { provider: fake ? 'fake' : narrator.provider, voice: narrator.voice }
  const member = project.project.cast?.find((m) => m.name === speaker)
  if (!member) throw new UsageError(`【${speaker}】 is not in project.cast; add the character or fix the name in script.md`)
  const tts = project.project.tts
  const provider = member.provider ?? tts.provider
  // A voice name only makes sense for its own provider.
  const voice = member.voice ?? (provider === tts.provider ? tts.voice : undefined)
  return { provider: fake ? 'fake' : provider, voice }
}

function isOnline(provider) {
  if (ONLINE_PROVIDERS.has(provider)) return true
  if (provider === 'cosyvoice3' || provider === 'cosyvoice') {
    const url = process.env.COSYVOICE_URL ?? ''
    return url !== '' && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url)
  }
  return false
}

function checkVoice(settings, { provider, voice }, what) {
  if (provider === 'manual') throw new UsageError(`manual narration cannot be mixed with character voices (${what}); record the whole scene or pick a provider for the cast`)
  if (isOnline(provider) && !settings.consent?.onlineTts) {
    throw new UsageError(
      `gate onlineTtsConsent: ${provider} sends the narration text to an online service. ` +
        'Ask the user, then record consent in project.tts.consent, or switch to piper, system or manual.',
    )
  }
  if (!voice && !['fake', 'system', 'cosyvoice3', 'cosyvoice'].includes(provider)) throw new UsageError(`no voice set for ${what}`)
}

function synth(name) {
  return name === 'fake' ? fakeProvider : getProvider(name)
}

/** Synthesizes a short line in one voice to brief/voices/<id>.mp3 so the user can hear it before choosing. */
async function sample(root, project, who, text) {
  const tts = project.project.tts
  const member = who === 'narrator' ? null : project.project.cast?.find((m) => m.id === who)
  if (who !== 'narrator' && !member) throw new UsageError(`--sample: no cast member with id ${who} (or use narrator)`)
  const v = voiceFor(project, { provider: tts.provider, voice: tts.voice }, member?.name)
  checkVoice(tts, v, member ? `cast ${who}` : 'the narrator')
  const line = text ?? (member ? `我是${member.name}。${member.description ?? ''}`.trim() : '從前從前，在很遠很遠的地方。')
  const outDir = join(root, 'brief', 'voices')
  mkdirSync(outDir, { recursive: true })
  const out = join(outDir, `${who}.mp3`)
  const work = mkdtempSync(join(tmpdir(), 'avp-tts-'))
  try {
    const { file } = await synth(v.provider).synthesize({ text: line, voice: v.voice, speed: 1, workDir: work })
    ffmpeg(['-i', file, '-c:a', 'libmp3lame', '-b:a', '128k', out])
    console.log(`${who}: ${v.provider}${v.voice ? ` ${v.voice}` : ''} → brief/voices/${who}.mp3 (${probeDuration(out).toFixed(2)}s)`)
    return 0
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

function writeCaptions(file, cues) {
  writeFileSync(file, JSON.stringify(cues, null, 2) + '\n')
}

const round = (n) => Math.round(n * 1000) / 1000
