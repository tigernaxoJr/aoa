// Builds one video app's Guide API: dist/api/<slug>/* (schemas, workflow, prompts, rules, Skill and
// template zips with SHA-256 manifest). Each video app (apps/product, apps/story) calls it from its
// own tools/build-api.mjs with its slug, Skill and workflow; the protocol, shared Skill documents and
// the project template come from packages/video-core. Run after the Web UI build.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'
import { claudeCommands } from './lib/commands.mjs'
import { absolutizeLinks, section, stripFrontmatter } from './lib/markdown.mjs'

const coreDir = fileURLToPath(new URL('../', import.meta.url))
const root = fileURLToPath(new URL('../../../', import.meta.url))
const specsDir = join(coreDir, 'specs')
const templateDir = join(coreDir, 'template')
/** Skill documents shared by every video Skill (packages/video-core/skills). */
const sharedSkillDir = join(coreDir, 'skills')
export const SCHEMAS = ['common.schema.json', 'project.schema.json', 'scene.schema.json', 'activity.schema.json', 'workflow.schema.json']
/** Paths never shipped in the template zip (relative, forward slashes). */
const TEMPLATE_EXCLUDE = [/(^|\/)node_modules\//, /^\.tmp\//, /^output\//, /^scenes\/[^/]+\/output\//, /(^|\/)\.video-agent\.lock$/, /(^|\/)\.venv\//, /(^|\/)__pycache__\//]
/**
 * Template files only one kind of project uses (relative, forward slashes). Each app's template omits
 * the files of the other kinds, the `package.json` scripts that run them, and Markdown lines tagged
 * `<!-- kind:<other> -->`; the legacy /api/video template (no kind) ships everything for both kinds.
 * Tests (tests/site/build.test.mjs) check every shipped script's imports resolve inside its zip.
 */
export const KIND_FILES = {
  product: ['scripts/capture.mjs', 'scripts/login.mjs', 'scripts/lib/login.mjs'],
  story: ['src/lib/rig.js'],
}
const KIND_TAG = /[ \t]*<!-- kind:([a-z]+) -->[ \t]*(?=\r?$)/
const ZIP_MTIME = new Date(1980, 0, 1)

/**
 * @param {object} o
 * @param {string} o.siteUrl
 * @param {string} o.out          output root (dist/)
 * @param {string} o.slug         app slug: workbench at <site>/<slug>/, API at <site>/api/<slug>/
 * @param {string} o.appDir       the app directory (specs/workflow.json, skills/<skill>/)
 * @param {string} o.skill        Skill name (e.g. product-video)
 * @param {string} o.title        what the app makes, for the agent guide title
 * @param {Record<string, {title: string, from: [string, string|null][]}>} [o.extracts] prompts/rules cut from the Skill
 * @param {Record<string, string>} [o.siblings] other video Skills this one links to (`../<skill>/x.md`) → their app slug
 * @param {string} [o.template]   template name (default `<slug>-video`)
 * @param {string} [o.workflowText] workflow.json contents (default the app's specs/workflow.json)
 * @param {string|null} [o.kind] project kind the template is for (a key of KIND_FILES); null ships every kind's files
 */
export function buildVideoApi({ siteUrl, out, slug, appDir, skill, title, extracts = {}, siblings = {}, template = `${slug}-video`, workflowText, kind = null }) {
  siteUrl = siteUrl.replace(/\/+$/, '')
  const api = `${siteUrl}/api/${slug}`
  const skillUrlOf = (name) => (name === skill ? `${api}/skills/${skill}` : `${siteUrl}/api/${siblings[name]}/skills/${name}`)
  const skillUrl = skillUrlOf(skill)
  const sub = (text) => text.replaceAll('{{TEMPLATE_URL}}', `${api}/templates/${template}`).replaceAll('{{API_URL}}', api).replaceAll('{{APP_URL}}', `${siteUrl}/${slug}`).replaceAll('{{SITE_URL}}', siteUrl)
  const write = (rel, data) => {
    const file = join(out, 'api', slug, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, data)
    return file
  }
  // Only dist/api/<slug> belongs to this call; other apps and the portal own their directories.
  rmSync(join(out, 'api', slug), { recursive: true, force: true })

  // Schemas and workflow
  for (const f of SCHEMAS) write(`schemas/${f}`, readFileSync(join(specsDir, f)))
  workflowText ??= readFileSync(join(appDir, 'specs', 'workflow.json'), 'utf8')
  write('workflow.json', workflowText)
  const workflow = JSON.parse(workflowText)

  // Skill: its own documents plus the shared ones. Links into a sibling Skill point at the local copy
  // when it is a shared document, otherwise at the sibling's published Skill.
  const ownDir = join(appDir, 'skills', skill)
  const shared = mdFiles(sharedSkillDir)
  const own = mdFiles(ownDir)
  const local = [...own, ...shared]
  const skillDocs = Object.fromEntries(
    [
      ...own.map((f) => [f, Object.keys(siblings).reduce((text, sib) => linkSibling(text, sib, skillUrlOf(sib), shared), sub(readFileSync(join(ownDir, f), 'utf8')))]),
      // A shared document's links to documents this Skill lacks go to the first sibling that has them.
      ...shared.map((f) => {
        const text = sub(readFileSync(join(sharedSkillDir, f), 'utf8'))
        const sib = Object.keys(siblings)[0]
        return [f, sib ? absolutizeLinks(text, skillUrlOf(sib), f, local) : text]
      }),
    ].sort(([a], [b]) => (a < b ? -1 : 1)),
  )
  for (const [f, text] of Object.entries(skillDocs)) write(`skills/${skill}/${f}`, text)
  const skillZip = zip(Object.entries(skillDocs).map(([f, text]) => [`${skill}/${f}`, text]))
  write(`skills/${skill}.zip`, skillZip)

  // Prompts and rules
  for (const [rel, { title: heading, from }] of Object.entries(extracts)) {
    const parts = from.map(([file, anchor]) => {
      const text = anchor ? section(skillDocs[file], anchor) : stripFrontmatter(skillDocs[file])
      return absolutizeLinks(text, skillUrl, file)
    })
    const sources = [...new Set(from.map(([file, anchor]) => `${skillUrl}/${file}${anchor ? `#${anchor}` : ''}`))]
    write(rel, `# ${heading}\n\n> 由 Skill 文件產生，請勿直接修改。來源：${sources.join('、')}\n\n${parts.join('\n\n---\n\n')}\n`)
  }

  // Agent guide: the Skill entry point for agents that do not install Skills
  const skillBody = absolutizeLinks(stripFrontmatter(skillDocs['SKILL.md']).replace(/^# .*\n+/, ''), skillUrl, 'SKILL.md')
  write('agent-guide.md', agentGuide(skillBody, { api, skill, title, template }))

  // Template: the shared template (this kind's part) + synced schemas + this app's workflow + generated command files
  const omit = templateOmit(kind)
  const templateFiles = listFiles(templateDir)
    .map((file) => relative(templateDir, file).split('\\').join('/'))
    .filter((rel) => !TEMPLATE_EXCLUDE.some((re) => re.test(rel)) && !omit.has(rel))
    .map((rel) => [rel, templateFile(rel, readFileSync(join(templateDir, rel)), { kind, omit, sub })])
  templateFiles.push(...SCHEMAS.map((f) => [`schemas/${f}`, readFileSync(join(specsDir, f))]))
  templateFiles.push(['schemas/workflow.json', workflowText])
  templateFiles.push(...claudeCommands(workflow, skillUrlOf).map((c) => [c.path, c.content]))
  templateFiles.sort(([a], [b]) => (a < b ? -1 : 1))
  const templateZip = zip(templateFiles)
  write(`templates/${template}.zip`, templateZip)

  const specVersion = JSON.parse(readFileSync(join(templateDir, 'video.project.json'), 'utf8')).specVersion
  const manifest = {
    name: template,
    specVersion,
    zip: { url: `${api}/templates/${template}.zip`, sha256: sha256(templateZip), size: templateZip.length },
    files: templateFiles.map(([path, data]) => ({ path, sha256: sha256(data), size: bytes(data).length })),
  }
  write(`templates/${template}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`)

  const index = {
    specVersion,
    siteUrl,
    workbench: `${siteUrl}/${slug}/`,
    entry: `${api}/agent-guide.md`,
    workflow: `${api}/workflow.json`,
    schemas: Object.fromEntries(SCHEMAS.map((f) => [f.replace('.schema.json', ''), `${api}/schemas/${f}`])),
    prompts: Object.fromEntries(Object.keys(extracts).filter((k) => k.startsWith('prompts/')).map((k) => [k.slice(8, -3), `${api}/${k}`])),
    rules: Object.fromEntries(Object.keys(extracts).filter((k) => k.startsWith('rules/')).map((k) => [k.slice(6, -3), `${api}/${k}`])),
    skill: `${api}/skills/${skill}.zip`,
    skillDocs: `${skillUrl}/SKILL.md`,
    template: `${api}/templates/${template}.zip`,
    templateManifest: `${api}/templates/${template}/manifest.json`,
    checksums: { skill: sha256(skillZip), template: sha256(templateZip) },
  }
  write('index.json', `${JSON.stringify(index, null, 2)}\n`)
  return { index, manifest }
}

/** Template files a `kind` template leaves out: the files only other kinds use. */
function templateOmit(kind) {
  if (kind == null) return new Set()
  if (!KIND_FILES[kind]) throw new Error(`unknown template kind "${kind}" (expected ${Object.keys(KIND_FILES).join(', ')})`)
  return new Set(Object.entries(KIND_FILES).flatMap(([k, files]) => (k === kind ? [] : files)))
}

/** One template file as shipped: URLs substituted, other kinds' lines and package.json scripts removed. */
function templateFile(rel, data, { kind, omit, sub }) {
  if (rel.endsWith('.md')) {
    const lines = data.toString('utf8').split('\n').flatMap((line) => {
      const tag = KIND_TAG.exec(line)
      if (!tag) return [line]
      if (!KIND_FILES[tag[1]]) throw new Error(`${rel}: unknown kind tag "${tag[1]}"`)
      return kind == null || tag[1] === kind ? [line.replace(KIND_TAG, '')] : []
    })
    return sub(lines.join('\n'))
  }
  if (rel.endsWith('.mjs')) return sub(data.toString('utf8'))
  if (rel === 'package.json' && omit.size) {
    const pkg = JSON.parse(data.toString('utf8'))
    const runs = (cmd) => /node (\S+\.mjs)/.exec(cmd)?.[1]
    pkg.scripts = Object.fromEntries(Object.entries(pkg.scripts).filter(([, cmd]) => !omit.has(runs(cmd))))
    return `${JSON.stringify(pkg, null, 2)}\n`
  }
  return data
}

function agentGuide(skillBody, { api, skill, title, template }) {
  return `# Agent Video Producer — ${title} Agent 指引

> 給任何能讀檔、執行指令的 Coding Agent。本文件與 ${skill} Skill 的 \`SKILL.md\` 內容相同；支援 Agent Skills 的 Agent 可改為安裝 Skill（見文末）。
> 網站只提供規則與範本，不執行任何 AI 或渲染；所有工作都在使用者的電腦上完成。

${skillBody.trim()}

## 安裝 Skill（可選）

下載 ${api}/skills/${skill}.zip，解壓到 Agent 的 skills 目錄（Claude Code：使用者層級 \`~/.claude/skills/\`，或專案內 \`.claude/skills/\`）。zip 的 SHA-256 在 ${api}/index.json 的 \`checksums.skill\`。

## 資源

| 資源 | 網址 |
|---|---|
| 資源索引 | ${api}/index.json |
| 工作流程 | ${api}/workflow.json |
| 專案範本 | ${api}/templates/${template}.zip（雜湊：${api}/templates/${template}/manifest.json） |
| Skill 文件 | ${api}/skills/${skill}/SKILL.md |
`
}

/**
 * Rewrites links into a sibling Skill (\`](../<sibling>/file.md#x)\`): to the local copy when \`file\`
 * is in \`shared\`, otherwise to the sibling's published URL.
 */
function linkSibling(markdown, sibling, siblingUrl, shared) {
  return markdown.replace(new RegExp(`\\]\\(\\.\\./${sibling}/([^)\\s]+)\\)`, 'g'), (all, target) =>
    shared.includes(target.split('#')[0]) ? `](${target})` : `](${siblingUrl}/${target})`,
  )
}

const mdFiles = (dir) => readdirSync(dir).filter((f) => f.endsWith('.md')).sort()

function listFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath ?? d.path, d.name))
}

/**
 * One workflow for both kinds, as /api/video published it before the apps split: steps only one
 * kind has are kept with `kinds`, in the order they appear in that kind's workflow; steps both have
 * keep the first workflow's version.
 */
export function mergeWorkflows(byKind) {
  const kinds = Object.keys(byKind)
  const [first] = kinds
  const merged = { ...byKind[first] }
  for (const list of ['steps', 'operations']) {
    const out = byKind[first][list].map((s) => ({ ...s }))
    for (const kind of kinds.slice(1)) {
      const ids = new Set(byKind[kind][list].map((s) => s.id))
      let after = -1
      for (const step of byKind[kind][list]) {
        const at = out.findIndex((s) => s.id === step.id)
        if (at >= 0) {
          after = at
          continue
        }
        // After the predecessor and the steps this kind lacks that follow it.
        while (after + 1 < out.length && !ids.has(out[after + 1].id)) after++
        out.splice(++after, 0, { ...step, kinds: [kind] })
      }
    }
    for (const step of out) {
      if (step.kinds) continue
      const has = kinds.filter((k) => byKind[k][list].some((s) => s.id === step.id))
      if (has.length < kinds.length) step.kinds = has
    }
    merged[list] = out.map(({ kinds: k, ...rest }) => (k ? { id: rest.id, title: rest.title, command: rest.command, kinds: k, ...rest } : rest))
  }
  return merged
}

const bytes = (data) => (typeof data === 'string' ? Buffer.from(data) : data)
export const sha256 = (data) => createHash('sha256').update(bytes(data)).digest('hex')

function zip(entries) {
  return Buffer.from(zipSync(Object.fromEntries(entries.map(([path, data]) => [path, [new Uint8Array(bytes(data)), { mtime: ZIP_MTIME }]])), { level: 9 }))
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

/** Runs `build` when `moduleUrl` is the script node was started with: `node <script> [--site-url <url>] [--out <dir>]`. */
export function runCli(moduleUrl, build) {
  if (!process.argv[1] || resolve(process.argv[1]) !== fileURLToPath(moduleUrl)) return
  const args = process.argv.slice(2)
  const flag = (name) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args[i + 1] : undefined
  }
  const siteUrl = resolveSiteUrl(flag('site-url'))
  const out = resolve(root, flag('out') ?? 'dist')
  const { index, manifest } = build({ siteUrl, out })
  console.log(`built ${index.entry.replace(/agent-guide\.md$/, '')}`)
  console.log(`  template: ${manifest.files.length} files, sha256 ${index.checksums.template.slice(0, 12)}…`)
  console.log(`  skill:    sha256 ${index.checksums.skill.slice(0, 12)}…`)
}
