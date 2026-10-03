// TTS provider implementations (SPEC §7.4). synthesize({ text, voice, speed, workDir }) writes an
// audio file inside workDir and returns { file, words }; words are optional boundaries
// [{ start, end, text }] in seconds.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { UsageError } from './project.mjs'

export const ONLINE_PROVIDERS = new Set(['edge-tts', 'azure', 'openai', 'elevenlabs'])

const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const providers = {
  'edge-tts': {
    async synthesize({ text, voice, speed, workDir }) {
      const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts')
      const tts = new MsEdgeTTS()
      try {
        await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { wordBoundaryEnabled: true })
        const { audioFilePath, metadataFilePath } = await tts.toFile(workDir, escapeXml(text), { rate: speed })
        if (!existsSync(audioFilePath)) throw new Error('edge-tts produced no audio')
        const words = metadataFilePath && existsSync(metadataFilePath) ? parseEdgeWords(readFileSync(metadataFilePath, 'utf8')) : null
        return { file: audioFilePath, words }
      } finally {
        tts.close()
      }
    },
    async listVoices() {
      const { MsEdgeTTS } = await import('msedge-tts')
      const voices = await new MsEdgeTTS().getVoices()
      return voices.map((v) => `${v.ShortName}\t${v.Gender}\t${v.Locale}`)
    },
  },

  system: {
    async synthesize({ text, voice, speed, workDir }) {
      if (process.platform === 'win32') {
        const wav = join(workDir, 'system.wav')
        // Windows SAPI via System.Speech; rate is -10..10.
        const rate = Math.max(-10, Math.min(10, Math.round((speed - 1) * 10)))
        const script = [
          'Add-Type -AssemblyName System.Speech',
          '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
          voice ? `$s.SelectVoice('${voice.replace(/'/g, "''")}')` : '',
          `$s.Rate = ${rate}`,
          `$s.SetOutputToWaveFile('${wav.replace(/'/g, "''")}')`,
          `$s.Speak([Console]::In.ReadToEnd())`,
          '$s.Dispose()',
        ].join('; ')
        run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], text)
        return { file: wav }
      }
      if (process.platform === 'darwin') {
        const aiff = join(workDir, 'system.aiff')
        run('say', [...(voice ? ['-v', voice] : []), '-r', String(Math.round(180 * speed)), '-o', aiff], text)
        return { file: aiff }
      }
      const wav = join(workDir, 'system.wav')
      run('espeak-ng', [...(voice ? ['-v', voice] : []), '-s', String(Math.round(175 * speed)), '-w', wav, '--stdin'], text)
      return { file: wav }
    },
  },

  piper: {
    async synthesize({ text, voice, speed, workDir }) {
      // voice = path to a Piper .onnx model (relative to the project root or absolute).
      const wav = join(workDir, 'piper.wav')
      const bin = process.env.PIPER_BIN ?? 'piper'
      run(bin, ['--model', voice, '--output_file', wav, '--length_scale', String(1 / speed)], text)
      return { file: wav }
    },
  },
}

for (const name of ['azure', 'openai', 'elevenlabs']) {
  providers[name] = {
    async synthesize() {
      throw new UsageError(
        `TTS provider ${name} is not implemented in this template version yet. ` +
          'Use edge-tts, piper, system, or manual (record assets/narration.mp3 yourself).',
      )
    },
  }
}

export function getProvider(name) {
  const provider = providers[name]
  if (!provider) throw new UsageError(`unknown TTS provider ${name}`)
  return provider
}

function run(bin, args, input) {
  const r = spawnSync(bin, args, { input, encoding: 'utf8', windowsHide: true })
  if (r.error?.code === 'ENOENT') throw new UsageError(`${bin} not found; install it or choose another TTS provider`)
  if (r.status !== 0) throw new Error(`${bin} failed: ${(r.stderr || r.error?.message || '').trim().split('\n').slice(-3).join(' ')}`)
}

/** Edge metadata: { Metadata: [{ Type: 'WordBoundary', Data: { Offset, Duration, text: { Text } } }] }, times in 100 ns. */
function parseEdgeWords(raw) {
  const docs = []
  try {
    docs.push(JSON.parse(raw))
  } catch {
    for (const chunk of raw.split(/\n(?=\{)/)) {
      try {
        docs.push(JSON.parse(chunk))
      } catch {
        // ignore malformed chunks; captions fall back to proportional timing
      }
    }
  }
  const words = docs
    .flatMap((d) => d.Metadata ?? [])
    .filter((m) => m.Type === 'WordBoundary')
    .map((m) => ({ start: m.Data.Offset / 1e7, end: (m.Data.Offset + m.Data.Duration) / 1e7, text: m.Data.text.Text }))
  return words.length ? words : null
}
