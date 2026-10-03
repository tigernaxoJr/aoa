// apps/video/tools/build-api.mjs: Guide API layout, checksums, SITE_URL substitution, generated prompts and
// command files, and that the published template actually runs once unzipped.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { strFromU8, unzipSync } from 'fflate'
import { build, resolveSiteUrl } from '../../apps/video/tools/build-api.mjs'
import { section } from '../../apps/video/tools/lib/markdown.mjs'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const SITE = 'https://example.test/index-url-director'
const sha256 = (data) => createHash('sha256').update(data).digest('hex')

let out
let result
before(() => {
  out = mkdtempSync(join(tmpdir(), 'avp-site-'))
  result = build({ siteUrl: `${SITE}/`, out })
})
after(() => rmSync(out, { recursive: true, force: true }))

const read = (rel) => readFileSync(join(out, rel))
const unzip = (rel) => unzipSync(new Uint8Array(read(rel)))
function* textFiles(dir) {
  for (const d of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    const file = join(d.parentPath ?? d.path, d.name)
    if (d.isFile() && /\.(md|json|html)$/.test(d.name)) yield file
  }
}

test('index.json points at absolute URLs under the site path, with matching checksums', () => {
  const index = JSON.parse(read('api/index.json'))
  assert.equal(index.siteUrl, SITE, 'trailing slash is removed')
  assert.equal(index.entry, `${SITE}/api/agent-guide.md`)
  for (const url of [index.workflow, ...Object.values(index.schemas), ...Object.values(index.prompts), ...Object.values(index.rules), index.skill, index.template]) {
    assert.ok(url.startsWith(`${SITE}/api/`), url)
    read(url.slice(SITE.length + 1)) // exists
  }
  assert.equal(index.checksums.skill, sha256(read('api/skills/product-video.zip')))
  assert.equal(index.checksums.template, sha256(read('api/templates/product-video.zip')))
})

test('template manifest hashes the zip and every file in it', () => {
  const manifest = JSON.parse(read('api/templates/product-video/manifest.json'))
  assert.equal(manifest.zip.sha256, sha256(read('api/templates/product-video.zip')))
  const entries = unzip('api/templates/product-video.zip')
  assert.deepEqual(manifest.files.map((f) => f.path).sort(), Object.keys(entries).sort())
  for (const f of manifest.files) assert.equal(f.sha256, sha256(entries[f.path]), f.path)
})

test('builds are reproducible', () => {
  const again = mkdtempSync(join(tmpdir(), 'avp-site-'))
  try {
    const second = build({ siteUrl: SITE, out: again })
    assert.deepEqual(second.index.checksums, result.index.checksums)
  } finally {
    rmSync(again, { recursive: true, force: true })
  }
})

test('no {{SITE_URL}} placeholder survives, in files or inside the zips', () => {
  for (const file of textFiles(out)) assert.doesNotMatch(readFileSync(file, 'utf8'), /\{\{SITE_URL\}\}/, file)
  for (const zip of ['api/skills/product-video.zip', 'api/skills/story-video.zip', 'api/templates/product-video.zip']) {
    for (const [path, data] of Object.entries(unzip(zip))) {
      if (path.endsWith('.md')) assert.doesNotMatch(strFromU8(data), /\{\{SITE_URL\}\}/, `${zip}:${path}`)
    }
  }
  assert.match(strFromU8(unzip('api/skills/product-video.zip')['product-video/SKILL.md']), new RegExp(`${SITE}/api/templates/product-video.zip`))
})

test('story-video Skill ships the shared rendering guide and links to product-video by URL', () => {
  const index = JSON.parse(read('api/index.json'))
  assert.equal(index.entries.story, `${SITE}/api/story-guide.md`)
  assert.equal(index.checksums.storySkill, sha256(read('api/skills/story-video.zip')))
  const entries = unzip('api/skills/story-video.zip')
  assert.deepEqual(Object.keys(entries).sort(), ['story-video/SKILL.md', 'story-video/design-guide.md', 'story-video/rendering-guide.md', 'story-video/story-guide.md'])
  const local = new Set(Object.keys(entries).map((p) => p.slice('story-video/'.length)))
  for (const [path, data] of Object.entries(entries)) {
    for (const [, target] of strFromU8(data).matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^https?:\/\//.test(target) || target.startsWith('#')) continue
      assert.ok(local.has(target.split('#')[0]), `${path}: ${target} is not in the zip`)
    }
  }
  const design = strFromU8(entries['story-video/design-guide.md'])
  assert.match(design, /\]\(rendering-guide\.md#motion\)/, 'shared guide is linked locally')
  const rendering = strFromU8(entries['story-video/rendering-guide.md'])
  assert.match(rendering, new RegExp(`\\]\\(${SITE}/api/skills/product-video/script-guide\\.md#custom-motion\\)`), 'its product-only links go to the product Skill')
  const guide = read('api/story-guide.md').toString()
  assert.match(guide, /故事影片 Agent 指引/)
  assert.match(guide, new RegExp(`${SITE}/api/skills/story-video\\.zip`))
  for (const [, target] of guide.matchAll(/\]\(([^)\s]+)\)/g)) assert.match(target, /^https?:\/\//, target)
})

