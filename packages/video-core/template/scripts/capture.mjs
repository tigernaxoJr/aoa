// pnpm run capture <scene-id>                         → <scene>/assets/capture.mp4 (web-capture) or capture.png (screenshot)
// pnpm run capture --url <url> --out <dir> [--width 1440 --height 900]
//                                                       → <dir>/<slug>-top.png, <slug>-full.png, <slug>.txt,
//                                                         <slug>.elements.txt (for analyze; selectors to highlight)
// Both open the page signed in when the user has signed in with `pnpm run login` (gate productLogin).
// Writes files only; the agent records status via `pnpm run state` (SPEC §7.3).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs, run } from './lib/cli.mjs'
import { launchBrowser as launch } from './lib/browser.mjs'
import { checkSignedIn, signInOptions } from './lib/login.mjs'
import { cutFilter, ffmpeg, VIDEO_ENCODE } from './lib/media.mjs'
import { UsageError, findRoot, findSceneRef, isInside, loadProject, readJson, resolveProjectPath, sceneFile } from './lib/project.mjs'

const SETTLE_MS = 400
const NAV_TIMEOUT_MS = 30_000
/** After a page load, wait at most this long for the network to go quiet. */
const IDLE_TIMEOUT_MS = 5_000
/** Extra time cut after each page load; frame timestamps and our clock differ by a few ms. */
const CUT_PAD_MS = 100
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
  const signIn = signInOptions(root, loadProject(root))

  const browser = await launch()
  try {
    const page = await browser.newPage({ viewport, ...signIn })
    await goto(page, flags.url)
    checkSignedIn(flags.url, page.url(), Boolean(signIn.storageState))
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
  const signIn = signInOptions(root, project)

  const browser = await launch()
  const videoDir = mkdtempSync(join(tmpdir(), 'avp-capture-'))
  try {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ...signIn })
    const page = await context.newPage()
    // The recording starts at the first frame the browser paints, which on a busy machine can come
    // seconds after the page opens. Times are kept as wall-clock ms and measured from that frame at the end,
    // or the cuts land beside what they meant to drop (and can drop everything).
    const webm = join(videoDir, 'capture.webm')
    let firstFrameAt = null
    if (type === 'web-capture') {
      await page.screencast.start({ path: webm, size: viewport, onFrame: ({ timestamp }) => (firstFrameAt ??= timestamp) })
    }
    const now = () => Date.now()
    // Page loads (the first one, `navigate`, a click on a link) show blank or half-drawn frames;
    // each is cut from request to settled page (SPEC §7.6). Same-document (SPA) routes send no request,
    // so the agent marks those (or any span not worth showing) with `cut: true`.
    let navStart = null
    let lastLoad = -Infinity
    page.on('request', (r) => {
      if (navStart == null && r.isNavigationRequest() && r.frame() === page.mainFrame()) navStart = now()
    })
    page.on('load', () => (lastLoad = now()))
    const cuts = []
    const cutNavigation = async () => {
      if (navStart == null) return
      if (lastLoad < navStart) await page.waitForEvent('load', { timeout: NAV_TIMEOUT_MS })
      await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT_MS }).catch(() => {})
      await page.waitForTimeout(SETTLE_MS)
      cuts.push([navStart, now() + CUT_PAD_MS])
      navStart = null
    }
    await goto(page, capture.url)
    checkSignedIn(capture.url, page.url(), Boolean(signIn.storageState))
    await cutNavigation()
    for (const [i, action] of (capture.actions ?? []).entries()) {
      try {
        const actionStart = now()
        await perform(page, action, scripts)
        await cutNavigation()
        if (action.cut) cuts.push([actionStart, now() + CUT_PAD_MS])
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

    // Playwright pads the end with ≥ 1 s of the last frame; keep only what we recorded.
    const endAt = now()
    await page.screencast.stop() // finalizes the recording
    await context.close()
    if (!existsSync(webm) || firstFrameAt == null) throw new Error('browser produced no recording')
    const sec = (ms) => Math.max(0, (ms - firstFrameAt) / 1000)
    // The first page load is cut from the start of the recording.
    const cutSec = cuts.map(([a, b], i) => [i === 0 ? 0 : sec(a), sec(b)])
    // Drop the page-load frames and convert to constant frame rate (SPEC §7.6).
    const out = join(assets, 'capture.mp4')
    ffmpeg(['-t', sec(endAt).toFixed(3), '-i', webm, '-an', '-vf', `${cutFilter(cutSec, format.fps)},scale=${format.width}:${format.height}:force_original_aspect_ratio=decrease,pad=${format.width}:${format.height}:(ow-iw)/2:(oh-ih)/2`, ...VIDEO_ENCODE, out])
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
