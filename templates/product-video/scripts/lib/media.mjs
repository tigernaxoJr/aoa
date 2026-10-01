// FFmpeg / ffprobe access. Resolution order: env override → system PATH → bundled binaries (ffmpeg-static).
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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

/**
 * Returns { path, source } for 'ffmpeg' or 'ffprobe'. ffprobe prefers the bundled copy: versions
 * disagree on MP3 length (newer ones drop encoder padding), which would change scene durations
 * from one machine to the next.
 */
export function locate(name) {
  if (cache[name]) return cache[name]
  const env = process.env[`VIDEO_AGENT_${name.toUpperCase()}`]
  const system = { path: name, source: 'system' }
  const pkg = bundled(name) && { path: bundled(name), source: 'bundled' }
  const candidates = [env && { path: env, source: 'env' }, ...(name === 'ffprobe' ? [pkg, system] : [system, pkg])].filter(Boolean)
  for (const c of candidates) {
    if (works(c.path)) return (cache[name] = c)
  }
  throw new UsageError(
    `${name} not found. Install FFmpeg (winget install Gyan.FFmpeg / brew install ffmpeg / apt install ffmpeg), ` +
      `or run pnpm install to get the bundled copy.`,
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
export function ffmpegStream(args, { cwd } = {}) {
  const { path } = locate('ffmpeg')
  const child = spawn(path, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] })
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

/**
 * Video filter that converts a variable-frame-rate recording to `fps` and drops the given
 * [start, end] spans (seconds), closing the gaps.
 */
export function cutFilter(cuts, fps) {
  if (!cuts.length) return `fps=${fps}`
  const drop = cuts.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join('+')
  return `fps=${fps},select='not(${drop})',setpts=N/(${fps}*TB)`
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

/**
 * Identifies how the first video stream is encoded: two files with the same signature can be
 * stream-copied into one. Includes the mp4 `avcC` box (SPS/PPS), which a copy keeps only from
 * the first file.
 */
export function videoSignature(file) {
  const { path } = locate('ffprobe')
  const r = spawnSync(path, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,profile,level,width,height,pix_fmt,r_frame_rate,time_base,sample_aspect_ratio,color_range,color_space,color_transfer,color_primaries', '-of', 'json', file], {
    encoding: 'utf8',
    windowsHide: true,
  })
  const stream = r.status === 0 && JSON.parse(r.stdout).streams?.[0]
  if (!stream) throw new Error(`ffprobe cannot read the video stream of ${file}: ${r.stderr.trim()}`)
  const data = readFileSync(file)
  const at = data.indexOf('avcC')
  const avcC = at >= 4 ? data.subarray(at, at - 4 + data.readUInt32BE(at - 4)).toString('hex') : ''
  return JSON.stringify({ ...stream, avcC })
}

/** Keyframe positions of the first video stream, as frame numbers at `fps`. */
export function keyframes(file, fps) {
  const { path } = locate('ffprobe')
  const r = spawnSync(path, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,flags', '-of', 'csv=p=0', file], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0) throw new Error(`ffprobe cannot read the packets of ${file}: ${r.stderr.trim()}`)
  const packets = r.stdout.trim().split('\n').map((line) => line.split(',')).map(([pts, flags]) => ({ pts: Number(pts), key: flags.includes('K') }))
  const first = Math.min(...packets.map((p) => p.pts))
  return packets.filter((p) => p.key).map((p) => Math.round((p.pts - first) * fps)).sort((a, b) => a - b)
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
/** Filter converting RGB frames (screenshots) to BT.709 limited range matching VIDEO_ENCODE tags. */
export const RGB_TO_BT709 = 'scale=out_color_matrix=bt709:out_range=tv'
export const AUDIO_ENCODE = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2']
