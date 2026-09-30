// Remotion renderer (SPEC §7.6): bundles src/ once (cached by content), then renders the "Scene"
// composition with the plan as inputProps. Assets are loaded from the local project server.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { UsageError } from './project.mjs'

const require = createRequire(import.meta.url)

export async function renderRemotion({ root, plan, server, out, log }) {
  const { renderMedia, selectComposition } = await import('@remotion/renderer')
  const toSrc = (l) => {
    const { file, clip, ...rest } = l
    return clip || file ? { ...rest, src: server.url(clip ?? file) } : rest
  }
  const inputProps = {
    plan: {
      ...plan,
      background: toSrc(plan.background),
      elements: plan.elements.map(toSrc),
      audio: plan.audio && { src: server.url(plan.audio.file), durationSec: plan.audio.durationSec },
    },
  }

  const serveUrl = await cachedBundle(root, log)
  const browserExecutable = await remotionBrowser()
  const composition = await selectComposition({ serveUrl, id: 'Scene', inputProps, browserExecutable, logLevel: 'error' })
  let reported = 0
  await renderMedia({
    composition,
    serveUrl,
    inputProps,
    codec: 'h264',
    outputLocation: out,
    browserExecutable,
    crf: 20,
    x264Preset: 'medium',
    pixelFormat: 'yuv420p',
    colorSpace: 'bt709',
    audioCodec: 'aac',
    audioBitrate: '192k',
    enforceAudioTrack: true, // silent scenes still get an audio stream, so assemble can concat
    logLevel: 'error',
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 10) * 10
      if (pct > reported) log(`  ${(reported = pct)}%`)
    },
  })
}

/** Bundles src/ into .tmp/remotion-bundle/<hash>; reuses it while src/ and Remotion are unchanged. */
async function cachedBundle(root, log) {
  const srcDir = join(root, 'src')
  const entryPoint = join(srcDir, 'index.ts')
  if (!existsSync(entryPoint)) throw new UsageError('src/index.ts not found; restore the Remotion sources from the template')
  const remotionPkg = require.resolve('remotion/package.json')
  const h = createHash('sha256').update(JSON.parse(readFileSync(remotionPkg, 'utf8')).version)
  for (const d of readdirSync(srcDir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile())) {
    const file = join(d.parentPath ?? d.path, d.name)
    h.update(relative(srcDir, file)).update(readFileSync(file))
  }
  const cacheRoot = join(root, '.tmp', 'remotion-bundle')
  const outDir = join(cacheRoot, h.digest('hex').slice(0, 16))
  if (existsSync(join(outDir, 'index.html'))) return outDir

  rmSync(cacheRoot, { recursive: true, force: true })
  log('  bundling src/ (first render or src/ changed)…')
  const { bundle } = await import('@remotion/bundler')
  // Resolve remotion/react from wherever the scripts' dependencies live, so bundling works even
  // when node_modules is not next to src/ (e.g. a hoisted or shared install).
  const modules = dirname(dirname(remotionPkg))
  return bundle({
    entryPoint,
    outDir,
    rootDir: root,
    webpackOverride: (config) => ({
      ...config,
      resolve: { ...config.resolve, modules: [...(config.resolve?.modules ?? ['node_modules']), modules] },
    }),
  })
}

/**
 * Browser for Remotion: VIDEO_AGENT_BROWSER_EXECUTABLE, else Remotion's own headless shell
 * (downloaded once), else Playwright's Chromium headless shell when Remotion's download fails.
 */
async function remotionBrowser() {
  if (process.env.VIDEO_AGENT_BROWSER_EXECUTABLE) return process.env.VIDEO_AGENT_BROWSER_EXECUTABLE
  const { ensureBrowser } = await import('@remotion/renderer')
  try {
    await ensureBrowser({ logLevel: 'error' })
    return null
  } catch (err) {
    const fallback = await playwrightHeadlessShell()
    if (fallback) return fallback
    throw new UsageError(
      `Remotion could not download its browser (${err.message.split('\n')[0]}). ` +
        'Check the network, set VIDEO_AGENT_BROWSER_EXECUTABLE to a Chrome executable, or switch project.renderer to html-capture.',
    )
  }
}

async function playwrightHeadlessShell() {
  try {
    const { chromium } = await import('playwright')
    const path = chromium.executablePath()
    return existsSync(path) ? path : null
  } catch {
    return null
  }
}
