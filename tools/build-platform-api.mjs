// Generates the top-level dist/api/index.json catalog for the entire AOA platform.
// Runs as the final step of the build pipeline.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
      video: {
        name: 'Video Studio',
        mode: 'Mode B (Companion)',
        workbench: `${siteUrl}/video/`,
        index: `${siteUrl}/api/video/index.json`,
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
  return catalog
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
