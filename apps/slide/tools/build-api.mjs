// Builds the Slide Guide API: dist/api/slide/* (schemas, workflow, Skill and template zips, manifest).
// Runs after the video apps' build-api.mjs; this tool only touches api/slide/.
//
//   node apps/slide/tools/build-api.mjs [--site-url <url>] [--out <dir>]
//
// The site URL comes from --site-url, then SITE_URL, then GITHUB_REPOSITORY or the git remote
// (https://<owner>.github.io/<repo>). `{{SITE_URL}}` in the Skill and in template text files is
// replaced with it, so the published files carry absolute links.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'

const slideDir = fileURLToPath(new URL('../', import.meta.url))
const root = fileURLToPath(new URL('../../../', import.meta.url))
const specsDir = join(slideDir, 'specs')
const skillDir = join(slideDir, 'skills', 'slidev-deck')
const templateDir = join(slideDir, 'template')

const SCHEMAS = ['project.schema.json', 'activity.schema.json']
// template/schemas/ is a convenience copy for running the scripts in the repo; the zip takes specs/ instead.
const TEMPLATE_EXCLUDE = [/(^|\/)node_modules\//, /^\.tmp\//, /^output\//, /^dist\//, /^schemas\//]
const TEXT = /\.(md|mjs|vue|json)$/
const ZIP_MTIME = new Date(1980, 0, 1)

export function build({ siteUrl, out = resolve(root, 'dist') } = {}) {
  if (!siteUrl) throw new Error('build({ siteUrl }) needs the site URL')
  siteUrl = siteUrl.replace(/\/+$/, '')
  const api = `${siteUrl}/api/slide`
  const sub = (text) => text.replaceAll('{{SITE_URL}}', siteUrl)
  const write = (rel, data) => {
    const file = join(out, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, data)
    return file
  }

  rmSync(join(out, 'api', 'slide'), { recursive: true, force: true })

  // Schemas and workflow
  for (const f of SCHEMAS) write(`api/slide/schemas/${f}`, readFileSync(join(specsDir, f)))
  const workflow = JSON.parse(readFileSync(join(specsDir, 'workflow.json'), 'utf8'))
  write('api/slide/workflow.json', readFileSync(join(specsDir, 'workflow.json')))

  // Skill: docs for agents that read it online, plus a zip to install
  const skillDocs = Object.fromEntries(
    readdirSync(skillDir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => [f, sub(readFileSync(join(skillDir, f), 'utf8'))]),
  )
  for (const [f, text] of Object.entries(skillDocs)) write(`api/slide/skills/slidev-deck/${f}`, text)
  const skillZip = zip(Object.entries(skillDocs).map(([f, text]) => [`slidev-deck/${f}`, text]))
  write('api/slide/skills/slidev-deck.zip', skillZip)

  // Template: repo template + schemas (for scripts/validate.mjs and state.mjs) + command files
  const templateFiles = listFiles(templateDir)
    .map((file) => relative(templateDir, file).split('\\').join('/'))
    .filter((rel) => !TEMPLATE_EXCLUDE.some((re) => re.test(rel)))
    .map((rel) => [rel, TEXT.test(rel) ? sub(readFileSync(join(templateDir, rel), 'utf8')) : readFileSync(join(templateDir, rel))])
  templateFiles.push(...[...SCHEMAS, 'workflow.json'].map((f) => [`schemas/${f}`, readFileSync(join(specsDir, f))]))
  templateFiles.push(...claudeCommands(workflow, api))
  templateFiles.sort(([a], [b]) => (a < b ? -1 : 1))
  const templateZip = zip(templateFiles)
  write('api/slide/templates/slidev-deck.zip', templateZip)

  const specVersion = JSON.parse(readFileSync(join(templateDir, 'slide.project.json'), 'utf8')).specVersion
  const manifest = {
    name: 'slidev-deck',
    specVersion,
    zip: { url: `${api}/templates/slidev-deck.zip`, sha256: sha256(templateZip), size: templateZip.length },
    files: templateFiles.map(([path, data]) => ({ path, sha256: sha256(data), size: bytes(data).length })),
  }
  write('api/slide/templates/slidev-deck/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)

  const index = {
    specVersion,
    siteUrl,
    workbench: `${siteUrl}/slide/`,
    entry: `${api}/skills/slidev-deck/SKILL.md`,
    workflow: `${api}/workflow.json`,
    schemas: Object.fromEntries(SCHEMAS.map((f) => [f.replace('.schema.json', ''), `${api}/schemas/${f}`])),
    skill: `${api}/skills/slidev-deck.zip`,
    template: `${api}/templates/slidev-deck.zip`,
    templateManifest: `${api}/templates/slidev-deck/manifest.json`,
    checksums: { skill: sha256(skillZip), template: sha256(templateZip) },
  }
  write('api/slide/index.json', `${JSON.stringify(index, null, 2)}\n`)

  return { index, manifest }
}

/** `.claude/commands/*.md` for every workflow step except init (which runs before the project exists). */
function claudeCommands(workflow, api) {
  return workflow.steps
    .filter((step) => step.command && step.id !== 'init')
    .map((step) => {
      const lines = [
        '---',
        `description: ${step.title}`,
        '---',
        '',
        step.title,
        '',
        `依專案 \`AGENTS.md\` 的規則，執行 \`schemas/workflow.json\` 中 \`steps\` 的 \`${step.id}\`：${step.description}。`,
        `先用 \`pnpm run state activity\` 回報進度；有 \`checkpoint\` 時停下等待使用者確認，完成後以 \`pnpm run state project --status\` 更新狀態。`,
      ]
      if (step.guide) lines.push('', `做法見 slidev-deck Skill 的 \`${step.guide}\`；未安裝 Skill 時讀取 ${api}/skills/slidev-deck/${step.guide}`)
      return [`.claude/commands/${step.command.replace(/^\//, '')}.md`, `${lines.join('\n')}\n`]
    })
}

export function resolveSiteUrl(flag) {
  let explicit = flag ?? process.env.SITE_URL
  if (explicit) {
    explicit = explicit.trim().replace(/\/+$/, '')
    // A bare domain (e.g. a repository variable set to "aoa.tigernaxo.com") means https://.
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(explicit)) explicit = `https://${explicit}`
    if (/^https?:\/\/[^/]+/.test(explicit)) return explicit
    // Anything else is a misconfiguration: falling back to github.io would silently publish the
    // site under the wrong base path and drop the custom domain.
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

function listFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath ?? d.path, d.name))
}

const bytes = (data) => (typeof data === 'string' ? Buffer.from(data) : data)
const sha256 = (data) => createHash('sha256').update(bytes(data)).digest('hex')

function zip(entries) {
  return Buffer.from(
    zipSync(Object.fromEntries(entries.map(([path, data]) => [path, [new Uint8Array(bytes(data)), { mtime: ZIP_MTIME }]])), { level: 9 }),
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const flag = (name) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args[i + 1] : undefined
  }
  const siteUrl = resolveSiteUrl(flag('site-url'))
  const out = resolve(root, flag('out') ?? 'dist')
  const { index, manifest } = build({ siteUrl, out })
  console.log(`built ${relative(root, join(out, 'api', 'slide'))} for ${siteUrl}`)
  console.log(`  template: ${manifest.files.length} files, sha256 ${index.checksums.template.slice(0, 12)}…`)
  console.log(`  skill:    sha256 ${index.checksums.skill.slice(0, 12)}…`)
}
