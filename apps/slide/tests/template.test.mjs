import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'
import { parseSlides } from '../src/lib/slide-parser.ts'
import { build } from '../tools/build-api.mjs'

const slideDir = fileURLToPath(new URL('../', import.meta.url))
const repo = fileURLToPath(new URL('../../../', import.meta.url))
const templateDir = join(slideDir, 'template')
const SITE = 'https://example.test/aofa'

// Build the published zip and unpack it inside the repo (.tmp/), so the scripts resolve ajv from the
// repo's node_modules the way an installed project resolves its own.
const tmp = join(repo, '.tmp')
mkdirSync(tmp, { recursive: true })
const work = mkdtempSync(join(tmp, 'slide-template-'))
const out = join(work, 'dist')
const project = join(work, 'project')
const { index, manifest } = build({ siteUrl: SITE, out })
for (const [path, data] of Object.entries(unzipSync(readFileSync(join(out, 'api/slide/templates/slidev-deck.zip'))))) {
  mkdirSync(dirname(join(project, path)), { recursive: true })
  writeFileSync(join(project, path), data)
}
test.after(() => rmSync(work, { recursive: true, force: true }))

const run = (script, ...args) => spawnSync(process.execPath, [`scripts/${script}.mjs`, ...args], { cwd: project, encoding: 'utf8' })

test('template: has all required files and components', () => {
  const required = [
    'package.json',
    'slides.md',
    'slide.project.json',
    'AGENTS.md',
    'README.md',
    'components/SvgDiagram.vue',
    'components/ThreeGlobe.vue',
    'components/RoughSketch.vue',
    'setup/mermaid.ts',
    'uno.config.ts',
    'scripts/validate.mjs',
    'scripts/state.mjs',
    'scripts/check.mjs',
    'vite.config.ts',
  ]

  for (const rel of required) {
    assert.ok(existsSync(join(templateDir, rel)), `Missing required template file: ${rel}`)
  }

  const pkg = JSON.parse(readFileSync(join(templateDir, 'package.json'), 'utf8'))
  assert.ok(pkg.dependencies['@slidev/cli'], 'package.json must depend on @slidev/cli')
  assert.ok(pkg.dependencies['three'], 'package.json must depend on three')
  assert.ok(pkg.dependencies['roughjs'], 'package.json must depend on roughjs (components/RoughSketch.vue)')
  assert.ok(pkg.scripts['export'], 'package.json must have export script')
  assert.match(pkg.scripts['export:pptx'] ?? '', /--format pptx-editable/, 'package.json must have export:pptx script')
  assert.ok(pkg.scripts['check'], 'package.json must have check script')
})

test('template: slides.md parses cleanly and includes 3D and SVG', () => {
  const content = readFileSync(join(templateDir, 'slides.md'), 'utf8')
  const deck = parseSlides(content)

  assert.ok(deck.slides.length >= 4, `Expected at least 4 slides, got ${deck.slides.length}`)
  const hasSvg = deck.slides.some((s) => s.visualTypes.includes('SVG'))
  const hasThree = deck.slides.some((s) => s.visualTypes.includes('Three.js / 3D'))

  assert.ok(hasSvg, 'Template slides.md should include an SVG diagram')
  assert.ok(hasThree, 'Template slides.md should include Three.js globe')
  assert.ok(deck.slides.some((s) => s.visualTypes.includes('Mermaid')), 'Template slides.md should include a Mermaid diagram')
})

test('published API: absolute URLs, no {{SITE_URL}} left, schemas and commands in the template', () => {
  assert.equal(index.siteUrl, SITE)
  for (const url of [index.entry, index.workflow, index.template, index.templateManifest, ...Object.values(index.schemas)]) {
    assert.ok(url.startsWith(`${SITE}/api/slide/`), url)
  }
  assert.equal(manifest.zip.url, `${SITE}/api/slide/templates/slidev-deck.zip`)
  const paths = manifest.files.map((f) => f.path)
  for (const p of ['schemas/project.schema.json', 'schemas/activity.schema.json', 'schemas/check.schema.json', 'schemas/workflow.json', 'scripts/check.mjs', '.claude/commands/slide-outline.md', '.claude/commands/slide-export.md']) {
    assert.ok(paths.includes(p), `template zip must include ${p}`)
  }
  assert.ok(!paths.includes('.claude/commands/slide-init.md'), 'init runs before the project exists')
  for (const file of ['README.md', 'AGENTS.md', 'slides.md']) {
    assert.ok(!readFileSync(join(project, file), 'utf8').includes('{{SITE_URL}}'), `${file} still has {{SITE_URL}}`)
  }
  const skill = readFileSync(join(out, 'api/slide/skills/slidev-deck/SKILL.md'), 'utf8')
  assert.ok(skill.includes(`${SITE}/api/slide/templates/slidev-deck.zip`), 'the Skill tells the Agent where the template is')
})

test('template: validate passes on the unpacked template and checks the schema', () => {
  const ok = run('validate')
  assert.equal(ok.status, 0, ok.stderr)
  assert.match(ok.stdout, /✓ Slide project is valid/)

  const file = join(project, 'slide.project.json')
  const original = readFileSync(file, 'utf8')
  writeFileSync(file, JSON.stringify({ ...JSON.parse(original), status: 'bogus' }))
  const bad = run('validate')
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /status/)
  writeFileSync(file, original)
})

test('template: state validates before writing and never clobbers a broken project file', () => {
  const file = join(project, 'slide.project.json')
  const original = readFileSync(file, 'utf8')

  assert.equal(run('state', 'project', '--status', 'bogus').status, 1)
  assert.equal(readFileSync(file, 'utf8'), original, 'an invalid status writes nothing')

  const ok = run('state', 'project', '--status', 'outlined', '--pages', '6')
  assert.equal(ok.status, 0, ok.stderr)
  const updated = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(updated.status, 'outlined')
  assert.equal(updated.pagesCount, 6)
  assert.equal(updated.id, JSON.parse(original).id, 'other fields are kept')

  assert.equal(run('state', 'project', '--style', 'sketchy').status, 1, 'style outside the enum is refused')
  const styled = run('state', 'project', '--style', 'whiteboard')
  assert.equal(styled.status, 0, styled.stderr)
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).style, 'whiteboard')
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).status, 'outlined', 'setting the style keeps the status')

  writeFileSync(file, '{"broken')
  assert.equal(run('state', 'project', '--status', 'drafted').status, 1)
  assert.equal(readFileSync(file, 'utf8'), '{"broken', 'a broken file is left for the user to fix')
  writeFileSync(file, original)

  assert.equal(run('state', 'activity', '--step', 'nope', '--message', 'x').status, 1)
  const act = run('state', 'activity', '--step', 'outline', '--message', '大綱完成', '--waiting')
  assert.equal(act.status, 0, act.stderr)
  const activity = JSON.parse(readFileSync(join(project, 'slide.activity.json'), 'utf8'))
  assert.equal(activity.waitingForUser, true)
  assert.equal(activity.step, 'outline')
})

test('published manifest lists every file once', () => {
  const paths = manifest.files.map((f) => f.path)
  assert.deepEqual(paths.filter((p, i) => paths.indexOf(p) !== i), [])
})

test('site URL: a bare domain gets https://, junk fails instead of falling back to github.io', async () => {
  const { resolveSiteUrl } = await import('../tools/build-api.mjs')
  assert.equal(resolveSiteUrl('aoa.tigernaxo.com'), 'https://aoa.tigernaxo.com')
  assert.throws(() => resolveSiteUrl('not a url'), /is not a URL/)
})
