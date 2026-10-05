// Renders every slide the way `slidev export` does and checks what a reader would see:
// content running off the slide, text clipped inside a box, components or icons Slidev could not
// resolve, images that failed to load, blank canvases (WebGL that will print empty), slides that do
// not compile and runtime errors. Writes a screenshot per slide to output/slides-png/<no>.png (the
// names `pnpm run export:png` uses) and the findings to output/check.json, which the web workbench
// shows next to each slide.
//
//   pnpm run check [--wait 800] [--timeout 30000]
//
// Exits 1 when any slide has an issue, so the Agent fixes and re-runs before asking the user.
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createServer, resolveOptions } from '@slidev/cli'
import { CHECK_FILE, loadSchemas, schemaErrors, writeJsonAtomic } from './lib/schema.mjs'

const root = process.cwd()
const args = process.argv.slice(2)
const num = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && /^\d+$/.test(args[i + 1] ?? '') ? Number(args[i + 1]) : fallback
}
const WAIT = num('wait', 800)
const TIMEOUT = num('timeout', 30000)
const PNG_DIR = 'output/slides-png'
// Slidev's own setup logs these on every page; they are not the deck's fault. Failed requests are
// reported through the image check and the compile-error pairing below instead.
const NOISE = [/Failed to patch FloatingVue/, /^Failed to load resource/, /^\[vite\] (connect|hot updated)/]

const options = await resolveOptions({ entry: 'slides.md' }, 'export')
const { config, slides } = options.data
const width = 1280
const height = Math.round(width / config.aspectRatio)

const report = { checkedAt: '', total: slides.length, ok: true, slides: [], errors: [] }
const found = new Map(slides.map((_, i) => [i + 1, []]))
const add = (no, issue) => {
  const list = found.get(no)
  if (list && !list.some((i) => i.type === issue.type && i.message === issue.message)) list.push(issue)
}

// Print mode mounts every slide on each page load, so console output is tied to a slide by the Vue
// component trace (`at <Slides.mdslidev6>`) or the slide module URL, never by the slide being visited.
const events = []
let server
let browser
try {
  server = await createServer(options, {
    server: { port: 0, hmr: { overlay: false } },
    clearScreen: false,
    logLevel: 'silent',
  })
  await server.listen()
  const port = server.httpServer.address().port

  const { chromium } = await import('playwright-chromium')
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width, height } })
  await page.emulateMedia({ colorScheme: config.colorSchema === 'dark' ? 'dark' : 'light', media: 'screen' })
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') events.push({ kind: 'console', text: m.text() })
  })
  page.on('pageerror', (e) => events.push({ kind: 'pageerror', text: e.message }))

  rmSync(join(root, PNG_DIR), { recursive: true, force: true })
  mkdirSync(join(root, PNG_DIR), { recursive: true })

  for (let no = 1; no <= slides.length; no++) {
    const url =
      config.routerMode === 'hash'
        ? `http://localhost:${port}/?print=true#${no}`
        : `http://localhost:${port}/${no}?print=true`
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUT })
      const slide = page.locator(`[data-slidev-no="${no}"]`)
      await slide.waitFor({ timeout: TIMEOUT })
      await slide.locator('.slidev-slide-loading').waitFor({ state: 'detached', timeout: TIMEOUT }).catch(() => {})
      await page.waitForTimeout(WAIT)
      for (const issue of await page.evaluate(inspect, no)) add(no, issue)
      await page.locator('#slide-content').screenshot({ path: join(root, PNG_DIR, `${no}.png`) })
    } catch (err) {
      add(no, { type: 'render', message: `無法渲染：${err.message.split('\n')[0]}` })
    }
  }
} catch (err) {
  report.errors.push(err.message.split('\n')[0])
} finally {
  await browser?.close()
  await server?.close()
}
attribute(events)

report.slides = slides.map((s, i) => {
  const title = s.title?.replace(/<[^>]+>/g, '').trim()
  return {
    no: i + 1,
    ...(title ? { title } : {}),
    line: s.source.start + 1,
    image: `${PNG_DIR}/${i + 1}.png`,
    issues: found.get(i + 1),
  }
})
report.checkedAt = new Date().toISOString()
report.ok = !report.errors.length && report.slides.every((s) => !s.issues.length)
const invalid = schemaErrors(loadSchemas(root).check, report)
if (invalid.length) {
  console.error(`✗ ${CHECK_FILE} would be invalid:\n  ${invalid.join('\n  ')}`)
  process.exit(1)
}
writeJsonAtomic(join(root, CHECK_FILE), report)

