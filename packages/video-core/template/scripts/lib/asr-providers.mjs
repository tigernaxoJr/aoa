// ASR (Automatic Speech Recognition) providers for pronunciation verification (SPEC §7.4).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { UsageError } from './project.mjs'

/** Providers requiring online consent. */
export const ONLINE_ASR_PROVIDERS = new Set(['openai'])

/** Stand-in for tests and dry runs (VIDEO_AGENT_FAKE_ASR=1). */
export const fakeAsrProvider = {
  async transcribe({ audioFile, expectedText = '' }) {
    // If fake ASR error/transcript is injected via env, use it:
    if (process.env.VIDEO_AGENT_FAKE_ASR_ERROR) {
      throw new Error(process.env.VIDEO_AGENT_FAKE_ASR_ERROR)
    }
    const text = process.env.VIDEO_AGENT_FAKE_ASR_TRANSCRIPT ?? expectedText
    return { text, words: null }
  },
}

/** Local whisper CLI provider (whisper.cpp or openai-whisper CLI). */
export const whisperCliProvider = {
  async transcribe({ audioFile, language = 'zh' }) {
    const outBase = join(tmpdir(), `asr-${Date.now()}`)
    try {
      // Try whisper.cpp or standard whisper CLI
      execFileSync('whisper', [audioFile, '--language', language, '--output_format', 'txt', '--output_dir', tmpdir()], {
        stdio: 'pipe',
      })
      const txtFile = `${audioFile}.txt`
      if (existsSync(txtFile)) {
        const text = readFileSync(txtFile, 'utf8').trim()
        try { unlinkSync(txtFile) } catch {}
        return { text, words: null }
      }
      return { text: '', words: null }
    } catch (e) {
      throw new UsageError(`whisper CLI failed or not installed: ${e.message}`)
    }
  },
}

/** Online OpenAI Whisper API provider. */
export const openaiAsrProvider = {
  async transcribe({ audioFile, language = 'zh' }) {
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new UsageError('OPENAI_API_KEY environment variable is not set')
    const { openAsBlob } = await import('node:fs')
    const blob = await openAsBlob(audioFile)
    const formData = new FormData()
    formData.append('file', blob, 'audio.mp3')
    formData.append('model', 'whisper-1')
    formData.append('language', language)

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: formData,
    })
    if (!res.ok) {
      const err = await res.text()
      throw new UsageError(`OpenAI Whisper API error (${res.status}): ${err}`)
    }
    const json = await res.json()
    return { text: json.text ?? '', words: null }
  },
}

/**
 * Detects host hardware (GPU/VRAM) and recommends appropriate Qwen3-ASR model:
 * - With NVIDIA GPU & VRAM >= 4GB: Qwen/Qwen3-ASR-1.7B
 * - CPU or lightweight environment: Qwen/Qwen3-ASR-0.6B
 */
export function detectHardwareAndRecommendModel() {
  try {
    const out = execFileSync('nvidia-smi', ['--query-gpu=memory.total', '--format=csv,noheader,nounits'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
    const vramMb = Number(out.split('\n')[0])
    if (!Number.isNaN(vramMb) && vramMb >= 4000) {
      return {
        model: 'Qwen/Qwen3-ASR-1.7B',
        reason: `NVIDIA GPU detected (${Math.round(vramMb / 1024)}GB VRAM); 1.7B recommended for higher accuracy.`,
        hasGpu: true,
        vramMb,
      }
    }
  } catch {}

  return {
    model: 'Qwen/Qwen3-ASR-0.6B',
    reason: 'CPU or lightweight environment; 0.6B recommended (<1.5GB memory footprint, fast inference).',
    hasGpu: false,
  }
}

/** Local Qwen3-ASR provider (Qwen/Qwen3-ASR-1.7B or Qwen/Qwen3-ASR-0.6B). */
export const qwenAsrProvider = {
  async transcribe({ audioFile, language = 'zh', model = 'Qwen/Qwen3-ASR-0.6B' }) {
    const url = process.env.QWEN_ASR_URL ?? 'http://127.0.0.1:50001/api/asr'
    const { openAsBlob } = await import('node:fs')
    const blob = await openAsBlob(audioFile)
    const formData = new FormData()
    formData.append('audio', blob, 'audio.mp3')
    formData.append('model', model)
    formData.append('language', language)

    try {
      const res = await fetch(url, { method: 'POST', body: formData })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const json = await res.json()
      return { text: json.text ?? '', words: null }
    } catch (e) {
      throw new UsageError(`Qwen-ASR service at ${url} unavailable (${e.message}). Ensure local Qwen-ASR server is running or use fake ASR.`)
    }
  },
}

const PROVIDERS = new Map([
  ['fake', fakeAsrProvider],
  ['qwen-asr', qwenAsrProvider],
  ['whisper-cli', whisperCliProvider],
  ['openai', openaiAsrProvider],
])

export function getAsrProvider(name) {
  if (process.env.VIDEO_AGENT_FAKE_ASR) return fakeAsrProvider
  const p = PROVIDERS.get(name)
  if (!p) throw new UsageError(`unknown ASR provider "${name}"; choose one of: ${[...PROVIDERS.keys()].join(', ')}`)
  return p
}

export function checkAsrConsent(asrSettings) {
  if (!asrSettings || asrSettings.provider === 'none') return
  if (process.env.VIDEO_AGENT_FAKE_ASR || asrSettings.provider === 'fake') return
  if (!asrSettings.consent?.installAsr) {
    const rec = detectHardwareAndRecommendModel()
    throw new UsageError(
      `gate asrConsent: Local speech recognition requires user consent to install or run ASR models. ` +
        `Recommended model based on hardware: ${rec.model} (${rec.reason}). ` +
        `Ask the user and record consent in project.asr.consent = { installAsr: true, grantedAt }, or set provider to "none".`,
    )
  }
}

