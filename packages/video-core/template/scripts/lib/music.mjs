// Generated music (SPEC §7.5): project.audio.music → note events → MIDI / audio.
// Pure functions; scripts/music.mjs does the I/O. Both engines play the same events, so switching
// engine changes the sound, not the tune.
// An event is { track, t, d, n, v }: track name, start and length in seconds, MIDI note, velocity 1–127.

import { UsageError } from './project.mjs'

export const MUSIC_DIR = 'assets/music'
export const MUSIC_FILE = `${MUSIC_DIR}/bgm.wav`
export const MIDI_FILE = `${MUSIC_DIR}/song.mid`
export const MUSIC_META = `${MUSIC_DIR}/bgm.json`

/** General MIDI programs used when music.instruments leaves a part unset. */
export const DEFAULT_INSTRUMENTS = { lead: 11, keys: 0, pad: 48, bass: 33 }
export const DRUM_TRACKS = ['kick', 'snare', 'hat']
const GM_DRUMS = { kick: 36, snare: 38, hat: 42 }

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const MINOR = [0, 2, 3, 5, 7, 8, 10]
const pitchClass = (letter, accidental) => (NOTE[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) + 12) % 12

/** Deterministic PRNG (mulberry32), so the same seed always gives the same music. */
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** "F#m7" → { root, pcs } (pitch classes, root first). */
export function parseChord(symbol) {
  const m = /^([A-G])([#b]?)(maj7|m7|m|7|sus2|sus4)?$/.exec(symbol)
  if (!m) throw new UsageError(`cannot read chord "${symbol}" (examples: C, Am, F#m, Bb, G7, Cmaj7, Dsus4)`)
  const root = pitchClass(m[1], m[2])
  const intervals = { m: [0, 3, 7], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], sus2: [0, 2, 7], sus4: [0, 5, 7] }[m[3]] ?? [0, 4, 7]
  return { root, pcs: intervals.map((i) => (root + i) % 12) }
}

/** "Am" → pitch classes of A natural minor; "Eb" → E-flat major. */
export function parseKey(key) {
  const m = /^([A-G])([#b]?)(m?)$/.exec(key)
  if (!m) throw new UsageError(`cannot read key "${key}" (examples: C, F#, Bb, Am, C#m)`)
  const tonic = pitchClass(m[1], m[2])
  return (m[3] ? MINOR : MAJOR).map((s) => (s + tonic) % 12)
}

/** Which part an event belongs to (the drum tracks share one). */
export const partOf = (track) => (DRUM_TRACKS.includes(track) ? 'drums' : track)

/** Seconds per bar (4/4). */
export const barSec = (bpm) => (60 / bpm) * 4

/**
 * Gives every section a bar count. Sections with `scenes` end where the scene after their last
 * scene starts on the final timeline (`timeline` from timeline.layout, `order` the scene ids in
 * playback order); the boundary is rounded to the nearest bar from the start of the video, so
 * rounding does not add up across sections. Returns [{ ...section, bars }].
 */
export function resolveSections(music, { timeline = null, order = [] } = {}) {
  const bar = barSec(music.bpm)
  let cursor = 0
  return music.sections.map((section, i) => {
    let bars = section.bars
    if (section.scenes) {
      if (!timeline) throw new UsageError(`music.sections[${i}] is aligned to scenes; render them first, or give it bars instead`)
      const last = Math.max(...section.scenes.map((id) => {
        const k = order.indexOf(id)
        if (k < 0) throw new UsageError(`music.sections[${i}]: scene ${id} is not in video.project.json`)
        return k
      }))
      const end = timeline.items[last + 1]?.start ?? timeline.total
      bars = Math.max(1, Math.round(end / bar) - cursor)
    }
    cursor += bars
    return { ...section, bars }
  })
}

// Two-bar melody rhythms, in eighth notes: [position, length].
const MOTIFS = [
  [[0, 2], [2, 1], [3, 1], [4, 3], [8, 1], [9, 1], [10, 2], [12, 4]],
  [[0, 1], [1, 1], [2, 2], [4, 2], [6, 2], [8, 3], [11, 1], [12, 4]],
  [[0, 3], [3, 1], [4, 2], [6, 2], [8, 2], [10, 1], [11, 1], [12, 4]],
]

/** Puts pitch class `pc` in [lo, lo + 12). */
const place = (pc, lo) => lo + ((((pc - lo) % 12) + 12) % 12)

/**
 * Writes the parts for `sections` (bars resolved). Energy decides the arrangement: below 0.3 only
 * the pad; from 0.3 bass, a light beat and sparse piano; from 0.6 the full beat, piano rhythm and
 * melody. Returns { events, duration, beat }.
 */
export function compose(music, sections) {
  const r = rng(music.seed ?? 1)
  const beat = 60 / music.bpm
  const bar = beat * 4
  const scale = parseKey(music.key)
  const parts = { ...DEFAULT_INSTRUMENTS, ...music.instruments }
  const drums = music.drums ?? true
  const events = []
  const add = (track, t, d, n, v) => {
    if (DRUM_TRACKS.includes(track) ? !drums : parts[track] === null) return
    events.push({ track, t, d, n, v: Math.max(1, Math.min(127, Math.round(v + (r() - 0.5) * 14))) })
  }

  const motif = MOTIFS[Math.floor(r() * MOTIFS.length)]
  let barIdx = 0
  let prevMel = 72
  let ended = false

  sections.forEach((sec, si) => {
    const next = sections[si + 1]
    for (let b = 0; b < sec.bars; b++, barIdx++) {
      const t0 = barIdx * bar
      const chord = parseChord(sec.chords[b % sec.chords.length])
      const e = sec.energy
      const lastBar = b === sec.bars - 1
      const ending = sec.ending && lastBar
      const voicing = chord.pcs.map((pc) => place(pc, 55)).sort((x, y) => x - y)
      const bassN = place(chord.root, 36)
      ended = ending

      for (const n of voicing) add('pad', t0, ending ? bar * 1.5 : bar, n, 50 + e * 30)

      if (ending) {
        for (const n of [...voicing, voicing[0] + 12]) add('keys', t0, bar * 1.5, n, 70)
        add('bass', t0, bar * 1.5, bassN, 90)
        add('kick', t0, 0.3, GM_DRUMS.kick, 100)
        continue
      }

      if (e >= 0.3) {
        const comp = e >= 0.6 ? [0, 1.5, 2.5, 3] : [0, 2]
        for (const p of comp) for (const n of voicing) add('keys', t0 + p * beat, beat * (e >= 0.6 ? 0.9 : 1.8), n, 58 + e * 25)
      }

      if (e >= 0.6) {
        for (const [p, n, d] of [[0, bassN, 1.4], [1.5, bassN, 0.4], [2, bassN, 0.9], [3, bassN + 7, 0.5], [3.5, bassN + 12, 0.4]]) add('bass', t0 + p * beat, d * beat, n, 92)
        for (const p of [0, 1.75, 2, 2.5]) add('kick', t0 + p * beat, 0.3, GM_DRUMS.kick, p === 0 || p === 2 ? 110 : 80)
        for (const p of [1, 3]) add('snare', t0 + p * beat, 0.2, GM_DRUMS.snare, 100)
        for (let i = 0; i < 8; i++) add('hat', t0 + i * beat * 0.5, 0.05, GM_DRUMS.hat, i % 2 ? 55 : 80)
        // Fill into the next section unless it is the ending
        if (lastBar && next && !next.ending) for (let i = 0; i < 4; i++) add('snare', t0 + 3 * beat + (i * beat) / 4, 0.1, GM_DRUMS.snare, 60 + i * 12)
      } else if (e >= 0.3) {
        add('bass', t0, bar * 0.95, bassN, 80)
        add('kick', t0, 0.3, GM_DRUMS.kick, 85)
        add('kick', t0 + 2 * beat, 0.3, GM_DRUMS.kick, 70)
        for (let i = 0; i < 4; i++) add('hat', t0 + i * beat, 0.05, GM_DRUMS.hat, 50)
      }

      // Melody: the same two-bar rhythm throughout, pitches refitted to each chord
      if (e >= 0.6) {
        const half = b % 2
        for (const [pos, len] of motif) {
          if (Math.floor(pos / 8) !== half) continue
          let n
          if (pos % 4 === 0) {
            // On the beat: the chord tone closest to the previous note
            const cands = chord.pcs.flatMap((pc) => [place(pc, 64), place(pc, 76)])
            n = cands.reduce((a, c) => (Math.abs(c - prevMel) < Math.abs(a - prevMel) ? c : a))
          } else {
            // Off the beat: one scale step up or down
            const idx = Math.max(0, scale.indexOf(((prevMel % 12) + 12) % 12))
            n = place(scale[(idx + (r() < 0.5 ? -1 : 1) + 7) % 7], prevMel - 6)
          }
          n = Math.max(64, Math.min(84, n))
          // A section's last long note lands on the chord root
          if (lastBar && pos >= 12) n = place(chord.root, 67)
          add('lead', t0 + ((pos % 8) * beat) / 2, ((len * beat) / 2) * 0.95, n, 85)
          prevMel = n
        }
      }
    }
  })

  // An ending rings out for half a bar more; otherwise the music stops at the last bar line.
  const duration = barIdx * bar + (ended ? bar * 1.5 : 0)
  return { events: events.sort((a, b) => a.t - b.t || a.n - b.n), duration, beat }
}

// --- Standard MIDI File (type 1) ---

const PPQ = 480
const CHANNELS = { lead: 0, keys: 1, pad: 2, bass: 3 }
const VOLUME = { lead: 92, keys: 88, pad: 62, bass: 100, drums: 95 }

const vlq = (n) => {
  const out = [n & 0x7f]
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80)
  return out
}

function chunk(type, bytes) {
  const head = Buffer.alloc(8)
  head.write(type, 0)
  head.writeUInt32BE(bytes.length, 4)
  return Buffer.concat([head, Buffer.from(bytes)])
}

/**
 * Song from compose() → MIDI file bytes. Drums go to channel 10 as General MIDI requires.
 * `only` keeps a single part ('lead', 'keys', 'pad', 'bass' or 'drums'), for rendering stems.
 */
export function toMidi({ events, beat }, instruments = {}, only = null) {
  const programs = { ...DEFAULT_INSTRUMENTS, ...instruments }
  const ticks = (sec) => Math.max(0, Math.round((sec / beat) * PPQ))
  const us = Math.round(beat * 1e6)
  const tracks = [[0, 0xff, 0x51, 3, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff, 0, 0xff, 0x2f, 0]]

  for (const part of [...Object.keys(CHANNELS), 'drums']) {
    if (only && part !== only) continue
    const ch = part === 'drums' ? 9 : CHANNELS[part]
    const mine = events.filter((e) => partOf(e.track) === part)
    if (!mine.length) continue
    const msgs = mine.flatMap((e) => [
      { at: ticks(e.t), off: false, data: [0x90 | ch, e.n, e.v] },
      { at: ticks(e.t + e.d), off: true, data: [0x80 | ch, e.n, 0] },
    ])
    // Note-offs first at the same tick, so a repeated note is not cut by its own previous release
    msgs.sort((a, b) => a.at - b.at || b.off - a.off)
    const bytes = []
    if (part !== 'drums') bytes.push(0, 0xc0 | ch, programs[part])
    bytes.push(0, 0xb0 | ch, 7, VOLUME[part], 0, 0xb0 | ch, 91, 50)
    let now = 0
    for (const m of msgs) {
      bytes.push(...vlq(m.at - now), ...m.data)
      now = m.at
    }
    bytes.push(0, 0xff, 0x2f, 0)
    tracks.push(bytes)
  }

  const header = Buffer.alloc(14)
  header.write('MThd', 0)
  header.writeUInt32BE(6, 4)
  header.writeUInt16BE(1, 8)
  header.writeUInt16BE(tracks.length, 10)
  header.writeUInt16BE(PPQ, 12)
  return Buffer.concat([header, ...tracks.map((t) => chunk('MTrk', t))])
}
