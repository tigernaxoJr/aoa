// pnpm run music:setup [--with <SoundFont>,…|all]   install FluidSynth + SoundFonts for `pnpm run music`
// pnpm run music:setup --list                       SoundFonts it knows, with size, license and whether installed
// Installs once per machine into ~/.aoa/ (AOA_HOME overrides), shared by every project, like CosyVoice.
// Downloads files; the agent asks the user first (AGENTS.md rule 11). No admin rights, no system changes.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { parseArgs, run } from './lib/cli.mjs'
import { DEFAULT_SOUNDFONT, SOUNDFONTS, aoaHome, findFluidSynthExe, soundfontDir, soundfontPath } from './lib/music-engines.mjs'
import { UsageError } from './lib/project.mjs'

const FLUIDSYNTH_WIN = {
  version: '2.6.1',
  url: 'https://github.com/FluidSynth/fluidsynth/releases/download/v2.6.1/fluidsynth-v2.6.1-win10-x64-cpp11.zip',
  sizeMB: 3,
}

run(async (argv) => {
  const { flags } = parseArgs(argv, { with: 1 })
  if (flags.list) {
    for (const [name, sf] of Object.entries(SOUNDFONTS)) {
      const state = soundfontPath(name) ? 'installed' : 'not installed'
      console.log(`${name}${sf.default ? ' (default)' : ''} — ${sf.title}, ${sf.sizeMB} MB, ${sf.license}; for ${sf.parts}; ${state}`)
    }
    console.log(`FluidSynth: ${findFluidSynthExe() ?? 'not installed'}`)
    return 0
  }

  const extra = !flags.with ? [] : flags.with === 'all' ? Object.keys(SOUNDFONTS) : flags.with.split(',').map((s) => s.trim())
  for (const name of extra) if (!SOUNDFONTS[name]) throw new UsageError(`unknown SoundFont ${name}; see pnpm run music:setup --list`)

  mkdirSync(aoaHome(), { recursive: true })
  await ensureFluidSynth()
  for (const name of new Set([DEFAULT_SOUNDFONT, ...extra])) await ensureSoundfont(name)
  console.log(`ready: pnpm run music uses FluidSynth (${aoaHome()})`)
  return 0
})

async function ensureFluidSynth() {
  const found = findFluidSynthExe()
  if (found) return console.log(`FluidSynth: ${found}`)
  if (process.platform !== 'win32') {
    throw new UsageError(
      'FluidSynth is not installed. Ask the user to install it (macOS: brew install fluid-synth; Debian/Ubuntu: sudo apt install fluidsynth), then run this again.',
    )
  }
  const dir = join(aoaHome(), 'fluidsynth')
  console.log(`downloading FluidSynth ${FLUIDSYNTH_WIN.version} (~${FLUIDSYNTH_WIN.sizeMB} MB) → ${dir}`)
  const tmp = mkdtempSync(join(aoaHome(), '.dl-'))
  try {
    const zip = join(tmp, 'fluidsynth.zip')
    await download(FLUIDSYNTH_WIN.url, zip)
    const out = join(tmp, 'x')
    extract(zip, out)
    // The zip holds one top-level folder with bin/, include/, lib/
    const top = readdirSync(out).map((n) => join(out, n)).find((p) => existsSync(join(p, 'bin')))
    if (!top) throw new Error('unexpected FluidSynth archive layout')
    rmSync(dir, { recursive: true, force: true })
    renameSync(top, dir)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  if (!findFluidSynthExe()) throw new Error(`FluidSynth was installed to ${dir} but does not run`)
  console.log(`FluidSynth: ${dir}`)
}

async function ensureSoundfont(name) {
  const sf = SOUNDFONTS[name]
  if (soundfontPath(name)) return console.log(`${name}: installed`)
  const target = join(soundfontDir(), name)
  mkdirSync(soundfontDir(), { recursive: true })
  console.log(`downloading ${sf.title} (~${sf.sizeMB} MB, ${sf.license}) → ${target}`)
  const tmp = mkdtempSync(join(aoaHome(), '.dl-'))
  try {
    const file = join(tmp, sf.archive ? 'archive' : name)
    await download(sf.url, file)
    let font = file
    if (sf.archive) {
      const out = join(tmp, 'x')
      extract(file, out)
      // Take the largest .sf2/.sf3 inside (archives may also hold a small demo or readme)
      font = walk(out).filter((p) => /\.sf[23]$/i.test(p)).sort((a, b) => statSync(b).size - statSync(a).size)[0]
      if (!font) throw new Error(`${sf.url} contains no SoundFont`)
    }
    renameSync(font, target)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

async function download(url, file) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`download failed (${res.status}): ${url}`)
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
}

/** zip / 7z / tar.* via tar: bsdtar on Windows (System32\tar.exe reads zip and 7z) and macOS; Linux needs bsdtar for 7z. */
function extract(archive, out) {
  mkdirSync(out, { recursive: true })
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'bsdtar'
  const r = spawnSync(tar, ['-xf', archive, '-C', out], { encoding: 'utf8', windowsHide: true })
  if (r.status !== 0) throw new Error(`cannot extract ${archive}: ${(r.stderr || r.error?.message || '').trim()}${process.platform === 'linux' ? ' (install libarchive-tools for bsdtar)' : ''}`)
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
}
