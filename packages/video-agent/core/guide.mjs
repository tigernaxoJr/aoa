// Guide API access (SPEC §5) for the MCP server: the site's static files, read from a local copy
// when available (offline), otherwise fetched from the site. Also downloads and unpacks the project
// template for create_project, verifying its SHA-256 against the manifest (SPEC §11).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'
import { AgentError } from './project.mjs'

export const DEFAULT_SITE_URL = 'https://tigernaxojr.github.io/index-url-director'

export function siteUrl() {
  return (process.env.VIDEO_AGENT_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '')
}

/**
 * Local directory laid out like the site's /api/video: $VIDEO_AGENT_GUIDE_DIR, the copy bundled into the
 * package at pack time (guide/), or this repository's dist/api/video after `pnpm run build`.
 */
function localGuideDir() {
  const candidates = [
    process.env.VIDEO_AGENT_GUIDE_DIR,
    fileURLToPath(new URL('../guide/', import.meta.url)),
    fileURLToPath(new URL('../../../dist/api/video/', import.meta.url)),
  ].filter(Boolean)
  return candidates.find((dir) => existsSync(join(dir, 'index.json'))) ?? null
}

/** Reads `path` (relative to /api/video) as a Buffer. */
export async function guideFile(path) {
  const dir = localGuideDir()
  if (dir) {
    const file = join(dir, path)
    if (existsSync(file)) return readFileSync(file)
  }
  const url = `${siteUrl()}/api/video/${path}`
  let res
  try {
    res = await fetch(url)
  } catch (err) {
    throw new AgentError(`cannot reach ${url}: ${err.message}`)
  }
  if (!res.ok) throw new AgentError(`${url}: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

export const guideText = async (path) => (await guideFile(path)).toString('utf8')

/**
 * Downloads the template into `dir` (must be empty or missing) after checking the zip against the
 * manifest hash. Returns the manifest.
 */
export async function unpackTemplate(dir) {
  if (existsSync(dir) && readdirSync(dir).length) throw new AgentError(`${dir} is not empty; choose an empty or new directory`)
  const manifest = JSON.parse(await guideText('templates/product-video/manifest.json'))
  const zip = await guideFile('templates/product-video.zip')
  const actual = createHash('sha256').update(zip).digest('hex')
  if (actual !== manifest.zip.sha256) {
    throw new AgentError(`template checksum mismatch (expected ${manifest.zip.sha256}, got ${actual}); not using it`)
  }
  for (const [path, data] of Object.entries(unzipSync(new Uint8Array(zip)))) {
    if (path.endsWith('/')) continue
    if (path.split('/').includes('..')) throw new AgentError(`template entry ${path} leaves the project`)
    const file = join(dir, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, data)
  }
  return manifest
}
