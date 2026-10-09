// The two engines that turn composed music into audio (SPEC §7.5):
//   fluidsynth — General MIDI playback with a SoundFont (real instrument samples); needs FluidSynth
//                and a SoundFont, installed once per machine by `pnpm run music:setup`.
//   webaudio   — synthesizers in headless Chromium's OfflineAudioContext; nothing to install.
import { existsSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { closeBrowser, launchBrowser } from './browser.mjs'

export const SAMPLE_RATE = 48000

/** Shared per-machine tools live here, like CosyVoice (~/.aoa/cosyvoice). AOA_HOME overrides. */
export const aoaHome = () => process.env.AOA_HOME || join(homedir(), '.aoa')
export const soundfontDir = () => join(aoaHome(), 'soundfonts')

/**
 * SoundFonts that `pnpm run music:setup` knows how to install (all free for commercial music).
 * `parts` lists what each is good for; a piano-only font has no drums or other instruments.
 * `archive` entries are extracted with tar (bsdtar on Windows reads 7z) and `file` taken from inside.
 */
export const SOUNDFONTS = {
  'GeneralUser-GS.sf2': {
    title: 'GeneralUser GS 2.0.3',
    url: 'https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/97049183643d5fc5a9322a69c5b09efb667c6c3a/GeneralUser-GS.sf2',
    sizeMB: 32,
    license: 'GeneralUser GS License v2.0 (free for private and commercial music)',
    parts: 'all',
    default: true,
  },
  'MuseScore_General.sf3': {
    title: 'MuseScore General 0.2',
    url: 'https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3',
    sizeMB: 40,
    license: 'MIT',
    parts: 'all',
  },
  'UprightPianoKW.sf2': {
    title: 'Upright Piano KW (FreePats)',
    url: 'https://freepats.zenvoid.org/Piano/UprightPianoKW/UprightPianoKW-SF2-20220221.7z',
    archive: true,
    sizeMB: 29,
    license: 'CC0 1.0',
    parts: 'keys (piano only)',
  },
}
export const DEFAULT_SOUNDFONT = Object.keys(SOUNDFONTS).find((k) => SOUNDFONTS[k].default)
/** Parts rendered as separate stems by the fluidsynth engine. */
export const PARTS = ['lead', 'keys', 'pad', 'bass', 'drums']

const works = (exe) => spawnSync(exe, ['--version'], { encoding: 'utf8', windowsHide: true }).status === 0

/** FluidSynth: $FLUIDSYNTH, then ~/.aoa/fluidsynth/bin, then PATH. Returns the command or null. */
export function findFluidSynthExe() {
  const exeName = process.platform === 'win32' ? 'fluidsynth.exe' : 'fluidsynth'
  return [process.env.FLUIDSYNTH, join(aoaHome(), 'fluidsynth', 'bin', exeName), 'fluidsynth']
    .filter(Boolean)
    .find((p) => (p === 'fluidsynth' || existsSync(p)) && works(p)) ?? null
}

/** A SoundFont by name: $SOUNDFONT for the default one, otherwise ~/.aoa/soundfonts/<name>. Null when absent. */
export function soundfontPath(name = DEFAULT_SOUNDFONT) {
  if (name === DEFAULT_SOUNDFONT && process.env.SOUNDFONT && existsSync(process.env.SOUNDFONT)) return process.env.SOUNDFONT
  const file = join(soundfontDir(), name)
  return existsSync(file) ? file : null
}

/**
 * What the fluidsynth engine would use: { exe, fonts: { part: path } } with the font chosen per
 * part (music.soundfonts.<part>, then .default, then GeneralUser GS). A part whose chosen font is
 * not installed falls back to the default one and is listed in `fallbacks`.
 * Returns { missing: [...] } when FluidSynth or the default font is not installed.
 */
export function findFluidSynth(choice = {}) {
  const exe = findFluidSynthExe()
  const base = choice.default ?? DEFAULT_SOUNDFONT
  const fallback = soundfontPath(base) ?? soundfontPath(DEFAULT_SOUNDFONT)
  const missing = [!exe && 'FluidSynth', !fallback && `SoundFont ${base}`].filter(Boolean)
  if (missing.length) return { missing }
  const fonts = {}
  const fallbacks = []
  for (const part of PARTS) {
    const name = choice[part] ?? base
    const path = soundfontPath(name)
    if (!path) fallbacks.push(`${part}: ${name}`)
    fonts[part] = path ?? fallback
  }
  return { exe, fonts, fallbacks }
}

/** Renders a MIDI file to WAV with FluidSynth (no audio device: -n -i, fast offline rendering). */
export function renderFluidSynth(exe, soundfont, midiFile, outFile) {
  const r = spawnSync(exe, ['-ni', '-q', '-g', '1.0', '-r', String(SAMPLE_RATE), '-F', outFile, soundfont, midiFile], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (r.status !== 0 || !existsSync(outFile)) throw new Error(`fluidsynth failed: ${(r.stderr || r.error?.message || '').trim()}`)
}

/** Renders the song's events in headless Chromium; writes a 16-bit stereo WAV. `mix` is dB per part. */
export async function renderWebAudio(song, { seed = 1, mix = {} }, outFile) {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    const b64 = await page.evaluate(synth, { events: song.events, duration: song.duration + 1, sr: SAMPLE_RATE, seed, mix })
    writeFileSync(outFile, wav(Buffer.from(b64, 'base64'), SAMPLE_RATE, 2))
  } finally {
    await closeBrowser(browser)
  }
}

/** Runs inside the page; must not reference anything outside itself. */
async function synth({ events, duration, sr, seed, mix }) {
  let a = seed >>> 0
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sr), sr)
  const hz = (n) => 440 * Math.pow(2, (n - 69) / 12)
  const vel = (v) => Math.pow(v / 127, 1.5)

  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -16
  comp.ratio.value = 3
  const master = ctx.createGain()
  master.gain.value = 0.55
  comp.connect(master).connect(ctx.destination)

  // Generated reverb impulse response
  const irLen = Math.floor(sr * 2.4)
  const ir = ctx.createBuffer(2, irLen, sr)
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c)
    for (let i = 0; i < irLen; i++) d[i] = (rand() * 2 - 1) * Math.pow(1 - i / irLen, 3)
  }
  const verb = ctx.createConvolver()
  verb.buffer = ir
  const verbOut = ctx.createGain()
  verbOut.gain.value = 0.35
  verb.connect(verbOut).connect(comp)

  const bus = {}
  for (const [name, g, send, pan] of [
    ['kick', 0.9, 0, 0], ['snare', 0.45, 0.2, 0], ['hat', 0.18, 0.05, 0.3], ['crash', 0.16, 0.3, -0.3],
    ['bass', 0.55, 0, 0], ['keys', 0.22, 0.35, -0.2], ['pad', 0.09, 0.5, 0.2], ['lead', 0.2, 0.4, 0.1],
  ]) {
    const gain = ctx.createGain()
    const part = ['kick', 'snare', 'hat', 'crash'].includes(name) ? 'drums' : name
    gain.gain.value = g * Math.pow(10, (mix[part] ?? 0) / 20)
    const p = ctx.createStereoPanner()
    p.pan.value = pan
    gain.connect(p).connect(comp)
    if (send) {
      const s = ctx.createGain()
      s.gain.value = send
      gain.connect(s).connect(verb)
    }
    bus[name] = gain
  }

  const noise = ctx.createBuffer(1, sr, sr)
  const nd = noise.getChannelData(0)
  for (let i = 0; i < sr; i++) nd[i] = rand() * 2 - 1

  const env = (g, t, peak, atk, dec, sus, end, rel) => {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + atk)
    g.gain.setTargetAtTime(peak * sus, t + atk, dec)
    g.gain.setValueAtTime(g.gain.value, end)
    g.gain.setTargetAtTime(0.0001, end, rel)
  }
  const osc = (type, f, t, stop, detune = 0) => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = f
    o.detune.value = detune
    o.start(t)
    o.stop(stop)
    return o
  }
  const noiseSrc = (t, stop) => {
    const s = ctx.createBufferSource()
    s.buffer = noise
    s.loop = true
    s.start(t, rand() * 0.5)
    s.stop(stop)
    return s
  }

  for (const { track, t, d, n, v } of events) {
    const out = bus[track]
    const pk = vel(v)
    const g = ctx.createGain()
    g.connect(out)
    if (track === 'kick') {
      const o = osc('sine', 130, t, t + 0.5)
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
      env(g, t, pk, 0.003, 0.12, 0.001, t + 0.4, 0.05)
      o.connect(g)
    } else if (track === 'snare') {
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 1500
      noiseSrc(t, t + 0.3).connect(hp).connect(g)
      const body = ctx.createGain()
      body.gain.value = 0.5
      osc('triangle', 190, t, t + 0.1).connect(body).connect(g)
      env(g, t, pk, 0.002, 0.05, 0.001, t + 0.25, 0.03)
    } else if (track === 'hat') {
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 8000
      noiseSrc(t, t + 0.1).connect(hp).connect(g)
      env(g, t, pk, 0.001, 0.015, 0.001, t + 0.08, 0.01)
    } else if (track === 'crash') {
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 5000
      noiseSrc(t, t + 1.8).connect(hp).connect(g)
      env(g, t, pk, 0.002, 0.5, 0.001, t + 1.6, 0.2)
    } else if (track === 'bass') {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.setValueAtTime(1000, t)
      lp.frequency.setTargetAtTime(280, t, 0.08)
      lp.connect(g)
      osc('sawtooth', hz(n), t, t + d + 0.5).connect(lp)
      osc('sine', hz(n - 12), t, t + d + 0.5).connect(g)
      env(g, t, pk, 0.005, 0.3, 0.7, t + d, 0.05)
    } else if (track === 'keys') {
      // 類電鋼琴：正弦基音 + 微弱泛音，自然衰減
      const f = hz(n)
      const h = ctx.createGain()
      h.gain.value = 0.25
      osc('sine', f, t, t + d + 1.5).connect(g)
      osc('triangle', f * 2, t, t + d + 1.5).connect(h).connect(g)
      env(g, t, pk, 0.004, 0.6, 0.15, t + d, 0.25)
    } else if (track === 'pad') {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 1400
      lp.connect(g)
      for (const dt of [-8, 8]) osc('sawtooth', hz(n), t, t + d + 2, dt).connect(lp)
      env(g, t, pk, 0.45, 1, 0.9, t + d, 0.5)
    } else if (track === 'lead') {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 3000
      lp.connect(g)
      const o = osc('triangle', hz(n), t, t + d + 1)
      const sq = osc('square', hz(n), t, t + d + 1)
      const sqg = ctx.createGain()
      sqg.gain.value = 0.12
      const lfo = osc('sine', 5.2, t, t + d + 1)
      const depth = ctx.createGain()
      depth.gain.value = 6
      lfo.connect(depth)
      depth.connect(o.detune)
      depth.connect(sq.detune)
      o.connect(lp)
      sq.connect(sqg).connect(lp)
      env(g, t, pk, 0.015, 0.2, 0.7, t + d, 0.12)
    }
  }

  const buf = await ctx.startRendering()
  const L = buf.getChannelData(0)
  const R = buf.getChannelData(1)
  const pcm = new Int16Array(L.length * 2)
  for (let i = 0; i < L.length; i++) {
    pcm[i * 2] = Math.max(-1, Math.min(1, L[i])) * 32767
    pcm[i * 2 + 1] = Math.max(-1, Math.min(1, R[i])) * 32767
  }
  const bytes = new Uint8Array(pcm.buffer)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function wav(pcm, sampleRate, channels) {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + pcm.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(channels, 22)
  h.writeUInt32LE(sampleRate, 24)
  h.writeUInt32LE(sampleRate * channels * 2, 28)
  h.writeUInt16LE(channels * 2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}
