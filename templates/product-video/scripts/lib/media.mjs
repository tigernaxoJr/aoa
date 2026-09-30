// FFmpeg / ffprobe access. Resolution order: env override → system PATH → npm-bundled binaries.
import { spawnSync } from 'node:child_process'
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

/** Runs ffmpeg with the given args (overwrite enabled, quiet). Throws with stderr tail on failure. */
export function ffmpeg(args) {
  const { path } = locate('ffmpeg')
  const r = spawnSync(path, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0) {
    const tail = (r.stderr || r.error?.message || '').trim().split('\n').slice(-5).join('\n')
    throw new Error(`ffmpeg failed: ${tail}`)
  }
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
export const VIDEO_ENCODE = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '20']
export const AUDIO_ENCODE = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2']
