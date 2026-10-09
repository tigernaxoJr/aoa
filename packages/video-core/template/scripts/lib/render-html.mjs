// Scene renderer (SPEC §7.6): a page driven by one time variable, screenshotted frame by
// frame with Playwright and encoded by FFmpeg. No recordVideo: every frame is deterministic.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { closeBrowser, launchBrowser } from './browser.mjs'
import { AUDIO_ENCODE, RGB_TO_BT709, VIDEO_ENCODE, ffmpeg, ffmpegStream } from './media.mjs'
import { TRANSITION_SEC } from './timeline.mjs'

/**
 * Renders `plan` to `out`. Video layers must already carry `clip` (normalized mp4); `server`
 * serves the project root. `work` is a scratch directory inside the project. `subtitles` names an
 * ASS file in `work` to burn in, drawn with the fonts in src/fonts. `pages` browser pages shoot
 * frames side by side, each in its own browser; a frame depends only on its time (rendering-guide.md#motion).
 */
export async function renderHtml({ root, plan, work, server, out, log, subtitles = null, pages = 1 }) {
  const url = (file) => server.url(file)
  const layer = (l, i) => {
    if (l.clip) {
      const dir = join(work, `frames-${i}`)
      mkdirSync(dir)
      ffmpeg(['-i', l.clip, '-q:v', '2', join(dir, '%05d.jpg')])
      return { ...strip(l), frames: { base: url(dir), count: readdirSync(dir).length } }
    }
    return l.file ? { ...strip(l), src: url(l.file) } : strip(l)
  }
  const pagePlan = {
    ...plan,
    background: layer(plan.background, 0),
    elements: plan.elements.map((el, i) => layer(el, i + 1)),
    audio: null,
  }

  const html = join(work, 'scene.html')
  writeFileSync(
    html,
    `<!doctype html>
<html><head><meta charset="utf-8"><title>${plan.id}</title>
<style>html,body{margin:0;padding:0;background:#000;overflow:hidden}</style>
<script type="importmap">${JSON.stringify({ imports: importMap(root, url) })}</script></head>
<body><div id="stage"></div>
<script>window.__PLAN__ = ${JSON.stringify(pagePlan).replace(/</g, '\\u003c')}</script>
<script type="module" src="${url(join(root, 'src', 'html', 'player.js'))}"></script>
</body></html>
`,
  )

  const { fps, frames, width, height } = plan
  const audioIn = plan.audio ? ['-i', plan.audio.file] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']
  // FFmpeg runs in `work`; a relative path keeps drive letters and backslashes out of the filter.
  const fontsDir = relative(work, join(root, 'src', 'fonts')).split('\\').join('/')
  const burn = subtitles ? `,ass=${subtitles}:fontsdir=${fontsDir}` : ''
  // Keyframes where transitions end and begin, so assemble re-encodes only the transitions.
  const edge = Math.round(TRANSITION_SEC * fps)
  const keys = [edge, frames - edge].filter((f) => f > 0 && f < frames).map((f) => ((f - 0.5) / fps).toFixed(6)) // the first frame at or after each time
  const encoder = ffmpegStream([
    '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(fps), '-i', '-',
    ...audioIn,
    '-map', '0:v', '-map', '1:a',
    '-vf', RGB_TO_BT709 + burn,
    '-af', 'apad',
    ...VIDEO_ENCODE,
    ...(keys.length ? ['-force_key_frames', keys.join(','), '-forced-idr', '1'] : []),
    '-r', String(fps),
    ...AUDIO_ENCODE,
    '-t', (frames / fps).toFixed(3),
    out,
  ], { cwd: work })

  // One browser per page: pages of a shared browser queue on its single compositor. Starting a
  // browser costs about a second of frames, so short scenes use fewer.
  const count = Math.max(1, Math.min(pages, Math.ceil(frames / fps)))
  const browsers = []
  try {
    const players = await Promise.all(
      Array.from({ length: count }, async () => {
        const browser = await launchBrowser()
        browsers.push(browser)
        return openPlayer(browser, url(html), width, height)
      }),
    )
    // Each page shoots every n-th frame; a round's frames go to the encoder in order.
    let reported = 0
    for (let f = 0; f < frames; f += players.length) {
      const shots = await Promise.all(players.slice(0, frames - f).map((shoot, k) => shoot((f + k) / fps)))
      for (const shot of shots) await encoder.write(shot)
      const pct = Math.floor((Math.min(f + players.length, frames) / frames) * 10) * 10
      if (pct > reported) log(`  ${(reported = pct)}%`)
    }
    await encoder.finish()
  } catch (err) {
    encoder.kill()
    throw err
  } finally {
    await Promise.all(browsers.map(closeBrowser))
  }
}

/** Opens the scene page and waits for the player; returns shoot(t) → PNG of the stage at time t. */
async function openPlayer(browser, href, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', (err) => errors.push(err.message))
  await page.goto(href)
  // Read why the player failed from its own promise: a pageerror for the same rejection may not
  // have arrived yet when the wait gives up.
  const failure = await page
    .waitForFunction(() => window.__ready !== undefined, null, { timeout: 30_000 })
    .then(() =>
      page.evaluate(() =>
        Promise.race([
          window.__ready.then(() => null, (err) => String(err?.message ?? err)),
          new Promise((resolve) => setTimeout(() => resolve('timed out'), 30_000)),
        ]),
      ),
    )
    .catch((err) => err.message)
  if (failure) throw new Error(`player did not start: ${[...new Set([failure, ...errors])].join('; ')}`)
  // The stage fills the viewport, so a plain viewport capture is the frame. Skipping the locator's
  // scroll and stability checks and using the faster (still lossless) PNG compression save a third
  // or more of the time per frame.
  const cdp = await page.context().newCDPSession(page)
  return async (t) => {
    await page.evaluate((t) => window.__seek(t), t)
    if (errors.length) throw new Error(`player error: ${errors.join('; ')}`)
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })
    return Buffer.from(data, 'base64')
  }
}

/**
 * Bare imports a motion module may use (rendering-guide.md#motion), for the animation libraries
 * installed in the project. Everything is served from the project, so rendering needs no network.
 */
const LIBRARIES = {
  gsap: { gsap: 'index.js', 'gsap/': '.' },
  three: { three: 'build/three.module.js', 'three/addons/': 'examples/jsm' },
  roughjs: { roughjs: 'bundled/rough.esm.js' },
}

function importMap(root, url) {
  const imports = {}
  for (const [name, entries] of Object.entries(LIBRARIES)) {
    const dir = join(root, 'node_modules', name)
    if (!existsSync(join(dir, 'package.json'))) continue
    for (const [spec, path] of Object.entries(entries)) {
      imports[spec] = spec.endsWith('/') ? `${url(join(dir, path))}/` : url(join(dir, path))
    }
  }
  return imports
}

/** Drops local-only fields before a layer is embedded in the page. */
function strip({ file, clip, ...rest }) {
  return rest
}
