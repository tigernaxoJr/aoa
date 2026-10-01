// Scene renderer (SPEC §7.6): a page driven by one time variable, screenshotted frame by
// frame with Playwright and encoded by FFmpeg. No recordVideo: every frame is deterministic.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchBrowser } from './browser.mjs'
import { AUDIO_ENCODE, RGB_TO_BT709, VIDEO_ENCODE, ffmpeg, ffmpegStream } from './media.mjs'

/**
 * Renders `plan` to `out`. Video layers must already carry `clip` (normalized mp4); `server`
 * serves the project root. `work` is a scratch directory inside the project.
 */
export async function renderHtml({ root, plan, work, server, out, log }) {
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
<style>html,body{margin:0;padding:0;background:#000;overflow:hidden}</style></head>
<body><div id="stage"></div>
<script>window.__PLAN__ = ${JSON.stringify(pagePlan).replace(/</g, '\\u003c')}</script>
<script type="module" src="${url(join(root, 'src', 'html', 'player.js'))}"></script>
</body></html>
`,
  )

  const { fps, frames, width, height } = plan
  const audioIn = plan.audio ? ['-i', plan.audio.file] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']
  const encoder = ffmpegStream([
    '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(fps), '-i', '-',
    ...audioIn,
    '-map', '0:v', '-map', '1:a',
    '-vf', RGB_TO_BT709,
    '-af', 'apad',
    ...VIDEO_ENCODE,
    '-r', String(fps),
    ...AUDIO_ENCODE,
    '-t', (frames / fps).toFixed(3),
    out,
  ])

  const browser = await launchBrowser()
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.goto(url(html))
    await page.waitForFunction(() => window.__ready, null, { timeout: 30_000 }).catch(() => {
      throw new Error(`player did not start${errors.length ? `: ${errors.join('; ')}` : ''}`)
    })
    await page.evaluate(() => window.__ready)
    const stage = page.locator('#stage')
    let reported = 0
    for (let f = 0; f < frames; f++) {
      await page.evaluate((t) => window.__seek(t), f / fps)
      if (errors.length) throw new Error(`player error: ${errors.join('; ')}`)
      await encoder.write(await stage.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' }))
      const pct = Math.floor(((f + 1) / frames) * 10) * 10
      if (pct > reported) log(`  ${(reported = pct)}%`)
    }
    await encoder.finish()
  } catch (err) {
    encoder.kill()
    throw err
  } finally {
    await browser.close()
  }
}

/** Drops local-only fields before a layer is embedded in the page. */
function strip({ file, clip, ...rest }) {
  return rest
}
