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
import { barSec, compose, parseChord, parseKey, partOf, resolveSections, toMidi } from '../../template/scripts/lib/music.mjs'
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
    for (const t of ['lead', 'keys', 'pad', 'bass', 'kick', 'snare', 'hat']) assert.ok(tracks({ events: main }).has(t), `main has ${t}`)
    // The ending bar: one kick, chords held
    const last = song.events.filter((e) => e.t >= 7 * bar)
    assert.equal(last.filter((e) => e.track === 'kick').length, 1)
    assert.ok(last.filter((e) => e.track === 'keys').every((e) => e.d === 1.5 * bar))
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
    const midi = chunks(toMidi(song))
    assert.equal(midi[0].type, 'MThd')
    assert.equal(midi[0].data.readUInt16BE(0), 1, 'format 1')
    assert.equal(midi[0].data.readUInt16BE(2), 6, 'tempo + lead, keys, pad, bass, drums')
    assert.ok(midi.slice(1).every((c) => c.type === 'MTrk' && c.data.subarray(-3).equals(Buffer.from([0xff, 0x2f, 0]))))
    // 120 BPM = 500000 µs per quarter note
    assert.deepEqual([...midi[1].data.subarray(4, 7)], [0x07, 0xa1, 0x20])
  })

  test('a single part for stems; programs from instruments', () => {
    const song = compose(MUSIC, MUSIC.sections)
    const keys = chunks(toMidi(song, { keys: 4 }, 'keys'))
    assert.equal(keys[0].data.readUInt16BE(2), 2)
    assert.deepEqual([...keys[2].data.subarray(0, 3)], [0, 0xc1, 4], 'program change to 4 on channel 2')
    const drums = chunks(toMidi(song, {}, 'drums'))
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