for (const e of report.errors) console.log(`✗ ${e}`)
for (const s of report.slides) {
  if (!s.issues.length) continue
  console.log(`第 ${s.no} 頁${s.title ? `「${s.title}」` : ''}（slides.md 第 ${s.line} 行，截圖 ${s.image}）`)
  for (const i of s.issues) console.log(`  - [${i.type}] ${i.message}`)
}
const bad = report.slides.filter((s) => s.issues.length).length
console.log(
  report.ok
    ? `✓ ${report.total} 頁都通過檢查，截圖在 ${PNG_DIR}/`
    : `✗ ${bad} / ${report.total} 頁有問題${report.errors.length ? `，另有 ${report.errors.length} 個整份簡報的錯誤` : ''}；修正後重新執行 pnpm run check。截圖在 ${PNG_DIR}/`,
)
process.exit(report.ok ? 0 : 1)

/** Ties the collected console output to slides; what cannot be tied to one goes to report.errors. */
function attribute(events) {
  const slideOf = (text) => Number(/slidev_?(\d+)>/i.exec(text)?.[1]) || null
  const serverErrors = []
  const uncompiled = new Set()
  let crashed = null // slide whose Vue "Unhandled error" warning precedes the matching pageerror
  for (const { kind, text } of events) {
    const first = text.split('\n')[0].trim().slice(0, 300)
    if (NOISE.some((re) => re.test(first))) continue
    if (kind === 'pageerror') {
      if (crashed) add(crashed, { type: 'runtime', message: first })
      else if (!report.errors.includes(first)) report.errors.push(first)
      crashed = null
      continue
    }
    const loadFailed = /Failed to fetch dynamically imported module: \S*\/@slidev\/slides\/(\d+)\//.exec(text)
    if (loadFailed) {
      uncompiled.add(Number(loadFailed[1]))
      continue
    }
    if (/^\[vite\] Internal Server Error/.test(first)) {
      serverErrors.push(text.split('\n')[1]?.trim() || first)
      continue
    }
    const no = slideOf(text)
    const component = /Failed to resolve component: (\S+)/.exec(first)?.[1]
    if (component && no) {
      // The DOM check already names unresolved tags it can see on the slide.
      if (!found.get(no)?.some((i) => i.type === 'unresolved')) add(no, { type: 'unresolved', message: `找不到組件或圖示 <${component}>` })
    } else if (/Unhandled error/.test(first) && no) {
      crashed = no
    } else if (kind === 'console' && /error/i.test(first) && no) {
      add(no, { type: 'runtime', message: first })
    }
  }
  // A slide that does not compile fails to load in the browser, while Vite reports the reason
  // separately; pair them by the identifier quoted in the error (an icon or component name).
  for (const no of uncompiled) {
    const source = slides[no - 1]?.source.content ?? ''
    const names = (e) => [...e.matchAll(/[`'"]([^`'"]+)[`'"]/g)].flatMap(([, n]) => [n, n.replace('/', '-'), n.replace('/', ':')])
    const own = serverErrors.filter((e) => names(e).some((n) => source.includes(n)))
    const reason = [...new Set(own.length ? own : serverErrors)].join('；') || '原因不明，請執行 pnpm run dev 查看'
    // The compile error is the reason the slide did not render; drop the generic note.
    found.set(no, found.get(no).filter((i) => i.type !== 'render'))
    add(no, { type: 'compile', message: `這頁無法編譯：${reason.slice(0, 300)}` })
  }
}

/** Runs in the page: findings for slide `no`, measured in the slide's own (unscaled) CSS pixels. */
function inspect(no) {
  const issues = []
  const slide = document.querySelector(`[data-slidev-no="${no}"]`)
  // Print mode mounts every slide together, so one slide that throws can leave others unrendered.
  if (!slide.querySelector('.slidev-layout')) {
    return [{ type: 'render', message: '這頁沒有渲染出來；其他頁的錯誤也會中斷這頁，先修正其他錯誤再重新檢查' }]
  }
  const box = slide.getBoundingClientRect()
  const scale = box.width / slide.clientWidth || 1
  const px = (v) => Math.round(v / scale)
  const TOLERANCE = 4
  const label = (el) => {
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ')
    const tag = el.tagName.toLowerCase()
    return text ? `<${tag}>「${text.slice(0, 24)}${text.length > 24 ? '…' : ''}」` : `<${tag}>`
  }
  const visible = (el) => {
    const s = getComputedStyle(el)
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) !== 0
  }

  // 1. Content running past the slide edge. Report the outermost offender only, not every descendant.
  const sides = { top: 0, right: 0, bottom: 0, left: 0 }
  const offenders = []
  for (const el of slide.querySelectorAll('*')) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue
    if (!visible(el)) continue
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const over = {
      top: px(box.top - r.top),
      right: px(r.right - box.right),
      bottom: px(r.bottom - box.bottom),
      left: px(box.left - r.left),
    }
    if (Object.values(over).every((v) => v <= TOLERANCE)) continue
    for (const k in sides) sides[k] = Math.max(sides[k], over[k])
    if (!offenders.some((o) => o.contains(el))) offenders.push(el)
  }
  const overflow = Object.entries(sides).filter(([, v]) => v > TOLERANCE)
  if (overflow.length) {
    const names = { top: '上方', right: '右側', bottom: '下方', left: '左側' }
    issues.push({
      type: 'overflow',
      message: `內容超出版面（${overflow.map(([k, v]) => `${names[k]} ${v}px`).join('、')}）：${offenders.slice(0, 3).map(label).join('、')}`,
    })
  }

  // 2. Text cut off inside a box that hides or scrolls its overflow (a card too small for its text).
  for (const el of slide.querySelectorAll('*')) {
    const s = getComputedStyle(el)
    if (!/hidden|auto|scroll|clip/.test(s.overflowX + s.overflowY) || !visible(el)) continue
    if (el.matches('.slidev-layout, pre, pre *, .slidev-code-wrapper, .slidev-code-wrapper *, svg *')) continue
    if (el.scrollHeight - el.clientHeight > TOLERANCE || el.scrollWidth - el.clientWidth > TOLERANCE) {
      if (!el.textContent.trim()) continue
      issues.push({ type: 'clipped', message: `區塊內容被截斷 ${Math.max(el.scrollHeight - el.clientHeight, el.scrollWidth - el.clientWidth)}px：${label(el)}` })
    }
  }

  // 3. Components and icons Slidev could not resolve render as unknown elements.
  const unresolved = new Set()
  for (const el of slide.querySelectorAll('*')) {
    const tag = el.tagName.toLowerCase()
    if (el instanceof HTMLUnknownElement || (tag.includes('-') && !customElements.get(tag) && el.constructor === HTMLElement)) unresolved.add(tag)
  }
  for (const tag of unresolved) issues.push({ type: 'unresolved', message: `找不到組件或圖示 <${tag}>（組件放在 components/，圖示用 Iconify 名稱如 <carbon-cloud />）` })

  // 4. Images that failed to load.
  for (const img of slide.querySelectorAll('img')) {
    if (img.complete && !img.naturalWidth) issues.push({ type: 'image', message: `圖片載入失敗：${img.getAttribute('src')}` })
  }

  // 5. Canvases that read back empty: WebGL without preserveDrawingBuffer prints blank in the PDF.
  for (const canvas of slide.querySelectorAll('canvas')) {
    if (!canvas.width || !canvas.height || !visible(canvas)) continue
    const probe = document.createElement('canvas')
    probe.width = 64
    probe.height = 64
    const ctx = probe.getContext('2d', { willReadFrequently: true })
    try {
      ctx.drawImage(canvas, 0, 0, 64, 64)
      const data = ctx.getImageData(0, 0, 64, 64).data
      let painted = false
      for (let i = 3; i < data.length; i += 4) if (data[i]) { painted = true; break }
      if (!painted) issues.push({ type: 'canvas', message: '畫布是空白的，匯出 PDF 會是空的（WebGLRenderer 需要 preserveDrawingBuffer: true，且不可依賴滑鼠互動才開始繪製）' })
    } catch {
      // a tainted canvas cannot be read; nothing to report
    }
  }
  return issues
}
