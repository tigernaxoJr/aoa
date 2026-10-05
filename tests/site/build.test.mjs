// The video Guide APIs (apps/product and apps/story via packages/video-core/tools/build-video-api.mjs)
// and the platform build: layout, checksums, URL substitution, generated prompts and command files,
// that each published template actually runs once unzipped, and that /api/video keeps its old layout.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'
import { strFromU8, unzipSync } from 'fflate'
import { build as buildProduct } from '../../apps/product/tools/build-api.mjs'
import { build as buildStory } from '../../apps/story/tools/build-api.mjs'
import { KIND_FILES, resolveSiteUrl } from '../../packages/video-core/tools/build-video-api.mjs'
import { section } from '../../packages/video-core/tools/lib/markdown.mjs'
import { build as buildPlatformApi } from '../../tools/build-platform-api.mjs'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const SITE = 'https://example.test/index-url-director'
const sha256 = (data) => createHash('sha256').update(data).digest('hex')
const APPS = { product: buildProduct, story: buildStory }

let out
const results = {}
let catalog
before(() => {
  out = mkdtempSync(join(tmpdir(), 'avp-site-'))
  for (const [slug, build] of Object.entries(APPS)) results[slug] = build({ siteUrl: `${SITE}/`, out })
  catalog = buildPlatformApi({ siteUrl: SITE, out })
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

test('each video app index.json points at absolute URLs under its own API, with matching checksums', () => {
  for (const slug of Object.keys(APPS)) {
    const index = JSON.parse(read(`api/${slug}/index.json`))
    assert.equal(index.siteUrl, SITE, 'trailing slash is removed')
    assert.equal(index.workbench, `${SITE}/${slug}/`)
    assert.equal(index.entry, `${SITE}/api/${slug}/agent-guide.md`)
    for (const url of [index.workflow, ...Object.values(index.schemas), ...Object.values(index.prompts), ...Object.values(index.rules), index.skill, index.template]) {
      assert.ok(url.startsWith(`${SITE}/api/${slug}/`), url)
      read(url.slice(SITE.length + 1)) // exists
    }
    assert.equal(index.checksums.skill, sha256(read(`api/${slug}/skills/${slug}-video.zip`)))
    assert.equal(index.checksums.template, sha256(read(`api/${slug}/templates/${slug}-video.zip`)))
  }
})

test('template manifests hash the zip and every file in it', () => {
  for (const slug of Object.keys(APPS)) {
    const manifest = JSON.parse(read(`api/${slug}/templates/${slug}-video/manifest.json`))
    assert.equal(manifest.zip.sha256, sha256(read(`api/${slug}/templates/${slug}-video.zip`)))
    const entries = unzip(`api/${slug}/templates/${slug}-video.zip`)
    assert.deepEqual(manifest.files.map((f) => f.path).sort(), Object.keys(entries).sort())
    for (const f of manifest.files) assert.equal(f.sha256, sha256(entries[f.path]), f.path)
  }
})

test('builds are reproducible', () => {
  const again = mkdtempSync(join(tmpdir(), 'avp-site-'))
  try {
    for (const [slug, build] of Object.entries(APPS)) assert.deepEqual(build({ siteUrl: SITE, out: again }).index.checksums, results[slug].index.checksums)
  } finally {
    rmSync(again, { recursive: true, force: true })
  }
})

test('no URL placeholder survives, in files or inside the zips', () => {
  const PLACEHOLDER = /\{\{(SITE|API|APP|TEMPLATE)_URL\}\}/
  for (const file of textFiles(join(out, 'api'))) assert.doesNotMatch(readFileSync(file, 'utf8'), PLACEHOLDER, file)
  for (const zip of readdirSync(join(out, 'api'), { recursive: true }).filter((p) => p.endsWith('.zip'))) {
    for (const [path, data] of Object.entries(unzip(join('api', zip)))) {
      if (/\.(md|mjs)$/.test(path)) assert.doesNotMatch(strFromU8(data), PLACEHOLDER, `${zip}:${path}`)
    }
  }
  assert.match(strFromU8(unzip('api/product/skills/product-video.zip')['product-video/SKILL.md']), new RegExp(`${SITE}/api/product/templates/product-video.zip`))
  assert.match(strFromU8(unzip('api/story/skills/story-video.zip')['story-video/SKILL.md']), new RegExp(`${SITE}/api/story/templates/story-video.zip`))
  assert.match(strFromU8(unzip('api/story/templates/story-video.zip')['README.md']), new RegExp(`${SITE}/story/`))
})

test('story-video Skill ships the shared rendering guide and links to product-video by URL', () => {
  const entries = unzip('api/story/skills/story-video.zip')
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
  assert.match(rendering, new RegExp(`\\]\\(${SITE}/api/product/skills/product-video/script-guide\\.md#custom-motion\\)`), 'its product-only links go to the product Skill')
  const guide = read('api/story/agent-guide.md').toString()
  assert.match(guide, /故事動畫影片 Agent 指引/)
  assert.match(guide, new RegExp(`${SITE}/api/story/skills/story-video\\.zip`))
  for (const [, target] of guide.matchAll(/\]\(([^)\s]+)\)/g)) assert.match(target, /^https?:\/\//, target)
  // The product Skill keeps the shared guide as its own document.
  assert.ok(unzip('api/product/skills/product-video.zip')['product-video/rendering-guide.md'])
})

test('prompts and rules are cut from the Skill with absolute links', () => {
  const analyze = read('api/product/prompts/analyze-product.md').toString()
  assert.match(analyze, /<a id="style"><\/a>風格分析/, 'nested subsections are included')
  assert.doesNotMatch(analyze, /<a id="sync">/, 'stops at the next section')
  assert.match(analyze, /# <產品名稱> 產品簡報/, 'headings inside code fences do not end the section')
  for (const rel of ['prompts/analyze-product.md', 'prompts/analyze-style.md', 'prompts/storyboard.md', 'prompts/scene-script.md', 'rules/script.md', 'rules/visual.md']) {
    const text = read(`api/product/${rel}`).toString()
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) assert.match(target, /^https?:\/\//, `${rel}: ${target}`)
  }
  assert.throws(() => section('# a\n', 'missing'), /anchor #missing not found/)
})

test('each template ships its own workflow and a command file for every project-level command', () => {
  for (const slug of Object.keys(APPS)) {
    const entries = unzip(`api/${slug}/templates/${slug}-video.zip`)
    const workflow = JSON.parse(readFileSync(join(repo, `apps/${slug}/specs/workflow.json`), 'utf8'))
    assert.deepEqual(JSON.parse(strFromU8(entries['schemas/workflow.json'])), workflow)
    for (const step of [...workflow.steps, ...workflow.operations].filter((s) => s.command)) {
      const file = `.claude/commands/${step.command.slice(1)}.md`
      if (step.id === 'init') assert.equal(entries[file], undefined, 'init runs before the project exists')
      else assert.match(strFromU8(entries[file]), new RegExp(`\`${step.id}\``), file)
    }
    for (const f of ['common.schema.json', 'project.schema.json', 'scene.schema.json', 'workflow.schema.json']) assert.ok(entries[`schemas/${f}`], f)
    assert.ok(!Object.keys(entries).some((p) => /node_modules\/|^\.tmp\/|^output\//.test(p)))
  }
  const story = unzip('api/story/templates/story-video.zip')
  assert.ok(story['.claude/commands/video-story.md'] && !story['.claude/commands/video-analyze.md'], 'story commands only')
  assert.match(strFromU8(story['.claude/commands/video-storyboard.md']), new RegExp(`${SITE}/api/product/skills/product-video/`), 'guides in the product Skill link there')
  const product = unzip('api/product/templates/product-video.zip')
  assert.ok(product['.claude/commands/video-analyze.md'] && !product['.claude/commands/video-story.md'], 'product commands only')
})

/** Unzips a template inside the repo, so its scripts resolve dependencies from the repo's node_modules. */
function unpack(zipRel) {
  mkdirSync(join(repo, '.tmp'), { recursive: true })
  const dir = mkdtempSync(join(repo, '.tmp', 'template-'))
  for (const [path, data] of Object.entries(unzip(zipRel))) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), data)
  }
  return dir
}

const TEMPLATES = { product: 'api/product/templates/product-video.zip', story: 'api/story/templates/story-video.zip', legacy: 'api/video/templates/product-video.zip' }

test('each template ships only its kind\'s scripts; /api/video ships both kinds', () => {
  const files = Object.fromEntries(Object.entries(TEMPLATES).map(([name, rel]) => [name, unzip(rel)]))
  const source = (rel) => readFileSync(join(repo, 'packages/video-core/template', rel))
  const scripts = (entries) => Object.keys(JSON.parse(strFromU8(entries['package.json'])).scripts)
  for (const [kind, only] of Object.entries(KIND_FILES)) {
    for (const rel of only) {
      for (const [name, entries] of Object.entries(files)) {
        assert.equal(Boolean(entries[rel]), name === kind || name === 'legacy', `${name}: ${rel}`)
      }
    }
  }
  for (const entries of Object.values(files)) assert.ok(entries['src/lib/motion.js'] && entries['src/html/player.js'], 'the scene player is shared')

  assert.deepEqual(scripts(files.product), scripts(files.legacy))
  assert.ok(scripts(files.product).includes('capture') && scripts(files.product).includes('login'))
  assert.deepEqual(scripts(files.story), scripts(files.legacy).filter((s) => !['capture', 'login'].includes(s)))
  assert.deepEqual(Buffer.from(files.legacy['package.json']), source('package.json'), 'the legacy template keeps package.json as is')

  // Doc lines tagged for one kind; the tags themselves never ship, and /api/video keeps every line.
  const docs = Object.fromEntries(Object.entries(files).map(([name, entries]) => [name, strFromU8(entries['AGENTS.md']) + strFromU8(entries['README.md'])]))
  for (const text of Object.values(docs)) assert.doesNotMatch(text, /<!-- kind:/)
  assert.doesNotMatch(docs.story, /pnpm run (capture|login)|productLogin|\.auth\/|\/video-analyze|script-guide\.md|product-brief/)
  assert.doesNotMatch(docs.product, /\/video-(story|design)`|design-guide\.md|brief\/story\.md|角色塑形/)
  for (const name of ['product', 'legacy']) assert.match(docs[name], /`pnpm run capture <id>` \| 擷取網頁畫面 \|\n/)
  for (const name of ['story', 'legacy']) assert.match(docs[name], /\| `\/video-design` \|/)
  // Same lines, apart from the app each URL points at.
  const app = (text) => text.replace(new RegExp(`${SITE}/(api/)?(product|story|video)\\b`, 'g'), `${SITE}/$1<app>`)
  for (const line of app(docs.product + docs.story).split('\n')) assert.ok(app(docs.legacy).includes(line), `/api/video lacks: ${line}`)
})

test('the docs in each template name only commands that template has', () => {
  for (const [name, rel] of Object.entries(TEMPLATES)) {
    const entries = unzip(rel)
    const scripts = Object.keys(JSON.parse(strFromU8(entries['package.json'])).scripts)
    for (const doc of ['AGENTS.md', 'README.md']) {
      const text = strFromU8(entries[doc])
      for (const [, script] of text.matchAll(/`pnpm run ([\w:-]+)/g)) assert.ok(scripts.includes(script), `${name} ${doc}: pnpm run ${script}`)
      for (const [, command] of text.matchAll(/`\/(video-[\w-]+)/g)) assert.ok(entries[`.claude/commands/${command}.md`], `${name} ${doc}: /${command}`)
    }
  }
})

test('every script in each template imports only files that template ships', () => {
  const IMPORT = /^\s*(?:import|export)\b[^'"]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]|\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/gm
  for (const [name, rel] of Object.entries(TEMPLATES)) {
    const entries = unzip(rel)
    for (const [path, data] of Object.entries(entries)) {
      if (!/\.(mjs|js)$/.test(path)) continue
      for (const m of strFromU8(data).matchAll(IMPORT)) {
        const target = posix.join(posix.dirname(path), m[1] ?? m[2])
        assert.ok(entries[target], `${name}: ${path} imports ${target}, which is not in the template`)
      }
    }
    for (const [script, cmd] of Object.entries(JSON.parse(strFromU8(entries['package.json'])).scripts)) {
      const file = /\b(?:node|python) (\S+\.(?:mjs|py))\b/.exec(cmd)?.[1]
      assert.ok(file && entries[file], `${name}: pnpm run ${script} runs ${file}, which is not in the template`)
    }
  }
})

/** A scene per kind, as the agent writes it: a product title card, and a story scene animated with rig.js. */
const PIPELINE = {
  product: {
    project: { name: 'Pipeline', sources: { productUrl: 'https://example.com' } },
    scene: { purpose: 'hook', visual: { type: 'motion-graphic', description: '提問', elements: [{ type: 'text', content: '半天？', at: 0.2, animation: 'zoomIn' }] } },
    script: '部署要花半天嗎？\n',
  },
  story: {
    project: {
      name: '小狐狸',
      kind: 'story',
      customMotion: 'allow',
      sources: { story: '小狐狸以為月亮掉進了池塘。' },
      cast: [{ id: 'fox', name: '小狐狸', voice: 'zh-TW-HsiaoYuNeural', art: '@/assets/cast/fox/' }],
    },
    scene: { purpose: 'conflict', visual: { type: 'motion-graphic', description: '池塘邊', motion: { file: 'assets/motion.js', uses: ['@/assets/cast/fox/'] } } },
    script: '夜深了。\n【小狐狸】月亮掉進水裡了！\n',
    files: {
      'assets/cast/fox/fox.svg':
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300" width="200" height="300"><g id="head" data-pivot="100 130"><circle cx="100" cy="90" r="55" fill="#fb923c"/>' +
        '<g id="mouth-closed"><path d="M90 115h20" stroke="#000" stroke-width="3"/></g><g id="mouth-open"><ellipse cx="100" cy="117" rx="10" ry="7"/></g></g></svg>\n',
      'scenes/001-scene/assets/motion.js': `import { loadSvg, mouthOpen, rig, speakerAt, wave } from '../../../src/lib/rig.js'

export default async function setup({ root, height, cues }) {
  const svg = await loadSvg(new URL('../../../assets/cast/fox/fox.svg', import.meta.url))
  svg.setAttribute('height', String(height * 0.6))
  root.append(svg)
  const fox = rig(svg)
  return (t) => {
    fox.pose('head', { rotate: wave(t, 4, 0.6) })
    fox.only(['mouth-open', 'mouth-closed'], mouthOpen(t, speakerAt(cues, t) === '小狐狸') ? 'mouth-open' : 'mouth-closed')
  }
}
`,
    },
  },
}

/** Turns an unzipped template into an initialized project with one scene (scenes/001-scene). */
function fillProject(dir, { project, scene, script, files = {} }) {
  const file = (rel) => join(dir, rel)
  const writeJson = (rel, data) => writeFileSync(file(rel), `${JSON.stringify(data, null, 2)}\n`)
  const pj = JSON.parse(readFileSync(file('video.project.json'), 'utf8'))
  Object.assign(pj.project, project, {
    id: '8f1c2e0a-5b7d-4c3e-9a1f-2d6b8e4c7a90',
    format: { aspectRatio: '16:9', width: 640, height: 360, fps: 24, targetDurationSec: 10 },
    tts: { ...pj.project.tts, consent: { onlineTts: true, grantedAt: '2026-10-01T00:00:00Z' } },
  })
  Object.assign(pj, { scenes: [{ id: 'scene-001', dir: 'scenes/001-scene' }], status: 'script_generated' })
  writeJson('video.project.json', pj)
  mkdirSync(file('scenes/001-scene/assets'), { recursive: true })
  writeJson('scenes/001-scene/scene.json', { id: 'scene-001', title: 'Scene', narration: { scriptFile: 'script.md' }, durationSec: null, status: 'draft', locked: false, ...scene })
  writeFileSync(file('scenes/001-scene/script.md'), script)
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(file(rel)), { recursive: true })
    writeFileSync(file(rel), text)
  }
}

test('validate stops a web-capture scene in a template without capture', () => {
  const scene = {
    purpose: 'feature',
    visual: { type: 'web-capture', description: '首頁', capture: { url: 'https://example.com', actions: [{ do: 'wait', ms: 500 }] } },
  }
  for (const [name, rel] of Object.entries(TEMPLATES)) {
    const dir = unpack(rel)
    try {
      fillProject(dir, { ...PIPELINE.product, scene })
      const r = spawnSync(process.execPath, ['scripts/validate.mjs'], { cwd: dir, encoding: 'utf8' })
      if (name === 'story') {
        assert.equal(r.status, 1)
        assert.match(r.stderr, /visual\.type web-capture needs pnpm run capture, which this project's template \(story-video\) does not have/)
      } else {
        assert.equal(r.status, 0, `${name}: ${r.stderr}`)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

test('each unzipped template runs its kind\'s pipeline: build_scene, then assemble', async (t) => {
  for (const [kind, setup] of Object.entries(PIPELINE)) {
    const dir = unpack(TEMPLATES[kind])
    const env = process.env.VIDEO_AGENT_FAKE_TTS
    process.env.VIDEO_AGENT_FAKE_TTS = '1'
    try {
      const file = (rel) => join(dir, rel)
      fillProject(dir, setup)

      const { assembleVideo, buildScene } = await import(pathToFileURL(file('scripts/lib/runner.mjs')).href)
      const built = await buildScene(dir, 'scene-001', { by: 'agent' })
      const output = built.log.map((s) => `${s.step}: ${s.output}`).join('\n')
      if (/no usable browser/.test(output)) {
        t.skip('no browser available')
        continue
      }
      assert.ok(built.ok, `${kind}\n${output}`)
      assert.deepEqual(built.log.map((s) => s.step).includes('capture'), kind === 'product', `${kind}: ${built.log.map((s) => s.step)}`)
      const assembled = await assembleVideo(dir, { by: 'agent' })
      assert.ok(assembled.ok, `${kind}\n${assembled.output}`)
      assert.ok(existsSync(file('output/final.mp4')), kind)
      assert.equal(JSON.parse(readFileSync(file('video.project.json'), 'utf8')).status, 'completed')
    } finally {
      if (env === undefined) delete process.env.VIDEO_AGENT_FAKE_TTS
      else process.env.VIDEO_AGENT_FAKE_TTS = env
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

test('the unzipped templates run: validate flags the placeholder project', () => {
  for (const slug of Object.keys(APPS)) {
    const dir = unpack(`api/${slug}/templates/${slug}-video.zip`)
    try {
      const r = spawnSync(process.execPath, ['scripts/validate.mjs'], { cwd: dir, encoding: 'utf8' })
      assert.equal(r.status, 1)
      assert.match(r.stderr, /project\.id is the template placeholder/)
      assert.doesNotMatch(r.stderr, /schema|not found|Cannot find/i, r.stderr)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
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

test('platform index.json catalogs all reference tools', () => {
  assert.equal(catalog.platform, 'AOA')
  const written = JSON.parse(readFileSync(join(out, 'api/index.json'), 'utf8'))
  for (const slug of ['story', 'product', 'slide']) {
    assert.equal(catalog.tools[slug].index, `${SITE}/api/${slug}/index.json`)
    assert.equal(written.tools[slug].workbench, `${SITE}/${slug}/`)
  }
})

/** Every file /api/video published before Video Studio split into apps/product and apps/story. */
const LEGACY_VIDEO_FILES = [
  'agent-guide.md', 'index.json', 'story-guide.md', 'workflow.json',
  'prompts/analyze-product.md', 'prompts/analyze-style.md', 'prompts/scene-script.md', 'prompts/storyboard.md',
  'rules/script.md', 'rules/visual.md',
  'schemas/activity.schema.json', 'schemas/common.schema.json', 'schemas/project.schema.json', 'schemas/scene.schema.json', 'schemas/workflow.schema.json',
  'skills/product-video.zip', 'skills/product-video/SKILL.md', 'skills/product-video/rendering-guide.md', 'skills/product-video/script-guide.md', 'skills/product-video/workflow.md',
  'skills/story-video.zip', 'skills/story-video/SKILL.md', 'skills/story-video/design-guide.md', 'skills/story-video/rendering-guide.md', 'skills/story-video/story-guide.md',
  'templates/product-video.zip', 'templates/product-video/manifest.json',
]

test('/api/video keeps its published layout for agents and installed Skills', () => {
  for (const rel of LEGACY_VIDEO_FILES) assert.ok(existsSync(join(out, 'api/video', rel)), rel)
  assert.ok(!existsSync(join(out, '.legacy-video')), 'scratch directory is removed')
  const index = JSON.parse(read('api/video/index.json'))
  assert.match(index.deprecated, /\/api\/product\/index\.json/)
  assert.equal(index.entries.story, `${SITE}/api/video/story-guide.md`)
  assert.equal(index.checksums.skill, sha256(read('api/video/skills/product-video.zip')))
  assert.equal(index.checksums.storySkill, sha256(read('api/video/skills/story-video.zip')))
  assert.equal(index.checksums.template, sha256(read('api/video/templates/product-video.zip')))
  // One template serves both kinds, as before: its workflow has every step, story-only ones marked.
  const workflow = JSON.parse(strFromU8(unzip('api/video/templates/product-video.zip')['schemas/workflow.json']))
  const kinds = Object.fromEntries(workflow.steps.map((s) => [s.id, s.kinds ?? null]))
  assert.deepEqual(kinds, { init: null, analyze: ['product'], develop_story: ['story'], design: ['story'], storyboard: null, build_scene: null, assemble: null })
  // The story Skill there stays inside /api/video.
  const story = strFromU8(unzip('api/video/skills/story-video.zip')['story-video/SKILL.md'])
  assert.match(story, new RegExp(`${SITE}/api/video/templates/product-video.zip`))
  assert.match(story, new RegExp(`${SITE}/api/video/skills/product-video/SKILL.md`))
  assert.doesNotMatch(story, /\/api\/(product|story)\//)
})
