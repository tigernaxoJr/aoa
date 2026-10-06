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
 * point a part rotates and scales around, e.g. the shoulder of an arm. A <path> may also carry
 * other shapes of itself as `data-morph-<name>="…"` (same commands as its `d`) to morph into.
 * Returns { svg, part(id), pose(id, { x, y, rotate, scale }), show(id, visible), only(ids, id), morph(id, name, amount) }.
 */
export function rig(svg) {
  const cache = new Map()
  const baseShapes = new WeakMap()
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
    /**
     * Moves the paths of part `id` (the part itself, if it is a <path>, or the paths inside it)
     * toward their `data-morph-<name>` shape: 0 is the drawn shape, 1 the named one.
     */
    morph(id, name, amount) {
      const { el } = part(id)
      const attr = `data-morph-${name}`
      const paths = el.hasAttribute(attr) ? [el] : [...el.querySelectorAll(`path[${attr}]`)]
      if (!paths.length) throw new Error(`part #${id} has no path with ${attr}`)
      for (const path of paths) {
        if (!baseShapes.has(path)) baseShapes.set(path, path.getAttribute('d') ?? '')
        path.setAttribute('d', morphPath(baseShapes.get(path), path.getAttribute(attr), amount))
      }
    },
  }
}

/** Arguments per SVG path command; arcs (a) carry two 0/1 flags at positions 3 and 4. */
const PATH_ARGS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 }
const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y
const parsed = new Map()

/** Splits a path's `d` into [{ cmd, args }], one entry per command (implicit repeats spelled out). */
export function parsePath(d) {
  if (parsed.has(d)) return parsed.get(d)
  const segments = []
  let i = 0
  let cmd = null
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i])) i++
  }
  const number = () => {
    skip()
    NUMBER.lastIndex = i
    const m = NUMBER.exec(d)
    if (!m) throw new Error(`bad path data near "${d.slice(i, i + 12)}"`)
    i = NUMBER.lastIndex
    return Number(m[0])
  }
  const flag = () => {
    skip()
    if (d[i] !== '0' && d[i] !== '1') throw new Error(`bad arc flag near "${d.slice(i, i + 12)}"`)
    return Number(d[i++])
  }
  for (skip(); i < d.length; skip()) {
    if (/[a-z]/i.test(d[i])) {
      cmd = d[i++]
      if (!(cmd.toLowerCase() in PATH_ARGS)) throw new Error(`unknown path command "${cmd}"`)
      if (cmd.toLowerCase() === 'z') {
        segments.push({ cmd, args: [] })
        continue
      }
    } else if (!cmd || cmd.toLowerCase() === 'z') {
      throw new Error(`bad path data near "${d.slice(i, i + 12)}"`)
    }
    const arc = cmd.toLowerCase() === 'a'
    const args = Array.from({ length: PATH_ARGS[cmd.toLowerCase()] }, (_, k) => (arc && (k === 3 || k === 4) ? flag() : number()))
    segments.push({ cmd, args })
    if (cmd === 'M') cmd = 'L' // numbers after a moveto are implicit linetos
    if (cmd === 'm') cmd = 'l'
  }
  parsed.set(d, segments)
  return segments
}

/**
 * The shape `amount` of the way from path `from` to path `to` (0 → from, 1 → to; outside 0–1
 * overshoots). Both must use the same commands in the same order, e.g. a mouth drawn closed and
 * open with the same curves. Arc flags switch at the halfway point.
 */
export function morphPath(from, to, amount) {
  const a = parsePath(from)
  const b = parsePath(to)
  if (a.length !== b.length) throw new Error(`cannot morph paths with ${a.length} and ${b.length} commands; draw both with the same commands`)
  return a
    .map(({ cmd, args }, i) => {
      if (b[i].cmd !== cmd) throw new Error(`cannot morph paths: command ${i + 1} is "${cmd}" in one and "${b[i].cmd}" in the other`)
      const arc = cmd.toLowerCase() === 'a'
      const mixed = args.map((x, k) =>
        arc && (k === 3 || k === 4) ? (amount < 0.5 ? x : b[i].args[k]) : round(x + (b[i].args[k] - x) * amount),
      )
      return mixed.length ? `${cmd}${mixed.join(' ')}` : cmd
    })
    .join(' ')
}

const round = (x) => Math.round(x * 1000) / 1000

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
