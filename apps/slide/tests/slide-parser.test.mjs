import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSlides } from '../src/lib/slide-parser.ts'

test('parseSlides: parses multi-slide markdown with layouts and notes', () => {
  const md = `---
theme: default
title: Test Presentation
---

# Cover Page
This is the subtitle

---
layout: two-cols
---

# Architecture Overview

::left::
Left column text with <SvgDiagram />

::right::
Right column text

<!-- notes
Remember to emphasize the scalability.
-->

---

# 3D Visual Page

Interactive globe demonstration:
<ThreeGlobe />
`

  const deck = parseSlides(md)
  assert.equal(deck.frontmatter.theme, 'default')
  assert.equal(deck.frontmatter.title, 'Test Presentation')
  assert.equal(deck.slides.length, 3)

  // Slide 1
  assert.equal(deck.slides[0].index, 1)
  assert.equal(deck.slides[0].title, 'Cover Page')
  assert.equal(deck.slides[0].layout, 'cover')
  assert.equal(deck.slides[0].hasVisuals, false)

  // Slide 2
  assert.equal(deck.slides[1].index, 2)
  assert.equal(deck.slides[1].title, 'Architecture Overview')
  assert.equal(deck.slides[1].layout, 'two-cols')
  assert.equal(deck.slides[1].hasVisuals, true)
  assert.deepEqual(deck.slides[1].visualTypes, ['SVG'])
  assert.ok(deck.slides[1].notes?.includes('emphasize the scalability'))

  // Slide 3
  assert.equal(deck.slides[2].index, 3)
  assert.equal(deck.slides[2].title, '3D Visual Page')
  assert.equal(deck.slides[2].hasVisuals, true)
  assert.ok(deck.slides[2].visualTypes.includes('Three.js / 3D'))
})

test('parseSlides: handles empty markdown', () => {
  const deck = parseSlides('')
  assert.equal(deck.slides.length, 0)
  assert.deepEqual(deck.frontmatter, {})
})

test('parseSlides: speaker notes are the last comment of a slide, as in Slidev', () => {
  const deck = parseSlides(`# One

<!-- layout hint, not a note -->

Body

<!--
Pause here and ask the audience.
-->
`)
  assert.equal(deck.slides[0].notes, 'Pause here and ask the audience.')
})

test('parseSlides: a hand-drawn <RoughSketch> counts as SVG', () => {
  const deck = parseSlides('# Sketch\n\n<RoughSketch viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10" /></RoughSketch>\n')
  assert.deepEqual(deck.slides[0].visualTypes, ['SVG'])
})

test('parseSlides: the text preview lays named slots out as columns and names what it cannot draw', () => {
  const deck = parseSlides(`# Growth

- 30% up

::right::

\`\`\`mermaid
pie
  "A": 40
\`\`\`

---
layout: two-cols-header
---

# Plan

::left::

<ThreeGlobe :speed="2" />

::right::

\`\`\`ts
// ::right:: here is code, not a slot
const a = 1
\`\`\`
`)
  const [cols, header] = deck.slides.map((s) => s.renderedHtml)
  // two-cols: the default slot is the left column, ::right:: the right one; no marker or diagram source shows.
  assert.match(cols, /^<div class="slide-cols"><div><h1>Growth<\/h1>[\s\S]*30% up[\s\S]*<\/div><div>[\s\S]*<span class="slide-placeholder">圖表 · 圓餅圖<\/span>/)
  assert.doesNotMatch(cols, /::right::|&quot;A&quot;|pie\n/)
  // two-cols-header: the default slot heads the slide above the left and right columns.
  assert.match(header, /^<h1>Plan<\/h1>\n<div class="slide-cols"><div>[\s\S]*元件 · ThreeGlobe[\s\S]*<\/div><div><pre><code class="language-ts">\/\/ ::right:: here is code, not a slot/)
})
