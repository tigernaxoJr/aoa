// HyperFrames compatibility for motion modules (rendering-guide.md#hyperframes). A HyperFrames
// composition is HTML whose timing lives in data-start / data-duration attributes and whose
// animation is a paused GSAP timeline registered on window.__timelines. Both are driven here from
// the scene time, so compositions and catalog blocks render in our player without its runtime.

/** Libraries a composition may load from a CDN; they are served from the project's node_modules instead. */
const CDN = [
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/((?:@[^/@]+\/)?[^/@]+)(?:@[^/]+)?\/(.+)$/,
  /^https:\/\/unpkg\.com\/((?:@[^/@]+\/)?[^/@]+)(?:@[^/]+)?\/(.+)$/,
]

/**
 * Returns seek(t) for the timelines registered on `win.__timelines` and the timed clips
 * ([data-start]) under `root`, or null when there are neither. A timeline whose key names a
 * composition ([data-composition-id]) with a data-start starts there; a clip is shown from its
 * start for data-duration seconds, and one that reaches the scene's end holds its last frame.
 */
export function timelineSeeker(win, root, durationSec) {
  const timelines = Object.entries(win.__timelines ?? {}).map(([key, tl]) => {
    if (typeof tl?.totalTime !== 'function') throw new Error(`window.__timelines["${key}"] is not a GSAP timeline`)
    const host = root.querySelector(`[data-composition-id="${win.CSS.escape(key)}"]`)
    return { tl, start: host ? absoluteStart(host) : 0 }
  })
  const clips = [...root.querySelectorAll('[data-start]')].map((el) => {
    const start = absoluteStart(el)
    const duration = el.dataset.duration === undefined ? Infinity : number(el, 'duration')
    return { el, start, end: start + duration }
  })
  if (!timelines.length && !clips.length) return null
  return (t) => {
    for (const { el, start, end } of clips) {
      const visible = t >= start - 1e-6 && (t < end - 1e-6 || end >= durationSec - 1e-6)
      el.style.visibility = visible ? '' : 'hidden'
    }
    // Callbacks fire, as in HyperFrames: onUpdate often draws what a tween computes (a counting number).
    for (const { tl, start } of timelines) tl.totalTime(Math.max(0, t - start), false)
  }
}

/** A clip's data-start counts from the start of the composition it sits in. */
function absoluteStart(el) {
  const own = el.dataset.start === undefined ? 0 : number(el, 'start')
  const parent = el.parentElement?.closest('[data-composition-id]')
  return own + (parent ? absoluteStart(parent) : 0)
}

function number(el, name) {
  const value = Number(el.dataset[name])
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`data-${name}="${el.dataset[name]}" on <${el.localName}${el.id ? `#${el.id}` : ''}> must be a number of seconds`)
  }
  return value
}

/**
 * Loads the HyperFrames composition at `href` into a frame filling `root`, scaled from its
 * data-width / data-height to width × height. `fonts` ([family, url, weight]) are the bundled
 * fonts, declared in the frame too. Returns seek(t).
 */
export async function mountComposition({ root, href, width, height, durationSec, fonts = [] }) {
  const res = await fetch(href)
  if (!res.ok) throw new Error(`${href}: ${res.status}`)
  const html = await localize(await res.text(), href, fonts)

  const frame = document.createElement('iframe')
  Object.assign(frame.style, { position: 'absolute', left: '0', top: '0', border: '0', transformOrigin: '0 0', background: 'transparent' })
  frame.setAttribute('scrolling', 'no')
  const loaded = new Promise((resolve, reject) => {
    frame.onload = resolve
    frame.onerror = () => reject(new Error(`${href} did not load`))
  })
  frame.srcdoc = html
  root.append(frame)
  await loaded

  const win = frame.contentWindow
  const doc = frame.contentDocument
  // Scripts that build their timeline after the fonts load register it then.
  await doc.fonts.ready
  await new Promise((resolve) => win.requestAnimationFrame(() => resolve()))
  if (win.__hfError) throw new Error(`${href}: ${win.__hfError}`)

  const comp = doc.querySelector('[data-composition-id]')
  if (!comp) throw new Error(`${href} has no element with data-composition-id`)
  const w = Number(comp.dataset.width) || width
  const h = Number(comp.dataset.height) || height
  Object.assign(frame.style, { width: `${w}px`, height: `${h}px`, transform: `scale(${width / w}, ${height / h})` })

  const seek = timelineSeeker(win, doc.body, durationSec)
  if (!seek) throw new Error(`${href} registers no timeline on window.__timelines and has no timed clips`)
  return seek
}

/**
 * Points CDN scripts at the project's node_modules and resolves relative URLs against `href`.
 * Anything else from the network fails: a render must not depend on it.
 */
async function localize(html, href, fonts) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const missing = new Set()
  for (const el of doc.querySelectorAll('script[src]')) {
    const src = el.getAttribute('src')
    if (!/^https?:/.test(src)) continue
    const m = CDN.map((re) => re.exec(src)).find(Boolean)
    if (!m) throw new Error(`${href} loads ${src} from the network; download it into the scene's assets/ and use a relative path`)
    const local = new URL(`/node_modules/${m[1]}/${m[2]}`, location.href).href
    if (!(await fetch(local, { method: 'HEAD' })).ok) missing.add(m[1])
    el.setAttribute('src', local)
  }
  if (missing.size) throw new Error(`${href} needs ${[...missing].join(', ')}: pnpm add ${[...missing].join(' ')}`)
  for (const el of doc.querySelectorAll('link[href], img[src], video[src], audio[src], source[src]')) {
    const url = el.getAttribute('href') ?? el.getAttribute('src')
    if (/^https?:/.test(url)) throw new Error(`${href} loads ${url} from the network; download it into the scene's assets/ and use a relative path`)
  }

  const head = doc.head
  // Relative paths resolve against the composition's own location.
  const base = doc.createElement('base')
  base.href = href
  // The registry exists before the composition's scripts run; their errors fail the render.
  const boot = doc.createElement('script')
  boot.textContent = 'window.__timelines = {}; window.addEventListener("error", (e) => { window.__hfError ??= e.message })'
  const faces = doc.createElement('style')
  faces.textContent = fonts.map(([family, url, weight]) => `@font-face { font-family: "${family}"; src: url("${url}"); font-weight: ${weight}; }`).join('\n')
  head.prepend(base, boot, faces)
  return `<!doctype html>\n${doc.documentElement.outerHTML}`
}
