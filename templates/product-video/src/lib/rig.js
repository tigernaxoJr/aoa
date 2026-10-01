// Helpers for story motion modules (Skill story-video, design-guide.md#rig): load a character SVG,
// pose its parts around their pivots, and tell who is speaking at time t. Everything except
// loadSvg is a pure function of t, so frames come out the same on every render.
//
//   import { loadSvg, rig, speakerAt, mouthOpen, blinking, tween } from '../../../src/lib/rig.js'

/**
 * Fetches an SVG file and returns it as an inline <svg> element (so its parts can be moved).
 * `url` is usually new URL('../../../assets/cast/fox/fox.svg', import.meta.url).
 */
export async function loadSvg(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`cannot load ${url}: ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml')
  const svg = doc.documentElement
  if (svg.nodeName !== 'svg') throw new Error(`${url} is not an SVG file`)
  for (const s of svg.querySelectorAll('script')) s.remove()
  return document.importNode(svg, true)
}

/**
 * Wraps a character SVG. Parts are <g id="…"> groups; `data-pivot="x y"` (viewBox units) is the
 * point a part rotates and scales around, e.g. the shoulder of an arm.
 * Returns { svg, part(id), pose(id, { x, y, rotate, scale }), show(id, visible), only(ids, id) }.
 */
export function rig(svg) {
  const cache = new Map()
  const part = (id) => {
    if (!cache.has(id)) {
      const el = svg.querySelector(`#${CSS.escape(id)}`)
      if (!el) throw new Error(`part #${id} not found in the character SVG`)
      const base = el.getAttribute('transform') ?? ''
      cache.set(id, { el, base, pivot: pivotOf(el) })
    }
    return cache.get(id)
  }
  return {
    svg,
    part: (id) => part(id).el,
    pose(id, p = {}) {
      const { el, base, pivot } = part(id)
      el.setAttribute('transform', `${base} ${poseTransform(p, pivot)}`.trim())
    },
    show(id, visible) {
      part(id).el.style.display = visible ? '' : 'none'
    },
    /** Shows exactly one of `ids` (e.g. mouth shapes or eye states). */
    only(ids, id) {
      for (const each of ids) part(each).el.style.display = each === id ? '' : 'none'
    },
  }
}

function pivotOf(el) {
  const [x = 0, y = 0] = (el.getAttribute('data-pivot') ?? '').trim().split(/[\s,]+/).map(Number)
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 }
}

/** SVG transform for a pose: move by (x, y), then rotate (degrees) and scale around the pivot. */
export function poseTransform({ x = 0, y = 0, rotate = 0, scale = 1 } = {}, pivot = { x: 0, y: 0 }) {
  const out = []
  if (x || y) out.push(`translate(${x} ${y})`)
  if (rotate) out.push(`rotate(${rotate} ${pivot.x} ${pivot.y})`)
  if (scale !== 1) out.push(`translate(${pivot.x} ${pivot.y}) scale(${scale}) translate(${-pivot.x} ${-pivot.y})`)
  return out.join(' ')
}

/** The caption cue being spoken at t ({ start, end, text, speaker? }), or null. Narrator cues have no speaker. */
export function cueAt(cues, t) {
  return cues.find((c) => t >= c.start && t < c.end) ?? null
}

/** Name of the character speaking at t, or null for the narrator or silence. */
export function speakerAt(cues, t) {
  return cueAt(cues, t)?.speaker ?? null
}

/** Mouth flaps open and shut about `rate` times a second while `speaking`. */
export function mouthOpen(t, speaking, rate = 7) {
  return Boolean(speaking) && Math.floor(t * rate * 2) % 2 === 0
}

/** Blinks for ~0.12 s every 2.5–4.5 s; `seed` keeps characters from blinking in unison. */
export function blinking(t, seed = 0) {
  const rand = mulberry32(seed)
  let at = 0.6 + rand() * 2
  while (at <= t) {
    if (t < at + 0.12) return true
    at += 2.5 + rand() * 2
  }
  return false
}

export const ease = {
  linear: (x) => x,
  in: (x) => x * x * x,
  out: (x) => 1 - (1 - x) ** 3,
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
}

/** Value moving from `a` to `b` between t0 and t1 (held before and after). */
export function tween(t, t0, t1, a, b, easing = ease.inOut) {
  const p = t1 <= t0 ? 1 : Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))
  return a + (b - a) * easing(p)
}

/** Gentle back-and-forth (idle sway, breathing): amplitude × sin at `hz`. */
export function wave(t, amplitude, hz = 0.5, phase = 0) {
  return amplitude * Math.sin(2 * Math.PI * (hz * t + phase))
}

/** Seeded random numbers in [0, 1), the same sequence on every render. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let r = Math.imul(a ^ (a >>> 15), 1 | a)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
