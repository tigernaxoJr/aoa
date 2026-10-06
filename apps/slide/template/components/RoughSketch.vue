<script setup lang="ts">
// Draws the plain SVG in its slot hand-drawn: rect, circle, ellipse, line, polyline, polygon and path
// become Rough.js strokes; text, markers and everything else stay as written. The output is SVG,
// so it prints to PDF as vectors. A fixed seed keeps the lines the same on every render.
import { onMounted, onUpdated, ref, useId } from 'vue'
import rough from 'roughjs'

const props = withDefaults(
  defineProps<{
    viewBox: string
    seed?: number
    roughness?: number
    fillStyle?: string
  }>(),
  { seed: 1, roughness: 1.2, fillStyle: 'hachure' },
)

const source = ref<SVGSVGElement | null>(null)
const output = ref<SVGSVGElement | null>(null)
const SHAPES = 'rect, circle, ellipse, line, polyline, polygon, path'
const uid = `rough-${useId()}`

const num = (el: Element, name: string) => Number(el.getAttribute(name) ?? 0)
const points = (el: Element) =>
  (el.getAttribute('points') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .reduce<[number, number][]>((out, v, i, all) => (i % 2 ? out : [...out, [v, all[i + 1]]]), [])

function draw() {
  const out = output.value
  if (!source.value || !out) return
  const copy = source.value.cloneNode(true) as SVGSVGElement
  const rc = rough.svg(out)
  copy.querySelectorAll(SHAPES).forEach((el, i) => {
    if (el.closest('defs, marker, clipPath, mask, pattern')) return
    const attr = (name: string) => el.getAttribute(name) ?? undefined
    const fill = attr('fill')
    const dash = attr('stroke-dasharray')
    const options = {
      seed: props.seed + i,
      roughness: Number(attr('data-roughness') ?? props.roughness),
      stroke: attr('stroke') ?? 'currentColor',
      strokeWidth: Number(attr('stroke-width') ?? 2),
      fill: fill && fill !== 'none' ? fill : undefined,
      fillStyle: attr('data-fill-style') ?? props.fillStyle,
      strokeLineDash: dash ? dash.split(/[\s,]+/).map(Number) : undefined,
    }
    let node: SVGGElement
    switch (el.tagName) {
      case 'rect':
        node = rc.rectangle(num(el, 'x'), num(el, 'y'), num(el, 'width'), num(el, 'height'), options)
        break
      case 'circle':
        node = rc.circle(num(el, 'cx'), num(el, 'cy'), num(el, 'r') * 2, options)
        break
      case 'ellipse':
        node = rc.ellipse(num(el, 'cx'), num(el, 'cy'), num(el, 'rx') * 2, num(el, 'ry') * 2, options)
        break
      case 'line':
        node = rc.line(num(el, 'x1'), num(el, 'y1'), num(el, 'x2'), num(el, 'y2'), options)
        break
      case 'polyline':
        node = rc.linearPath(points(el), options)
        break
      case 'polygon':
        node = rc.polygon(points(el), options)
        break
      default:
        node = rc.path(el.getAttribute('d') ?? '', options)
    }
    for (const name of ['transform', 'opacity', 'class']) {
      const value = el.getAttribute(name)
      if (value) node.setAttribute(name, value)
    }
    // Arrowheads go on the stroke (the last path; a fill, when there is one, comes first).
    const stroke = node.querySelector('path:last-of-type')
    for (const name of ['marker-start', 'marker-end']) {
      const value = el.getAttribute(name)
      if (value && stroke) stroke.setAttribute(name, value)
    }
    el.replaceWith(node)
  })
  // The hidden source keeps its ids; give the copy its own so url(#arrow) points inside it.
  const ids = [...copy.querySelectorAll('[id]')].map((el) => el.id)
  const renamed = (id: string) => `${uid}-${id}`
  for (const el of copy.querySelectorAll('*')) {
    for (const { name, value } of [...el.attributes]) {
      let fixed = name === 'id' ? renamed(value) : value
      for (const id of ids) {
        if (fixed === `#${id}`) fixed = `#${renamed(id)}` // href="#…"
        fixed = fixed.split(`url(#${id})`).join(`url(#${renamed(id)})`)
      }
      if (fixed !== value) el.setAttribute(name, fixed)
    }
  }
  out.replaceChildren(...copy.childNodes)
}

onMounted(draw)
onUpdated(draw)
</script>

<template>
  <div class="rough-sketch">
    <svg ref="source" :viewBox="viewBox" style="display: none"><slot /></svg>
    <svg ref="output" :viewBox="viewBox" class="w-full h-auto" />
  </div>
</template>
