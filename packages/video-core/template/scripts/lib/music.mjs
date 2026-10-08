// Generated music (SPEC §7.5): project.audio.music → note events → MIDI / audio.
// Pure functions; scripts/music.mjs does the I/O. Both engines play the same events, so switching
// engine changes the sound, not the tune.
// An event is { track, t, d, n, v }: track name, start and length in seconds, MIDI note, velocity 1–127.

import { UsageError } from './project.mjs'

export const MUSIC_DIR = 'assets/music'
export const MUSIC_FILE = `${MUSIC_DIR}/bgm.wav`
export const MIDI_FILE = `${MUSIC_DIR}/song.mid`
export const MUSIC_META = `${MUSIC_DIR}/bgm.json`

export const DRUM_TRACKS = ['kick', 'snare', 'hat', 'crash']
const GM_DRUMS = { kick: 36, snare: 38, hat: 42, crash: 49 }

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const MINOR = [0, 2, 3, 5, 7, 8, 10]
const pitchClass = (letter, accidental) => (NOTE[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) + 12) % 12

// --- Styles ---
//
// A style is the arrangement: General MIDI programs, the piano (keys) pattern, the bass pattern,
// drum grids for medium and high energy, the melody rhythms it draws from, and swing.
// Drum grids are 16 sixteenth notes: X accent, x normal, o soft, . rest.
// Bass patterns are [step, length in steps, note]: r root, 5 fifth, 8 octave, a approach to the next chord.

