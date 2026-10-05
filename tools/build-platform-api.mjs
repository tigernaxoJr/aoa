// Generates the top-level dist/api/index.json catalog for the entire AOA platform, and the
// backward-compatible /api/video/* of the former Video Studio. Runs as the final step of the build.
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as product } from '../apps/product/tools/build-api.mjs'
import { config as story } from '../apps/story/tools/build-api.mjs'
import { buildVideoApi, mergeWorkflows } from '../packages/video-core/tools/build-video-api.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))

export function resolveSiteUrl(flag) {
  let explicit = flag ?? process.env.SITE_URL
  if (explicit) {
    explicit = explicit.trim().replace(/\/+$/, '')
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(explicit)) explicit = `https://${explicit}`
    if (/^https?:\/\/[^/]+/.test(explicit)) return explicit
    if (explicit && explicit !== 'true' && explicit !== 'false') throw new Error(`SITE_URL "${explicit}" is not a URL`)
  }
  let repo = process.env.GITHUB_REPOSITORY
  if (!repo) {
    try {
      const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' }).trim()
      repo = /github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/.exec(remote)?.[1]
    } catch {
      // no git or no remote
    }
  }
  if (!repo) throw new Error('cannot determine the site URL; pass --site-url or set SITE_URL')
  const [owner, name] = repo.split('/')
  const host = `${owner.toLowerCase()}.github.io`
  return name.toLowerCase() === host ? `https://${host}` : `https://${host}/${name}`
}

export function build({ siteUrl, out = resolve(root, 'dist') } = {}) {
  siteUrl = siteUrl.replace(/\/+$/, '')
  const catalog = {
    platform: 'AOA',
    name: 'Agent-Offloaded Architecture',
    siteUrl,
    description: 'A catalog of AOA reference tools and their agent specification endpoints.',
    tools: {
      story: {
        name: 'Story Video Studio',
        mode: 'Mode B (Companion)',
        workbench: `${siteUrl}/story/`,
        index: `${siteUrl}/api/story/index.json`,
      },
      product: {
        name: 'Product Video Studio',
        mode: 'Mode B (Companion)',
        workbench: `${siteUrl}/product/`,
        index: `${siteUrl}/api/product/index.json`,
      },
      slide: {
        name: 'Slide Studio',
        mode: 'Mode A (Pure workbench)',
        workbench: `${siteUrl}/slide/`,
        index: `${siteUrl}/api/slide/index.json`,
      },
    },
  }

  const target = join(out, 'api', 'index.json')
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, `${JSON.stringify(catalog, null, 2)}\n`)
  buildLegacyVideoApi({ siteUrl, out })
  return catalog
}

/**
 * /api/video/* as published before Video Studio split into apps/product and apps/story. Agents and
 * installed Skills still use these URLs, so the old layout stays: the product API at /api/video with
 * a workflow for both kinds, plus the story Skill and story-guide.md.
 */
function buildLegacyVideoApi({ siteUrl, out }) {
  const read = (app) => JSON.parse(readFileSync(join(app.appDir, 'specs', 'workflow.json'), 'utf8'))
  const workflow = mergeWorkflows({ product: read(product), story: read(story) })
  // kind: null — the one template serves both kinds, so it keeps every kind's scripts.
  const legacy = { slug: 'video', template: 'product-video', kind: null, workflowText: `${JSON.stringify(workflow, null, 2)}\n`.replaceAll('/api/product/', '/api/video/') }
  buildVideoApi({ ...product, ...legacy, siteUrl, out })
  // The story Skill, built for /api/video into a scratch directory, then moved next to the product one.
  const scratch = join(out, '.legacy-video')
  const s = buildVideoApi({ ...story, ...legacy, siblings: { 'product-video': 'video' }, siteUrl, out: scratch })
  const api = join(out, 'api', 'video')
  for (const rel of ['skills/story-video', 'skills/story-video.zip']) cpSync(join(scratch, 'api', 'video', rel), join(api, rel), { recursive: true })
  cpSync(join(scratch, 'api', 'video', 'agent-guide.md'), join(api, 'story-guide.md'))
  rmSync(scratch, { recursive: true, force: true })

  const indexFile = join(api, 'index.json')
  const index = JSON.parse(readFileSync(indexFile, 'utf8'))
  const base = `${siteUrl}/api/video`
  Object.assign(index, {
    deprecated: `Video Studio split into ${siteUrl}/product/ and ${siteUrl}/story/; use ${siteUrl}/api/product/index.json and ${siteUrl}/api/story/index.json.`,
    entries: { product: `${base}/agent-guide.md`, story: `${base}/story-guide.md` },
    skills: {
      product: { zip: `${base}/skills/product-video.zip`, docs: `${base}/skills/product-video/SKILL.md` },
      story: { zip: `${base}/skills/story-video.zip`, docs: `${base}/skills/story-video/SKILL.md` },
    },
  })
  index.checksums.storySkill = s.index.checksums.skill
  writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const flag = (name) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args[i + 1] : undefined
  }
  const siteUrl = resolveSiteUrl(flag('site-url'))
  const out = resolve(root, flag('out') ?? 'dist')
  build({ siteUrl, out })
  console.log(`built dist/api/index.json for ${siteUrl}`)
}
