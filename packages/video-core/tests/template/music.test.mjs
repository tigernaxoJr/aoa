// Generated music: the composer and MIDI writer (pure), and music.mjs against temp projects.
// music.mjs runs with VIDEO_AGENT_FAKE_MUSIC=1 (a tone, no browser) except for one real webaudio
// render; the fluidsynth render runs only where FluidSynth and the default SoundFont are installed.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, test } from 'node:test'
import { STYLES, barSec, compose, instrumentsFor, parseChord, parseKey, parseMelody, partOf, resolveSections, toMidi, voiceLead } from '../../template/scripts/lib/music.mjs'
import { findFluidSynth } from '../../template/scripts/lib/music-engines.mjs'
import { baseProject, makeProject } from './helpers.mjs'

const require = createRequire(import.meta.url)
const ffprobe = require('ffprobe-static').path
const ffmpegBin = require('ffmpeg-static')
const duration = (file) => Number(spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout)
const meanVolume = (file) => Number(/mean_volume: (-?[\d.]+) dB/.exec(spawnSync(ffmpegBin, ['-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr)[1])

const MUSIC = {
  bpm: 120,
  key: 'C',
  seed: 3,
  sections: [
    { name: 'intro', bars: 2, chords: ['C', 'G'], energy: 0.2 },
    { name: 'main', bars: 4, chords: ['F', 'G', 'Am', 'C'], energy: 0.8 },
    { name: 'outro', bars: 2, chords: ['F', 'C'], energy: 0.4, ending: true },
  ],
}
const tracks = (song) => new Set(song.events.map((e) => e.track))

describe('composer', () => {
  test('chords and keys', () => {
    assert.deepEqual(parseChord('C'), { root: 0, pcs: [0, 4, 7] })
    assert.deepEqual(parseChord('F#m'), { root: 6, pcs: [6, 9, 1] })
    assert.deepEqual(parseChord('Bb7').pcs, [10, 2, 5, 8])
    assert.deepEqual(parseChord('Em7').pcs, [4, 7, 11, 2])
    assert.deepEqual(parseChord('Cmaj7').pcs, [0, 4, 7, 11])
    assert.deepEqual(parseKey('Am'), [9, 11, 0, 2, 4, 5, 7])
    assert.deepEqual(parseKey('G'), [7, 9, 11, 0, 2, 4, 6])
    assert.throws(() => parseChord('H'), /cannot read chord/)
    assert.throws(() => parseKey('Cmaj'), /cannot read key/)
  })

  test('same seed, same music; another seed, another melody', () => {
    const a = compose(MUSIC, MUSIC.sections)
    assert.deepEqual(compose(MUSIC, MUSIC.sections), a)
    const b = compose({ ...MUSIC, seed: 4 }, MUSIC.sections)
    assert.notDeepEqual(b.events, a.events)
  })

  test('length is the bars, plus a ring-out when the music ends', () => {
    const bar = barSec(120)
    assert.equal(compose(MUSIC, MUSIC.sections).duration, 8 * bar + 1.5 * bar)
    const noEnding = MUSIC.sections.map(({ ending, ...s }) => s)
    assert.equal(compose(MUSIC, noEnding).duration, 8 * bar)
  })

  test('energy shapes the arrangement', () => {
    const song = compose(MUSIC, MUSIC.sections)
    const bar = barSec(120)
    const intro = song.events.filter((e) => e.t < 2 * bar)
    assert.deepEqual(tracks({ events: intro }), new Set(['pad']), 'below 0.3 only the pad plays')
    const main = song.events.filter((e) => e.t >= 2 * bar && e.t < 6 * bar)
    for (const t of ['lead', 'keys', 'pad', 'bass', 'kick', 'snare', 'hat', 'crash']) assert.ok(tracks({ events: main }).has(t), `main has ${t}`)
    assert.ok(main.some((e) => e.track === 'crash' && Math.abs(e.t - 2 * bar) < 1e-9), 'crash where the music lifts')
    // The ending bar: one kick, chords held
    const last = song.events.filter((e) => e.t >= 7 * bar)
    assert.equal(last.filter((e) => e.track === 'kick').length, 1)
    assert.ok(last.filter((e) => e.track === 'keys').every((e) => e.d === 1.5 * bar))
  })

  test('every style composes, with its own instruments and grooves', () => {
    const seen = new Set()
    for (const style of Object.keys(STYLES)) {
      const song = compose({ ...MUSIC, style }, MUSIC.sections)
      assert.ok(song.events.length > 50, style)
      assert.ok(song.events.every((e) => e.t >= 0 && e.d > 0 && e.v >= 1 && e.v <= 127 && Number.isInteger(e.n)), style)
      const groove = song.events.filter((e) => e.track === 'kick').map((e) => e.t.toFixed(2)).join()
      seen.add(groove)
      assert.deepEqual(instrumentsFor({ style }), STYLES[style].instruments)
    }
    assert.ok(seen.size >= 5, 'kick patterns differ between styles')
    assert.ok(!tracks(compose({ ...MUSIC, style: 'suspense' }, MUSIC.sections)).has('lead'), 'suspense has no melody by default')
    assert.ok(tracks(compose({ ...MUSIC, style: 'suspense', instruments: { lead: 73 } }, MUSIC.sections)).has('lead'))
  })

  test('lofi swings the off-beat eighths', () => {
    const beat = 0.5
    const hats = compose({ ...MUSIC, style: 'lofi' }, MUSIC.sections).events.filter((e) => e.track === 'hat')
    const offbeats = hats.map((e) => (e.t / beat) % 1).filter((f) => f > 0.3 && f < 0.9)
    assert.ok(offbeats.length > 0 && offbeats.every((f) => f > 0.55), `off-beats land late: ${offbeats.slice(0, 4)}`)
  })

  test('chords move to the nearest inversion', () => {
    const c = voiceLead(parseChord('C'), null)
    const f = voiceLead(parseChord('F'), c)
    const moved = f.reduce((s, n) => s + Math.min(...c.map((p) => Math.abs(p - n))), 0)
    assert.ok(moved <= 3, `C ${c} → F ${f} moves ${moved} semitones`)
    assert.ok(f.includes(60), 'the common tone C stays')
  })

  test('a section ends its melody on the chord root', () => {
    const music = { ...MUSIC, sections: [{ bars: 4, chords: ['F', 'G', 'Am', 'C'], energy: 0.8 }] }
    const lead = compose(music, music.sections).events.filter((e) => e.track === 'lead')
    assert.equal(lead.at(-1).n % 12, 0)
  })

  test('parts can be left out', () => {
    const song = compose({ ...MUSIC, drums: false, instruments: { lead: null } }, MUSIC.sections)
    for (const t of ['kick', 'snare', 'hat', 'lead']) assert.ok(!tracks(song).has(t), `${t} is silent`)
    assert.ok(tracks(song).has('keys'))
  })

  test('sections aligned to scenes end on the nearest bar line of the next scene', () => {
    const bar = barSec(120) // 2 s
    const timeline = { items: [{ start: 0 }, { start: 4.9 }, { start: 11.2 }], total: 15 }
    const order = ['scene-001', 'scene-002', 'scene-003']
    const music = {
      ...MUSIC,
      sections: [
        { scenes: ['scene-001'], chords: ['C'], energy: 0.3 },
        { scenes: ['scene-002'], chords: ['F'], energy: 0.8 },
        { scenes: ['scene-003'], chords: ['C'], energy: 0.3, ending: true },
      ],
    }
    const bars = resolveSections(music, { timeline, order }).map((s) => s.bars)
    // Boundaries at round(4.9/2)=2, round(11.2/2)=6, round(15/2)=8 bars
    assert.deepEqual(bars, [2, 4, 2])
    assert.equal(bar, 2)
    assert.throws(() => resolveSections(music, {}), /render them first/)
    assert.throws(() => resolveSections({ ...music, sections: [{ scenes: ['scene-009'], chords: ['C'], energy: 1 }] }, { timeline, order }), /not in video.project.json/)
  })
})

describe('written melody', () => {
  // The example in skills/rendering-guide.md#melody
  const EXAMPLE = 'A4/4 C5/8 D5/8 F5/2 | E5/4. D5/8 C5/2 | D5/8 E5/8 F5/4 A5/4 G5/8 F5/8 | F5/2. r/4'

  test('notation', () => {
    const [bar] = parseMelody('C4/4 F#4/8 Bb4/8 r/4 G6/4')
    assert.deepEqual(bar, [{ s: 0, len: 4, n: 60 }, { s: 4, len: 2, n: 66 }, { s: 6, len: 2, n: 70 }, { s: 8, len: 4, n: null }, { s: 12, len: 4, n: 91 }])
    assert.deepEqual(parseMelody('E5/4. D5/16 D5/16 C5/2 |')[0].map((n) => n.len), [6, 1, 1, 8])
    assert.equal(parseMelody(EXAMPLE).length, 4)
    assert.throws(() => parseMelody('C5/4 D5/4 | E5/1', 'm'), /m bar 1: adds up to 2 beats/)
    assert.throws(() => parseMelody('C5/1 | C5/4 H5/4 C5/2'), /bar 2: cannot read "H5\/4"/)
    assert.throws(() => parseMelody('C3/1'), /outside G3–G6/)
    assert.throws(() => parseMelody('C5/16.'), /shorter than a sixteenth/)
    assert.throws(() => parseMelody(' | '), /empty/)
  })

  test('replaces the generated melody at any energy, cycling over the section', () => {
    const music = { ...MUSIC, style: 'warm', sections: [{ bars: 8, chords: ['F', 'C', 'Dm', 'Bb'], energy: 0.2, melody: EXAMPLE }] }
    const song = compose(music, music.sections)
    assert.deepEqual(song.warnings, [])
    const lead = song.events.filter((e) => e.track === 'lead')
    assert.equal(lead.length, 2 * 14, 'the four bars (14 notes) twice')
    assert.deepEqual(lead.slice(0, 4).map((e) => e.n), [69, 72, 74, 77])
    assert.ok(Math.abs(lead[14].t - 4 * barSec(120)) < 0.01, 'second time round starts at bar 5')
  })

  test('warnings for clashes and extra bars; flute when the style has no lead', () => {
    const music = { ...MUSIC, sections: [{ bars: 1, chords: ['C'], energy: 0.8, melody: 'B4/2 C5/2 | C5/1' }] }
    assert.deepEqual(compose(music, music.sections).warnings, [
      'music.sections[0].melody has 2 bars but the section has 1; the rest is not played',
      'music.sections[0].melody bar 1: B4 on beat 1 clashes with C',
    ])
    const sections = [{ bars: 1, chords: ['Am'], energy: 0.8, melody: 'A4/1' }]
    assert.equal(instrumentsFor({ style: 'suspense', sections }).lead, 73)
    assert.equal(instrumentsFor({ style: 'suspense', sections, instruments: { lead: null } }).lead, null)
    assert.equal(instrumentsFor({ style: 'suspense', sections: [] }).lead, null)
  })
})

describe('MIDI', () => {
  /** Splits a MIDI file into its chunks and checks every length adds up. */
  const chunks = (buf) => {
    const out = []
    for (let i = 0; i < buf.length; ) {
      const type = buf.toString('latin1', i, i + 4)
      const len = buf.readUInt32BE(i + 4)
      out.push({ type, data: buf.subarray(i + 8, i + 8 + len) })
      i += 8 + len
    }
    return out
  }

  test('one track per part, plus the tempo track', () => {
    const song = compose(MUSIC, MUSIC.sections)
    const midi = chunks(toMidi(song, instrumentsFor(MUSIC)))
    assert.equal(midi[0].type, 'MThd')
    assert.equal(midi[0].data.readUInt16BE(0), 1, 'format 1')
    assert.equal(midi[0].data.readUInt16BE(2), 6, 'tempo + lead, keys, pad, bass, drums')
    assert.ok(midi.slice(1).every((c) => c.type === 'MTrk' && c.data.subarray(-3).equals(Buffer.from([0xff, 0x2f, 0]))))
    // 120 BPM = 500000 µs per quarter note
    assert.deepEqual([...midi[1].data.subarray(4, 7)], [0x07, 0xa1, 0x20])
  })

  test('a single part for stems; programs from instruments', () => {
    const song = compose(MUSIC, MUSIC.sections)
    const keys = chunks(toMidi(song, instrumentsFor({ ...MUSIC, instruments: { keys: 4 } }), 'keys'))
    assert.equal(keys[0].data.readUInt16BE(2), 2)
    assert.deepEqual([...keys[2].data.subarray(0, 3)], [0, 0xc1, 4], 'program change to 4 on channel 2')
    const drums = chunks(toMidi(song, instrumentsFor(MUSIC), 'drums'))
    assert.equal(drums[2].data[1], 0xb9, 'drums on channel 10, no program change')
    assert.equal(partOf('hat'), 'drums')
  })
})

describe('music.mjs', () => {
  let p
  let home
  afterEach(() => {
    p?.cleanup()
    if (home) rmSync(home, { recursive: true, force: true })
    p = home = null
  })
  /** A project with `music`; AOA_HOME points at an empty dir, so FluidSynth is never installed. */
  const setup = (music = MUSIC, scenes) => {
    const project = baseProject()
    project.project.audio = { bgm: null, music }
    p = makeProject({ project, scenes })
    home = mkdtempSync(join(tmpdir(), 'avp-aoa-'))
    return (args = [], env = { VIDEO_AGENT_FAKE_MUSIC: '1' }) => p.run('music.mjs', args, { AOA_HOME: home, SOUNDFONT: '', FLUIDSYNTH: '', ...env })
  }

  test('writes bgm.wav, the MIDI score and bgm.json; skips when unchanged', () => {
    const run = setup()
    const r = run()
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stdout, /FluidSynth is not installed, using webaudio/)
    assert.match(r.stdout, /"path":"\/project\/audio\/bgm","value":"assets\/music\/bgm.wav"/)
    const expected = compose(MUSIC, MUSIC.sections).duration
    assert.ok(Math.abs(duration(p.path('assets/music/bgm.wav')) - expected) < 0.05)
    assert.ok(existsSync(p.path('assets/music/song.mid')))
    const meta = p.read('assets/music/bgm.json')
    assert.equal(meta.engine, 'fake')
    assert.equal(meta.bars, 8)

    assert.match(run().stdout, /is up to date/)
    assert.match(run(['--force']).stdout, /music: fake/)
  })

  test('changing the score renders again', () => {
    const run = setup()
    assert.equal(run().code, 0)
    const project = p.read('video.project.json')
    project.project.audio.music.seed = 9
    p.write('video.project.json', project)
    assert.match(run().stdout, /music: fake/)
  })

  test('errors: no score, fluidsynth not installed, scenes not rendered, bad engine', () => {
    let run = setup(undefined)
    p.write('video.project.json', { ...p.read('video.project.json'), project: { ...p.read('video.project.json').project, audio: {} } })
    assert.match(run().stderr, /project.audio.music is not set/)
    p.cleanup()

    run = setup({ ...MUSIC, engine: 'fluidsynth' })
    let r = run([], {})
    assert.equal(r.code, 1)
    assert.match(r.stderr, /needs FluidSynth.*music:setup/)
    assert.match(run(['--engine', 'midi']).stderr, /--engine must be one of/)
    p.cleanup()

    run = setup({ ...MUSIC, sections: [{ scenes: ['scene-001'], chords: ['C'], energy: 0.5 }] }, [{ id: 'scene-001', dir: 'scenes/001-hook' }])
    r = run()
    assert.equal(r.code, 1)
    assert.match(r.stderr, /not every scene has been rendered/)
  })

  test('webaudio renders real audio', { timeout: 120_000 }, () => {
    const short = { ...MUSIC, sections: [{ bars: 2, chords: ['C', 'G'], energy: 0.8, ending: true }] }
    const run = setup(short)
    const r = run(['--engine', 'webaudio'], {})
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stdout, /music: webaudio/)
    const file = p.path('assets/music/bgm.wav')
    assert.ok(Math.abs(duration(file) - compose(short, short.sections).duration) < 0.05)
    assert.ok(meanVolume(file) > -40, 'not silent')
  })

  const fluid = findFluidSynth()
  test('fluidsynth renders stems with per-part SoundFonts', { skip: fluid.missing && `needs ${fluid.missing.join(', ')}`, timeout: 120_000 }, () => {
    const short = { ...MUSIC, soundfonts: { keys: 'Missing.sf2' }, mix: { drums: -6 }, sections: [{ bars: 2, chords: ['C', 'G'], energy: 0.8 }] }
    const project = baseProject()
    project.project.audio = { music: short }
    p = makeProject({ project })
    const r = p.run('music.mjs', ['--stems'])
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stdout, /fluidsynth \(5 stems/)
    assert.match(r.stderr, /using the default instead for keys: Missing.sf2/)
    for (const part of ['lead', 'keys', 'pad', 'bass', 'drums']) assert.ok(existsSync(p.path(`assets/music/stems/${part}.wav`)), part)
    assert.ok(meanVolume(p.path('assets/music/bgm.wav')) > -40)
    assert.equal(JSON.parse(readFileSync(p.path('assets/music/bgm.json'), 'utf8')).soundfonts.keys, 'GeneralUser-GS.sf2')
  })
})