const MOTIFS = [
  [[0, 2], [2, 1], [3, 1], [4, 3], [8, 1], [9, 1], [10, 2], [12, 4]],
  [[0, 1], [1, 1], [2, 2], [4, 2], [6, 2], [8, 3], [11, 1], [12, 4]],
  [[0, 3], [3, 1], [4, 2], [6, 2], [8, 2], [10, 1], [11, 1], [12, 4]],
  [[0, 4], [4, 2], [6, 2], [8, 6]],
  [[0, 1], [1, 1], [2, 1], [3, 1], [4, 2], [7, 1], [8, 1], [9, 1], [10, 2], [12, 3]],
  [[1, 2], [3, 1], [4, 2], [7, 2], [9, 1], [10, 2], [12, 4]],
  [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
]

const BASS = {
  drive: { mid: [[0, 15, 'r']], high: [[0, 6, 'r'], [6, 2, 'r'], [8, 4, 'r'], [12, 2, '5'], [14, 2, 'a']] },
  root5: { mid: [[0, 8, 'r'], [8, 8, '5']], high: [[0, 6, 'r'], [6, 2, 'r'], [8, 6, '5'], [14, 2, 'a']] },
  pulse8: { mid: [[0, 4, 'r'], [4, 4, 'r'], [8, 4, 'r'], [12, 4, 'r']], high: [[0, 2, 'r'], [2, 2, 'r'], [4, 2, 'r'], [6, 2, 'r'], [8, 2, 'r'], [10, 2, 'r'], [12, 2, '5'], [14, 2, 'a']] },
  lofi: { mid: [[0, 7, 'r'], [10, 4, '5']], high: [[0, 6, 'r'], [7, 3, '5'], [10, 4, 'r'], [14, 2, 'a']] },
}

export const STYLES = {
  pop: {
    instruments: { lead: 11, keys: 4, pad: 89, bass: 38 },
    keys: 'pulse',
    bass: 'drive',
    drums: {
      mid: { kick: 'x.......x.......', hat: 'o...o...o...o...' },
      high: { kick: 'X......xX.x.....', snare: '....X.......X...', hat: 'x.o.x.o.x.o.x.o.' },
    },
    motifs: [0, 1, 4, 5],
  },
  warm: {
    instruments: { lead: 73, keys: 0, pad: 48, bass: 32 },
    keys: 'broken',
    bass: 'root5',
    drums: {
      mid: { kick: 'x.......x.......', hat: '....o.......o...' },
      high: { kick: 'x.......x..x....', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.' },
    },
    motifs: [2, 3, 6],
  },
  fairytale: {
    instruments: { lead: 9, keys: 0, pad: 49, bass: 32 },
    keys: 'arp',
    bass: 'root5',
    drums: {
      mid: { hat: 'o...o...o...o...' },
      high: { kick: 'x.......x.......', snare: '........x.......', hat: 'o.o.o.o.o.o.o.o.' },
    },
    motifs: [0, 4],
  },
  suspense: {
    instruments: { lead: null, keys: 46, pad: 95, bass: 38 },
    keys: 'arp',
    bass: 'pulse8',
    drums: {
      mid: { kick: 'x...x...x...x...' },
      high: { kick: 'x...x...x...x.x.', snare: '............x...', hat: '..o...o...o...o.' },
    },
    motifs: [3, 2],
  },
  anthem: {
    instruments: { lead: 60, keys: 0, pad: 48, bass: 33 },
    keys: 'stabs',
    bass: 'pulse8',
    drums: {
      mid: { kick: 'x...x...x...x...', hat: '..o...o...o...o.' },
      high: { kick: 'X...x...X...x...', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
    },
    motifs: [6, 0],
  },
  lofi: {
    instruments: { lead: 11, keys: 4, pad: 89, bass: 32 },
    keys: 'pulse',
    bass: 'lofi',
    drums: {
      mid: { kick: 'x.........x.....', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.' },
      high: { kick: 'x.....x...x.....', snare: '....X.......X...', hat: 'x.o.x.o.x.o.x.o.' },
    },
    motifs: [5, 3],
    swing: 0.62,
    soft: 0.85,
  },
}
export const DEFAULT_STYLE = 'pop'

/** Lead program when a style has no melody but the agent wrote one (flute). */
const WRITTEN_LEAD = 73

/**
 * General MIDI programs for each part: the style's, overridden by music.instruments (null = silent).
 * A style without a lead still plays a melody the agent wrote, unless instruments.lead says null.
 */
export function instrumentsFor(music) {
  const programs = { ...STYLES[music.style ?? DEFAULT_STYLE].instruments, ...music.instruments }
  if (programs.lead === null && music.instruments?.lead === undefined && music.sections?.some((s) => s.melody)) programs.lead = WRITTEN_LEAD
  return programs
}

// --- Written melodies ---
//
// One token per note: pitch and octave, then "/" and the length as a fraction of a whole note,
// optionally dotted: C5/4 (quarter), F#4/8 (eighth), Bb4/2. (dotted half), r/4 (quarter rest).
// "|" separates bars; every bar must add up to a whole 4/4 bar. C4 is middle C (MIDI 60).

const LENGTHS = { 1: 16, 2: 8, 4: 4, 8: 2, 16: 1 }
export const MELODY_RANGE = [55, 91]

/**
 * Parses a written melody into bars of notes { s, len, n } (sixteenths; n null for rests).
 * Throws a UsageError naming the bar and token for anything that cannot be played.
 */
export function parseMelody(text, where = 'melody') {
  const bars = text.split('|').map((b) => b.trim())
  if (bars.at(-1) === '') bars.pop()
  if (bars.every((b) => b === '')) throw new UsageError(`${where} is empty`)
  return bars.map((bar, i) => {
    let s = 0
    const notes = bar.split(/\s+/).filter(Boolean).map((token) => {
      const m = /^(?:([A-G])([#b]?)(\d)|(r))\/(1|2|4|8|16)(\.?)$/.exec(token)
      if (!m) throw new UsageError(`${where} bar ${i + 1}: cannot read "${token}" (write notes like C5/4, F#4/8, Bb4/2., rests like r/4)`)
      const len = LENGTHS[m[5]] * (m[6] ? 1.5 : 1)
      if (!Number.isInteger(len)) throw new UsageError(`${where} bar ${i + 1}: "${token}" is shorter than a sixteenth`)
      const n = m[4] ? null : (Number(m[3]) + 1) * 12 + pitchClass(m[1], m[2])
      if (n !== null && (n < MELODY_RANGE[0] || n > MELODY_RANGE[1])) throw new UsageError(`${where} bar ${i + 1}: ${token} is outside G3–G6`)
      const note = { s, len, n }
      s += len
      return note
    })
    if (s !== 16) throw new UsageError(`${where} bar ${i + 1}: adds up to ${s / 4} beats, a bar needs 4`)
    return notes
  })
}

/**
 * Notes on beat 1 or 3, a quarter or longer, that clash with the chord (a semitone from a chord
 * tone without being one). Returned as warnings; the agent may mean them.
 */
function clashes(bars, chords, where) {
  const out = []
  bars.forEach((notes, i) => {
    const chord = parseChord(chords[i % chords.length])
    for (const { s, len, n } of notes) {
      if (n === null || (s !== 0 && s !== 8) || len < 4 || chord.pcs.includes(n % 12)) continue
      if (chord.pcs.some((pc) => Math.abs(((n - pc + 6) % 12 + 12) % 12 - 6) === 1)) {
        out.push(`${where} bar ${i + 1}: ${NAMES[n % 12]}${Math.floor(n / 12) - 1} on beat ${s / 4 + 1} clashes with ${chords[i % chords.length]}`)
      }
    }
  })
  return out
}
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

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

/** Puts pitch class `pc` in [lo, lo + 12). */
const place = (pc, lo) => lo + ((((pc - lo) % 12) + 12) % 12)
/** The note with pitch class `pc` closest to `target`. */
const nearest = (pc, target) => place(pc, target - 6)

/**
 * Close-position voicing of `chord` (lowest note in [52, 64)) that moves least from `prev`:
 * every inversion is tried, so consecutive chords share or step to nearby notes.
 */
export function voiceLead(chord, prev) {
  const candidates = chord.pcs.map((_, k) => {
    const order = [...chord.pcs.slice(k), ...chord.pcs.slice(0, k)]
    const notes = [place(order[0], 52)]
    for (const pc of order.slice(1)) notes.push(place(pc, notes.at(-1) + 1))
    return notes
  })
  if (!prev) return candidates.reduce((a, c) => (Math.abs(avg(c) - 60) < Math.abs(avg(a) - 60) ? c : a))
  const cost = (c) => c.reduce((s, n) => s + Math.min(...prev.map((p) => Math.abs(p - n))), 0)
  return candidates.reduce((a, c) => (cost(c) < cost(a) ? c : a))
}
const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length

/** Velocity for a drum grid character. */
const HIT = { X: 112, x: 88, o: 52 }

/**
 * Writes the parts for `sections` (bars resolved) in `music.style`. Energy decides how much plays:
 * below 0.3 only the pad; from 0.3 bass, keys and the medium drum grid; from 0.6 the high grid and
 * the melody; from 0.85 the melody moves up. Sections build into louder ones (crescendo, a fill, a
 * crash) and an ending fades and holds the last chord. Returns { events, duration, beat }.
 */
export function compose(music, sections) {
  const style = STYLES[music.style ?? DEFAULT_STYLE]
  const r = rng(music.seed ?? 1)
  const beat = 60 / music.bpm
  const bar = beat * 4
  const step = beat / 4
  const swing = ((style.swing ?? 0.5) - 0.5) * beat
  const soft = style.soft ?? 1
  const scale = parseKey(music.key)
  const parts = instrumentsFor(music)
  const warnings = []
  // Written melodies, parsed up front so errors name the section before anything is rendered
  const written = sections.map((sec, i) => {
    if (!sec.melody) return null
    const where = `music.sections[${i}].melody`
    const bars = parseMelody(sec.melody, where)
    if (bars.length > sec.bars) warnings.push(`${where} has ${bars.length} bars but the section has ${sec.bars}; the rest is not played`)
    warnings.push(...clashes(bars.slice(0, sec.bars), sec.chords, where))
    return bars
  })
  const drums = music.drums ?? true
  const events = []

  /** Adds a note at sixteenth `s` of the bar starting at `t0`; off-beat eighths swing. */
  const add = (track, t0, s, d, n, v) => {
    if (DRUM_TRACKS.includes(track) ? !drums : parts[track] === null) return
    const humanize = track === 'pad' || s === 0 ? 0 : (r() - 0.5) * 0.012
    const t = Math.max(0, t0 + s * step + (s % 4 === 2 ? swing : 0) + humanize)
    events.push({ track, t, d, n, v: Math.max(1, Math.min(127, Math.round(v * soft + (r() - 0.5) * 12))) })
  }

  const motifSet = style.motifs.map((i) => MOTIFS[i])
  const motifA = motifSet[Math.floor(r() * motifSet.length)]
  const motifB = r() < 0.5 ? motifA : motifSet[Math.floor(r() * motifSet.length)]
  let barIdx = 0
  let prevVoicing = null
  let prevMel = 69
  let ended = false

  sections.forEach((sec, si) => {
    const prev = sections[si - 1]
    const next = sections[si + 1]
    const e = sec.energy
    const level = e >= 0.6 ? 'high' : e >= 0.3 ? 'mid' : null
    const lift = e >= 0.85 ? 5 : 0

    for (let b = 0; b < sec.bars; b++, barIdx++) {
      const t0 = barIdx * bar
      const first = events.length
      const chord = parseChord(sec.chords[b % sec.chords.length])
      const nextChord = b + 1 < sec.bars ? parseChord(sec.chords[(b + 1) % sec.chords.length]) : next ? parseChord(next.chords[0]) : chord
      const lastBar = b === sec.bars - 1
      const ending = sec.ending && lastBar
      const voicing = voiceLead(chord, prevVoicing)
      prevVoicing = voicing
      const bassRoot = place(chord.root, 36)
      // An ending section fades towards its last bar
      const fade = sec.ending ? 1 - (0.25 * b) / Math.max(1, sec.bars - 1) : 1
      ended = ending

      for (const n of voicing) add('pad', t0, 0, ending ? bar * 1.5 : bar, n, (48 + e * 30) * fade)

      if (written[si]) {
        // The agent's melody plays whatever the energy, cycling when shorter than the section
        for (const { s, len, n } of written[si][b % written[si].length]) {
          if (n === null) continue
          add('lead', t0, s, len * step * 0.95, n, (s % 8 === 0 ? 90 : s % 4 === 0 ? 82 : 74) * fade)
          prevMel = n
        }
      }

      if (ending) {
        for (const n of [...voicing, voicing[0] + 12]) add('keys', t0, 0, bar * 1.5, n, 68 * fade)
        add('bass', t0, 0, bar * 1.5, bassRoot, 88)
        add('kick', t0, 0, 0.3, GM_DRUMS.kick, 96)
        if (prev && prev.energy >= 0.6) add('crash', t0, 0, 1.5, GM_DRUMS.crash, 70)
        continue
      }
      if (!level) continue

      // Crash where a section lifts into high energy
      if (level === 'high' && b === 0 && (!prev || prev.energy < e)) add('crash', t0, 0, 1.5, GM_DRUMS.crash, 92)

      keysPattern(style.keys, level, voicing, (s, d, n, v) => add('keys', t0, s, d * step, n, v * fade))

      for (const [s, len, what] of BASS[style.bass][level]) {
        let n = bassRoot
        if (what === '5') n = bassRoot + 7
        else if (what === '8') n = bassRoot + 12
        else if (what === 'a') n = nextChord.root === chord.root ? bassRoot + 7 : approach(nextChord.root, scale, bassRoot)
        add('bass', t0, s, len * step * 0.95, n, (level === 'high' ? 92 : 80) * fade)
      }

      const grid = style.drums[level]
      const fill = lastBar && next && !next.ending && next.energy >= e && next.energy >= 0.6
      const variation = level === 'high' && b % 4 === 3 && !lastBar
      for (const [track, pattern] of Object.entries(grid)) {
        for (let s = 0; s < 16; s++) {
          if (fill && s >= 12 && track !== 'kick') continue
          const c = pattern[s]
          if (HIT[c]) add(track, t0, s, track === 'hat' ? 0.05 : 0.25, GM_DRUMS[track], HIT[c] * fade)
        }
      }
      if (variation && grid.kick) add('kick', t0, 14, 0.25, GM_DRUMS.kick, 78)
      if (fill) for (const [k, s] of [12, 13, 14, 15].entries()) add('snare', t0, s, 0.1, GM_DRUMS.snare, 64 + k * 14)

      if (level === 'high' && !written[si]) {
        prevMel = melody(b, sec, chord, scale, prevMel, lift, b % 4 < 2 ? motifA : motifB, (s, d, n, v) => add('lead', t0, s, d * step, n, v), r)
      }

      // Crescendo into a louder section
      if (lastBar && next && next.energy > e) {
        for (const ev of events.slice(first)) ev.v = Math.min(127, Math.round(ev.v * (0.85 + (0.3 * (ev.t - t0)) / bar)))
      }
    }
  })

  // An ending rings out for half a bar more; otherwise the music stops at the last bar line.
  const duration = barIdx * bar + (ended ? bar * 1.5 : 0)
  return { events: events.sort((a, b) => a.t - b.t || a.n - b.n), duration, beat, warnings }
}

/** The keys (piano) part for one bar: play(sixteenth, lengthInSixteenths, note, velocity). */
function keysPattern(kind, level, voicing, play) {
  const top = [...voicing, voicing[0] + 12]
  if (kind === 'pulse') {
    const hits = level === 'high' ? [[0, 5], [6, 4], [10, 2], [12, 4]] : [[0, 7], [8, 7]]
    for (const [s, d] of hits) for (const n of voicing) play(s, d, n, level === 'high' ? 78 : 64)
  } else if (kind === 'broken') {
    // Broken chord in eighths (quarters at medium energy), each note left to ring
    const order = [0, 2, 1, 2, 0, 2, 1, 3]
    const every = level === 'high' ? 2 : 4
    for (let s = 0; s < 16; s += every) play(s, every * 1.8, top[order[(s / every) % order.length] % top.length], s === 0 ? 74 : 60)
  } else if (kind === 'arp') {
    const order = [0, 1, 2, 3, 2, 1, 2, 3]
    const every = level === 'high' ? 2 : 4
    for (let s = 0; s < 16; s += every) play(s, every * 1.5, top[order[(s / every) % order.length] % top.length] + 12, s === 0 ? 72 : 58)
  } else if (kind === 'stabs') {
    const hits = level === 'high' ? [0, 4, 8, 12] : [0, 8]
    for (const s of hits) for (const n of voicing) play(s, level === 'high' ? 2.5 : 7, n, s === 0 ? 84 : 72)
  }
}

/** A scale note just below `targetPc`, near `around` (a bass line stepping into the next chord). */
function approach(targetPc, scale, around) {
  const target = place(targetPc, around - 5)
  for (let n = target - 1; n >= target - 2; n--) if (scale.includes(((n % 12) + 12) % 12)) return n
  return target - 1
}

/**
 * One bar of melody. Two bars of rhythm (`motif`) make a half-phrase; a phrase is a question
 * (ending on the 3rd or 5th) and an answer (ending on the root, also at the end of a section).
 * Pitches follow an arch over the phrase: on the beat the chord tone nearest the arch, off the beat
 * one scale step towards it. Returns the last note played.
 */
function melody(b, sec, chord, scale, prevMel, lift, motif, play, r) {
  const half = b % 2
  const unit = Math.floor(b / 2)
  const answer = unit % 2 === 1 || b >= sec.bars - 2
  const low = 64 + lift
  const high = 84 + lift
  for (const [pos, len] of motif) {
    if (Math.floor(pos / 8) !== half) continue
    const inPhrase = ((b % 4) * 8 + (pos % 8)) / 32
    const arch = 69 + lift + Math.round(5 * Math.sin(Math.PI * inPhrase))
    const lastNote = half === 1 && pos === motif.at(-1)[0]
    let n
    if (lastNote) {
      const pcs = answer ? [chord.root] : chord.pcs.slice(1)
      n = pcs.map((pc) => nearest(pc, prevMel)).reduce((a, c) => (Math.abs(c - prevMel) < Math.abs(a - prevMel) ? c : a))
    } else if (pos % 4 === 0) {
      n = chord.pcs.map((pc) => nearest(pc, arch)).reduce((a, c) => (Math.abs(c - prevMel) + Math.abs(c - arch) < Math.abs(a - prevMel) + Math.abs(a - arch) ? c : a))
    } else {
      const dir = arch > prevMel ? 1 : arch < prevMel ? -1 : r() < 0.5 ? -1 : 1
      n = prevMel + dir
      while (!scale.includes(((n % 12) + 12) % 12)) n += dir
    }
    n = Math.max(low, Math.min(high, n))
    play((pos % 8) * 2, len * 2 * 0.95, n, lastNote ? 80 : pos % 4 === 0 ? 88 : 76)
    prevMel = n
  }
  return prevMel
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
 * `programs` are the General MIDI programs per part (instrumentsFor); `only` keeps a single part
 * ('lead', 'keys', 'pad', 'bass' or 'drums'), for rendering stems.
 */
export function toMidi({ events, beat }, programs, only = null) {
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