test('prompts and rules are cut from the Skill with absolute links', () => {
  const analyze = read('api/prompts/analyze-product.md').toString()
  assert.match(analyze, /<a id="style"><\/a>風格分析/, 'nested subsections are included')
  assert.doesNotMatch(analyze, /<a id="sync">/, 'stops at the next section')
  assert.match(analyze, /# <產品名稱> 產品簡報/, 'headings inside code fences do not end the section')
  for (const rel of ['prompts/analyze-product.md', 'prompts/analyze-style.md', 'prompts/storyboard.md', 'prompts/scene-script.md', 'rules/script.md', 'rules/visual.md']) {
    const text = read(`api/${rel}`).toString()
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) assert.match(target, /^https?:\/\//, `${rel}: ${target}`)
  }
  assert.throws(() => section('# a\n', 'missing'), /anchor #missing not found/)
})

test('template ships schemas and a command file for every project-level workflow command', () => {
  const entries = unzip('api/templates/product-video.zip')
  const workflow = JSON.parse(readFileSync(join(repo, 'apps/video/specs/workflow.json'), 'utf8'))
  for (const step of [...workflow.steps, ...workflow.operations].filter((s) => s.command)) {
    const file = `.claude/commands/${step.command.slice(1)}.md`
    if (step.id === 'init') assert.equal(entries[file], undefined, 'init runs before the project exists')
    else assert.match(strFromU8(entries[file]), new RegExp(`\`${step.id}\``), file)
  }
  for (const f of ['common.schema.json', 'project.schema.json', 'scene.schema.json', 'workflow.schema.json', 'workflow.json']) {
    assert.ok(entries[`schemas/${f}`], f)
  }
  assert.ok(!Object.keys(entries).some((p) => /node_modules\/|^\.tmp\/|^output\//.test(p)))
})

test('the unzipped template runs: validate flags the placeholder project', () => {
  // Unzip inside the repo so the scripts resolve dependencies from the repo's node_modules.
  mkdirSync(join(repo, '.tmp'), { recursive: true })
  const dir = mkdtempSync(join(repo, '.tmp', 'template-'))
  try {
    for (const [path, data] of Object.entries(unzip('api/templates/product-video.zip'))) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), data)
    }
    const r = spawnSync(process.execPath, ['scripts/validate.mjs'], { cwd: dir, encoding: 'utf8' })
    assert.equal(r.status, 1)
    assert.match(r.stderr, /project\.id is the template placeholder/)
    assert.doesNotMatch(r.stderr, /schema|not found|Cannot find/i, r.stderr)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('site URL follows the GitHub repository name', () => {
  const env = { ...process.env }
  try {
    delete process.env.SITE_URL
    process.env.GITHUB_REPOSITORY = 'TigerNaxoJr/index-url-director'
    assert.equal(resolveSiteUrl(), 'https://tigernaxojr.github.io/index-url-director')
    process.env.GITHUB_REPOSITORY = 'someone/someone.github.io'
    assert.equal(resolveSiteUrl(), 'https://someone.github.io')
    assert.equal(resolveSiteUrl('https://video.example.com/'), 'https://video.example.com')
    // A repository variable set to a bare domain must not fall back to github.io (wrong base path).
    assert.equal(resolveSiteUrl('aoa.tigernaxo.com'), 'https://aoa.tigernaxo.com')
    assert.equal(resolveSiteUrl(' aoa.tigernaxo.com/ '), 'https://aoa.tigernaxo.com')
    assert.throws(() => resolveSiteUrl('not a url'), /is not a URL/)
  } finally {
    process.env = env
  }
})
