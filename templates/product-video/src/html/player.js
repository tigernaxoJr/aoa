// html-capture player (SPEC §7.6). Loaded by scenes/*/output/scene.html, which sets window.__PLAN__.
// Every visual is a function of one time variable: render-scene calls window.__seek(t) per frame
// and screenshots the page. Video layers are pre-extracted JPEG frames, so seeking is exact.
import { backgroundScale, codeOpacity, elementState, elementTransform, styles, visibleText } from '../lib/motion.js'

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

window.__seek = async (t) => {
  if (bg.kind === 'image' || bg.kind === 'video') {
    if (bg.kind === 'video') setSrc(bgNode, frameUrl(bg, t))
    bgNode.style.transform = `scale(${backgroundScale(bg, t, plan.durationSec)})`
  } else if (bg.kind === 'code') {
    bgNode.style.opacity = String(codeOpacity(t))
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

window.__ready = (async () => {
  await document.fonts.ready
  while (pending.size) await Promise.all(pending)
  return true
})()
