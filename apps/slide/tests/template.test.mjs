import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseSlides } from '../src/lib/slide-parser.ts'

const slideDir = fileURLToPath(new URL('../', import.meta.url))
const templateDir = join(slideDir, 'template')

test('template: has all required files and components', () => {
  const required = [
    'package.json',
    'slides.md',
    'slide.project.json',
    'AGENTS.md',
    'README.md',
    'components/SvgDiagram.vue',
    'components/ThreeGlobe.vue',
    'scripts/validate.mjs',
    'scripts/state.mjs',
  ]

  for (const rel of required) {
    assert.ok(existsSync(join(templateDir, rel)), `Missing required template file: ${rel}`)
  }

  const pkg = JSON.parse(readFileSync(join(templateDir, 'package.json'), 'utf8'))
  assert.ok(pkg.dependencies['@slidev/cli'], 'package.json must depend on @slidev/cli')
  assert.ok(pkg.dependencies['three'], 'package.json must depend on three')
  assert.ok(pkg.scripts['export'], 'package.json must have export script')
})

test('template: slides.md parses cleanly and includes 3D and SVG', () => {
  const content = readFileSync(join(templateDir, 'slides.md'), 'utf8')
  const deck = parseSlides(content)

  assert.ok(deck.slides.length >= 4, `Expected at least 4 slides, got ${deck.slides.length}`)
  const hasSvg = deck.slides.some((s) => s.visualTypes.includes('SVG'))
  const hasThree = deck.slides.some((s) => s.visualTypes.includes('Three.js / 3D'))

  assert.ok(hasSvg, 'Template slides.md should include an SVG diagram')
  assert.ok(hasThree, 'Template slides.md should include Three.js globe')
})

test('template: scripts/validate.mjs passes against template dir', () => {
  const out = execFileSync('node', ['scripts/validate.mjs'], {
    cwd: templateDir,
    encoding: 'utf8',
  })
  assert.match(out, /✓ Slide project is valid/)
})
