// Scene player (SPEC §7.6). Loaded by scenes/*/output/scene.html, which sets window.__PLAN__.
// Every visual is a function of one time variable: render-scene calls window.__seek(t) per frame
// and screenshots the page. Video layers are pre-extracted JPEG frames, so seeking is exact.
import {
  anchor,
  backgroundScale,
  codeOpacity,
  elementState,
  elementTransform,
  styles,
  TEXT_MAX_LINES,
  TEXT_SIZE,
  THEME,
  visibleText,
} from '../lib/motion.js'

const plan = window.__PLAN__
const { width, height, fps } = plan
const bg = plan.background
const css = styles(width, height, bg.kind === 'code' ? bg.lines.length : 0)

function node(tag, style, parent) {
  const n = document.createElement(tag)
  Object.assign(n.style, style)
  parent.append(n)
  return n
}

const stage = document.getElementById('stage')
Object.assign(stage.style, css.stage, { position: 'relative', width: `${width}px`, height: `${height}px` })

const pending = new Set()
/** Sets an <img> source and tracks its decode, so a screenshot never shows a half-loaded frame. */
function setSrc(img, src) {
  if (img.getAttribute('src') === src) return
  img.src = src
  const p = img.decode().catch(() => {}).finally(() => pending.delete(p))
  pending.add(p)
}

/** Frame URL for a pre-extracted video layer at scene time t (frame 1 is at the layer's `at`). */
function frameUrl(layer, t) {
  const i = Math.min(layer.frames.count, Math.max(1, Math.floor((t - (layer.at ?? 0)) * fps + 1e-6) + 1))
  return `${layer.frames.base}/${String(i).padStart(5, '0')}.jpg`
}

// Background
let bgNode = null
if (bg.kind === 'gradient' || bg.kind === 'code') node('div', css.gradient, stage)
if (bg.kind === 'image' || bg.kind === 'video') {
  bgNode = node('img', { ...css.fill, objectFit: bg.fit }, stage)
  if (bg.kind === 'image') setSrc(bgNode, bg.src)
}
// A motion module (rendering-guide.md#motion) draws into its own full-frame layer under the overlays.
let motionSeek = null
if (bg.kind === 'module') bgNode = node('div', { ...css.fill, overflow: 'hidden' }, stage)
if (bg.kind === 'code') {
  bgNode = node('div', css.code, stage)
  const marked = new Set(bg.highlightLines)
  bg.lines.forEach((line, i) => {
    const hit = marked.has(i + 1)
    node('div', css.codeLine(hit, marked.size > 0 && !hit), bgNode).textContent = line || ' '
  })
}

// Overlay elements
const overlays = plan.elements.map((item) => {
  const box = node('div', { ...css.box(item), display: 'none' }, stage)
  const inner = node(item.type === 'text' ? 'div' : 'img', item.type === 'text' ? css.text : css.media(item.type), box)
  if (item.type === 'image') setSrc(inner, item.src)
  return { item, box, inner }
})

/**
 * Enlarged text (size large / xl) shrinks step by step, never below normal, until it wraps to at
 * most TEXT_MAX_LINES lines and stays inside the frame. Measured once, with the full text.
 */
function fitText({ item, box, inner }) {
  let scale = TEXT_SIZE[item.size] ?? 1
  if (scale === 1) return
  const a = anchor(item.position)
  Object.assign(box.style, { display: 'block', visibility: 'hidden', transform: `translate(${a.tx}%, ${a.ty}%)` })
  inner.textContent = item.content
  const frame = stage.getBoundingClientRect()
  const fits = () => {
    const pad = parseFloat(getComputedStyle(inner).paddingTop) * 2
    const lines = (inner.clientHeight - pad) / (parseFloat(inner.style.fontSize) * 1.3)
    const r = box.getBoundingClientRect()
    return (
      lines < TEXT_MAX_LINES + 0.5 &&
      inner.scrollWidth <= inner.clientWidth &&
      r.left >= frame.left && r.right <= frame.right && r.top >= frame.top && r.bottom <= frame.bottom
    )
  }
  inner.style.fontSize = css.textFont(scale)
  while (scale > 1 && !fits()) {
    scale = Math.max(1, scale - 0.05)
    inner.style.fontSize = css.textFont(scale)
  }
  Object.assign(box.style, { display: 'none', visibility: '' })
  inner.textContent = ''
}

window.__seek = async (t) => {
  if (bg.kind === 'image' || bg.kind === 'video') {
    if (bg.kind === 'video') setSrc(bgNode, frameUrl(bg, t))
    bgNode.style.transform = `scale(${backgroundScale(bg, t, plan.durationSec)})`
  } else if (bg.kind === 'code') {
    bgNode.style.opacity = String(codeOpacity(t))
  } else if (bg.kind === 'module') {
    await motionSeek(t)
  }
  for (const { item, box, inner } of overlays) {
    const state = elementState(item, t)
    if (!state) {
      box.style.display = 'none'
      continue
    }
    box.style.display = 'block'
    box.style.opacity = String(state.opacity)
    box.style.transform = elementTransform(item, state, width, height)
    if (item.type === 'text') inner.textContent = visibleText(item, state)
    else if (item.type === 'video') setSrc(inner, frameUrl(item, t))
  }
  while (pending.size) await Promise.all(pending)
}

// Bundled fonts, loaded up front: text that first appears mid-scene must not render in a fallback.
const FONTS = [
  ['Noto Sans TC', '../fonts/NotoSansTC-Bold.otf', '700'],
  ['JetBrains Mono', '../fonts/JetBrainsMono-Regular.ttf', '400'],
]

window.__ready = (async () => {
  for (const [family, file, weight] of FONTS) {
    document.fonts.add(await new FontFace(family, `url(${new URL(file, import.meta.url)})`, { weight }).load())
  }
  if (bg.kind === 'module') {
    const { default: setup } = await import(bg.src)
    if (typeof setup !== 'function') throw new Error('motion module must export default setup(ctx)')
    motionSeek = await setup({ root: bgNode, width, height, fps, durationSec: plan.durationSec, theme: THEME, cues: plan.cues ?? [], cast: plan.cast ?? [] })
    if (typeof motionSeek !== 'function') throw new Error('motion module setup(ctx) must return seek(t)')
  }
  for (const o of overlays) if (o.item.type === 'text') fitText(o)
  while (pending.size) await Promise.all(pending)
  return true
})()
