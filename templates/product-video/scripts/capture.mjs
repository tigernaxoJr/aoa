// pnpm run capture <scene-id>                         → <scene>/assets/capture.mp4 (web-capture) or capture.png (screenshot)
// pnpm run capture --url <url> --out <dir> [--width 1440 --height 900]
//                                                       → <dir>/<slug>-top.png, <slug>-full.png, <slug>.txt,
//                                                         <slug>.elements.txt (for analyze; selectors to highlight)
// Writes files only; the agent records status via `pnpm run state` (SPEC §7.3).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs, run } from './lib/cli.mjs'
import { launchBrowser as launch } from './lib/browser.mjs'
import { ffmpeg, VIDEO_ENCODE } from './lib/media.mjs'
import { UsageError, findRoot, findSceneRef, isInside, loadProject, readJson, resolveProjectPath, sceneFile } from './lib/project.mjs'

const SETTLE_MS = 400
const NAV_TIMEOUT_MS = 30_000
/** A highlight whose element does not show up within this time is skipped, not fatal. */
const HIGHLIGHT_TIMEOUT_MS = 5_000
const HIGHLIGHT_HOLD_MS = 1_200
const HIGHLIGHT_ATTR = 'data-avp-highlight'
const HIGHLIGHT_CSS = `[${HIGHLIGHT_ATTR}] {
  outline: 4px solid rgba(56, 189, 248, 0.95) !important;
  outline-offset: 4px !important;
  box-shadow: 0 0 0 12px rgba(56, 189, 248, 0.25) !important;
  border-radius: 6px;
  transition: outline-color 300ms, box-shadow 300ms;
}`

run(async (argv) => {
  const { positional, flags } = parseArgs(argv, { url: 1, out: 1, width: 1, height: 1 })
  const root = findRoot()
  if (flags.url) return capturePage(root, flags)
  const [id] = positional
  if (!id) throw new UsageError('usage: capture <scene-id> | --url <url> --out <dir>')
  return captureScene(root, id)
})

async function capturePage(root, flags) {
  if (!/^https?:\/\//.test(flags.url)) throw new UsageError('--url must start with http:// or https://')
  if (!flags.out) throw new UsageError('--out <dir> is required with --url')
  const outDir = join(root, flags.out)
  if (!isInside(root, outDir)) throw new UsageError('--out must be inside the project')
  mkdirSync(outDir, { recursive: true })
  const viewport = { width: Number(flags.width ?? 1440), height: Number(flags.height ?? 900) }
  const slug = slugify(flags.url)

  const browser = await launch()
  try {
    const page = await browser.newPage({ viewport })
    await goto(page, flags.url)
    await page.screenshot({ path: join(outDir, `${slug}-top.png`) })
    await page.screenshot({ path: join(outDir, `${slug}-full.png`), fullPage: true })
    const text = await page.evaluate(() => document.body.innerText)
    writeFileSync(join(outDir, `${slug}.txt`), `${flags.url}\n\n${text}\n`)
    const elements = await page.evaluate(listElements)
    writeFileSync(join(outDir, `${slug}.elements.txt`), `# selector\ttext (${flags.url})\n${elements.map((e) => `${e.selector}\t${e.text}`).join('\n')}\n`)
    console.log(`captured ${flags.url} → ${flags.out}/${slug}-{top,full}.png, ${slug}.txt, ${slug}.elements.txt`)
  } finally {
    await browser.close()
  }
  return 0
}

async function captureScene(root, id) {
  const project = loadProject(root)
  const ref = findSceneRef(project, id)
  const scene = readJson(sceneFile(root, ref))
  const { type, capture } = scene.visual
  if (!['web-capture', 'screenshot'].includes(type)) {
    console.log(`${id}: visual.type ${type} needs no capture`)
    return 0
  }
  const { format } = project.project
  const viewport = capture.viewport ?? { width: format.width, height: format.height }
  const assets = join(root, ref.dir, 'assets')
  mkdirSync(assets, { recursive: true })
  // script actions change what the product page shows, so they need the user's consent (gate domEditConsent).
  const scripts = new Map()
  for (const a of capture.actions ?? []) {
    if (a.do !== 'script') continue
    if (!capture.domEditConsent?.granted) {
      throw new UsageError(
        `gate domEditConsent: ${id} runs ${a.file} to change the page while recording. ` +
          'Ask the user, then record consent in visual.capture.domEditConsent, or remove the script action.',
      )
    }
    const file = resolveProjectPath(root, join(root, ref.dir), a.file)
    if (!existsSync(file)) throw new UsageError(`${id}: script ${a.file} not found`)
    scripts.set(a.file, readFileSync(file, 'utf8'))
  }

  const browser = await launch()
  const videoDir = mkdtempSync(join(tmpdir(), 'avp-capture-'))
  try {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      ...(type === 'web-capture' ? { recordVideo: { dir: videoDir, size: viewport } } : {}),
    })
    const page = await context.newPage()
    const started = Date.now()
    await goto(page, capture.url)
    const loadedAt = (Date.now() - started) / 1000
    await page.waitForTimeout(SETTLE_MS)
    for (const [i, action] of (capture.actions ?? []).entries()) {
      try {
        await perform(page, action, scripts)
      } catch (err) {
        throw new Error(`action ${i + 1} (${action.do}${action.selector ? ` ${action.selector}` : ''}) failed: ${err.message.split('\n')[0]}`)
      }
    }
    await page.waitForTimeout(SETTLE_MS)

    if (type === 'screenshot') {
      await page.screenshot({ path: join(assets, 'capture.png') })
      await context.close()
      console.log(`${id}: screenshot → ${ref.dir}/assets/capture.png`)
      return 0
    }

    await context.close() // finalizes the recording
    const webm = readdirSync(videoDir).find((f) => f.endsWith('.webm'))
    if (!webm) throw new Error('browser produced no recording')
    // Drop the page-load frames and convert to constant frame rate (SPEC §7.6).
    const out = join(assets, 'capture.mp4')
    ffmpeg(['-ss', loadedAt.toFixed(3), '-i', join(videoDir, webm), '-an', '-r', String(format.fps), '-vf', `scale=${format.width}:${format.height}:force_original_aspect_ratio=decrease,pad=${format.width}:${format.height}:(ow-iw)/2:(oh-ih)/2`, ...VIDEO_ENCODE, out])
    console.log(`${id}: recording → ${ref.dir}/assets/capture.mp4`)
    return 0
  } finally {
    await browser.close()
    rmSync(videoDir, { recursive: true, force: true })
  }
}

