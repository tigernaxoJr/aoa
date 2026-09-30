// FFmpeg / ffprobe access. Resolution order: env override → system PATH → npm-bundled binaries.
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { UsageError } from './project.mjs'

const require = createRequire(import.meta.url)
const cache = {}

function works(bin) {
  const r = spawnSync(bin, ['-version'], { encoding: 'utf8', windowsHide: true })
  return r.status === 0
}

function bundled(name) {
  try {
    return name === 'ffmpeg' ? require('ffmpeg-static') : require('ffprobe-static').path
  } catch {
    return null
  }
}

/** Returns { path, source } for 'ffmpeg' or 'ffprobe'. */
export function locate(name) {
  if (cache[name]) return cache[name]
  const env = process.env[`VIDEO_AGENT_${name.toUpperCase()}`]
  const candidates = [
    env && { path: env, source: 'env' },
    { path: name, source: 'system' },
    bundled(name) && { path: bundled(name), source: 'bundled' },
  ].filter(Boolean)
  for (const c of candidates) {
    if (works(c.path)) return (cache[name] = c)
  }
  throw new UsageError(
    `${name} not found. Install FFmpeg (winget install Gyan.FFmpeg / brew install ffmpeg / apt install ffmpeg), ` +
      `or run npm install to get the bundled copy.`,
  )
}

/**
 * Runs ffmpeg with the given args (overwrite enabled, quiet). Throws with stderr tail on failure.
 * `cwd` lets filters reference files by bare name (avoids escaping Windows paths in filtergraphs).
 */
export function ffmpeg(args, { cwd } = {}) {
  const { path } = locate('ffmpeg')
  const r = spawnSync(path, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0) {
    const tail = (r.stderr || r.error?.message || '').trim().split('\n').slice(-5).join('\n')
    throw new Error(`ffmpeg failed: ${tail}`)
  }
}

/**
 * Starts ffmpeg with stdin open (for piped frames). Returns { write(buffer), finish() }:
 * write() respects backpressure; finish() closes stdin and resolves when ffmpeg exits cleanly.
 */
export function ffmpegStream(args) {
  const { path } = locate('ffmpeg')
  const child = spawn(path, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-4000)))
  const exited = new Promise((resolve) => child.on('close', resolve))
  const failure = () => new Error(`ffmpeg failed: ${stderr.trim().split('\n').slice(-5).join('\n')}`)
  child.stdin.on('error', () => {}) // EPIPE when ffmpeg dies early; reported by finish()
  return {
    async write(buffer) {
      if (child.exitCode !== null) throw failure()
      if (!child.stdin.write(buffer)) await new Promise((resolve) => child.stdin.once('drain', resolve))
    },
    async finish() {
      child.stdin.end()
      if ((await exited) !== 0) throw failure()
    },
    kill: () => child.kill(),
  }
}

/**
 * Normalizes a video layer to the project fps with exactly `frames` frames: trims to
 * [trimStart, trimEnd], drops audio, and holds the last frame when the source is shorter.
 */
export function normalizeVideo(src, { trimStart = 0, trimEnd = null, fps, frames }, out) {
  const span = frames / fps
  ffmpeg([
    '-ss', String(trimStart),
    ...(trimEnd != null ? ['-to', String(trimEnd)] : []),
    '-i', src,
    '-an',
    '-vf', `fps=${fps},tpad=stop_mode=clone:stop_duration=${span.toFixed(3)},scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1`,
    '-frames:v', String(frames),
    ...VIDEO_ENCODE,
    out,
  ])
}

/** Duration of the first video stream in seconds (container duration can include audio padding). */
export function probeVideoDuration(file) {
  const { path } = locate('ffprobe')
  const r = spawnSync(path, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0', file], {
    encoding: 'utf8',
    windowsHide: true,
  })
  const sec = Number.parseFloat(r.stdout)
  if (r.status !== 0 || !Number.isFinite(sec)) throw new Error(`ffprobe cannot read the video stream of ${file}: ${r.stderr.trim()}`)
  return sec
}

/** Media duration in seconds. */
export function probeDuration(file) {
  const { path } = locate('ffprobe')
  const r = spawnSync(path, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {
    encoding: 'utf8',
    windowsHide: true,
  })
  const sec = Number.parseFloat(r.stdout)
  if (r.status !== 0 || !Number.isFinite(sec)) throw new Error(`ffprobe cannot read ${file}: ${r.stderr.trim()}`)
  return sec
}

/** Encoding settings shared by every mp4 the pipeline produces, so scenes concatenate cleanly. */
export const VIDEO_ENCODE = [
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '20',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
]
/** Filter converting RGB frames (screenshots) to BT.709 limited range, matching VIDEO_ENCODE tags and Remotion's output. */
export const RGB_TO_BT709 = 'scale=out_color_matrix=bt709:out_range=tv'
export const AUDIO_ENCODE = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2']
