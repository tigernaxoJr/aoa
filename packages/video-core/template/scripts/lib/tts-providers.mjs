// TTS provider implementations (SPEC §7.4). synthesize({ text, voice, speed, workDir }) writes an
// audio file inside workDir and returns { file, words }; words are optional boundaries
// [{ start, end, text }] in seconds.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { findRoot, UsageError } from './project.mjs'

export const ONLINE_PROVIDERS = new Set(['edge-tts', 'azure', 'openai', 'elevenlabs'])

const isLocalEndpoint = (url) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)

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

  cosyvoice3: {
    async synthesize({ text, voice, speed, workDir }) {
      const endpoint = process.env.COSYVOICE_URL ?? 'http://127.0.0.1:50000/api/tts'
      const wav = join(workDir, 'cosyvoice.wav')

      // 解析自然語言指令 (例如: "中文女 <用熱情興奮的語氣>" 或 "@/assets/voices/star.wav (台語)")
      let speaker = (voice ?? 'default').trim()
      let instruct = undefined
      const match = speaker.match(/[<\(](.+?)[>\)]\s*$/)
      if (match) {
        instruct = match[1].trim()
        speaker = speaker.slice(0, match.index).trim()
      }

      // 本機服務由所有專案共用，克隆參考音檔的 @/ 路徑改由這裡轉成本專案的絕對路徑；遠端端點不送出本機路徑
      if (speaker.startsWith('@/') && isLocalEndpoint(endpoint)) speaker = join(findRoot(), speaker.slice(2))

      const payload = {
        text,
        speaker: speaker || 'default',
        ...(instruct ? { instruct } : {}),
        speed: speed ?? 1,
        format: 'wav',
      }
      let res
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.COSYVOICE_API_KEY ? { Authorization: `Bearer ${process.env.COSYVOICE_API_KEY}` } : {}),
          },
          body: JSON.stringify(payload),
        })
      } catch (err) {
        throw new UsageError(
          `CosyVoice 3 (Basic) service unavailable at ${endpoint} (${err.message}). ` +
            'Run "pnpm run cosyvoice:setup" to install dependencies/models, and "pnpm run cosyvoice:serve" in background.',
        )
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        if (res.status === 503) {
          throw new UsageError(`CosyVoice 3 model weights not ready: ${errText}. Run "pnpm run cosyvoice:setup" to download basic weights.`)
        }
        throw new Error(`CosyVoice 3 synthesis failed (${res.status}): ${errText.slice(0, 200)}`)
      }
      const buffer = Buffer.from(await res.arrayBuffer())
      writeFileSync(wav, buffer)
      return { file: wav, words: null }
    },
    async listVoices() {
      const endpoint = process.env.COSYVOICE_URL ?? 'http://127.0.0.1:50000/api/tts'
      let info = null
      try {
        const base = endpoint.replace(/\/api\/tts\/?$/, '')
        const res = await fetch(`${base}/api/speakers`)
        if (res.ok) info = await res.json()
      } catch {}

      const lines = [
        '【CosyVoice 3.0 全功能音色、情緒指令與多語言指南】',
        '',
        '1. 基礎發音人 (Base Speakers)：',
      ]
      const speakers = info?.speakers ?? [
        { id: 'default', name: '預設中文聲音 (自然流暢)', locale: 'zh-TW' },
        { id: '中文女', name: '中文女聲 (柔和清晰)', locale: 'zh-TW' },
        { id: '中文男', name: '中文男聲 (沉穩大氣)', locale: 'zh-TW' },
        { id: '粵語女', name: '粵語女聲 (生動自然)', locale: 'zh-HK' },
        { id: '英文女', name: '英文女聲 (國際標準)', locale: 'en-US' },
        { id: '英文男', name: '英文男聲 (專業播音)', locale: 'en-US' },
        { id: '日語男', name: '日語男聲 (沉穩)', locale: 'ja-JP' },
        { id: '韓語女', name: '韓語女聲 (溫柔)', locale: 'ko-KR' },
      ]
      for (const s of speakers) lines.push(`  ${s.id}\t${s.name}\t${s.locale ?? 'zh'}`)

      lines.push(
        '',
        '2. 自然語言情緒/風格指令 (Instruct Control - 在 voice 加上 <指令>)：',
        '  中文女 <用熱情興奮的語氣說>\t自訂情緒：熱情、悲傷、生氣、低沉耳語、播音腔調',
        '  中文男 <用專業嚴肅的紀錄片旁白語氣>\t自訂語氣風格，模型自動理解',
        '',
        '3. 18+ 方言與 9 大語言 (Dialects & Languages)：',
        '  中文女 <用台語/閩南語說>\t支援：台語(閩南語)、粵語、四川話、東北話、上海話等',
        '  中文男 <用日語流暢地說>\t支援：中、英、日、韓、德、西、法、義、俄 9 種語言',
        '',
        '4. 3 秒聲音克隆 (Zero-shot Voice Clone)：',
        '  @/assets/voices/sample.wav\t傳入 WAV 錄音檔路徑，自動克隆聲紋',
        '  @/assets/voices/sample.wav <用英語說>\t跨語言克隆（用你的聲音說外語）',
        '',
        '5. 旁白文本內表情標籤 (Rich text tags)：',
        '  可在 script.md 中直接嵌入：<laughter>笑聲</laughter>、<whisper>耳語</whisper>、<sigh>嘆氣</sigh>',
      )
      return lines
    },
  },
}

providers['cosyvoice'] = providers['cosyvoice3']

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