async function goto(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS })
  } catch (err) {
    if (!/Timeout/.test(err.message)) throw err
    // Pages with long-polling never go idle; accept the loaded state.
    await page.waitForLoadState('load')
  }
}

async function perform(page, a, scripts) {
  switch (a.do) {
    case 'navigate':
      await goto(page, a.url)
      break
    case 'scroll':
      if (a.selector) {
        await page.locator(a.selector).first().evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      } else {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), a.y)
      }
      await page.waitForTimeout(900)
      break
    case 'click':
      await page.locator(a.selector).first().click()
      await page.waitForTimeout(SETTLE_MS)
      break
    case 'hover':
      await page.locator(a.selector).first().hover()
      await page.waitForTimeout(SETTLE_MS)
      break
    case 'type':
      await page.locator(a.selector).first().pressSequentially(a.text, { delay: 60 })
      break
    case 'highlight': {
      // Cosmetic: a missing element only warns, so one stale selector never costs the whole recording.
      const el = page.locator(a.selector).first()
      try {
        await el.waitFor({ state: 'visible', timeout: HIGHLIGHT_TIMEOUT_MS })
      } catch {
        console.warn(`warning: highlight ${a.selector}: no visible element; skipped`)
        break
      }
      // One highlight at a time: the previous one is cleared.
      await page.evaluate(([attr, css]) => {
        if (!document.getElementById('avp-highlight')) {
          const style = Object.assign(document.createElement('style'), { id: 'avp-highlight', textContent: css })
          document.head.append(style)
        }
        for (const n of document.querySelectorAll(`[${attr}]`)) n.removeAttribute(attr)
      }, [HIGHLIGHT_ATTR, HIGHLIGHT_CSS])
      await el.evaluate((n, attr) => {
        n.scrollIntoView({ behavior: 'smooth', block: 'center' })
        n.setAttribute(attr, '')
      }, HIGHLIGHT_ATTR)
      await page.waitForTimeout(a.ms ?? HIGHLIGHT_HOLD_MS)
      break
    }
    case 'script':
      // Wrapped so the file can use statements and top-level await; runs even under a strict CSP.
      await page.evaluate(`(async () => {\n${scripts.get(a.file)}\n})()`)
      await page.waitForTimeout(SETTLE_MS)
      break
    case 'wait':
      await page.waitForTimeout(a.ms)
      break
    default:
      throw new UsageError(`unknown action ${a.do}`)
  }
}

/**
 * Visible headings, buttons, links, inputs and test ids, each with a selector capture can use
 * (CSS, or Playwright's :has-text()). Runs in the page.
 */
function listElements() {
  const q = (s) => JSON.stringify(s)
  const seen = new Set()
  const out = []
  for (const el of document.querySelectorAll('h1, h2, h3, button, a[href], input, textarea, select, [role=button], [data-testid]')) {
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4 || getComputedStyle(el).visibility === 'hidden') continue
    const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40)
    const tag = el.tagName.toLowerCase()
    let selector
    if (el.dataset.testid) selector = `[data-testid=${q(el.dataset.testid)}]`
    else if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) selector = `#${el.id}`
    else if (text && !text.includes('"')) selector = `${tag}:has-text(${q(text)})`
    else continue
    if (seen.has(selector)) continue
    seen.add(selector)
    out.push({ selector, text })
    if (out.length >= 200) break
  }
  return out
}

function slugify(url) {
  const { hostname, pathname } = new URL(url)
  return `${hostname}${pathname}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'page'
}
