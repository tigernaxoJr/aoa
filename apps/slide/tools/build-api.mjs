// Builds Slide Guide API: dist/api/slide/* (schemas, skills, template zips)
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
const TEMPLATE_EXCLUDE = [/(^|\/)node_modules\//, /^\.tmp\//, /^output\//]
const ZIP_MTIME = new Date(1980, 0, 1)

export function build({ siteUrl = '', out = resolve(root, 'dist') } = {}) {
  siteUrl = siteUrl.replace(/\/+$/, '')
  const apiDir = join(out, 'api', 'slide')
  const write = (rel, data) => {
    const file = join(out, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, data)
    return file
  }

  rmSync(apiDir, { recursive: true, force: true })

  // 1. Schemas & workflow
  for (const f of SCHEMAS) {
    write(`api/slide/schemas/${f}`, readFileSync(join(specsDir, f)))
  }
  const workflowText = readFileSync(join(specsDir, 'workflow.json'), 'utf8')
  write('api/slide/workflow.json', workflowText)

  // 2. Skill docs & zip
  const skillDocs = Object.fromEntries(
    readdirSync(skillDir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => [f, readFileSync(join(skillDir, f), 'utf8')]),
  )
  for (const [f, text] of Object.entries(skillDocs)) {
    write(`api/slide/skills/slidev-deck/${f}`, text)
  }
  const skillZip = zip(Object.entries(skillDocs).map(([f, text]) => [`slidev-deck/${f}`, text]))
  write('api/slide/skills/slidev-deck.zip', skillZip)

  // 3. Template zip
  const templateFiles = listFiles(templateDir)
    .map((file) => relative(templateDir, file).split('\\').join('/'))
    .filter((rel) => !TEMPLATE_EXCLUDE.some((re) => re.test(rel)))
    .map((rel) => [rel, readFileSync(join(templateDir, rel))])

  templateFiles.sort(([a], [b]) => (a < b ? -1 : 1))
  const templateZip = zip(templateFiles)
  write('api/slide/templates/slidev-deck.zip', templateZip)

  const manifest = {
    name: 'slidev-deck',
    specVersion: '1.0.0',
    zip: {
      url: `${siteUrl}/api/slide/templates/slidev-deck.zip`,
      sha256: sha256(templateZip),
      size: templateZip.length,
    },
    files: templateFiles.map(([path, data]) => ({
      path,
      sha256: sha256(data),
      size: bytes(data).length,
    })),
  }
  write('api/slide/templates/slidev-deck/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)

  const index = {
    specVersion: '1.0.0',
    siteUrl,
    workflow: `${siteUrl}/api/slide/workflow.json`,
    schemas: Object.fromEntries(SCHEMAS.map((f) => [f.replace('.schema.json', ''), `${siteUrl}/api/slide/schemas/${f}`])),
    skill: `${siteUrl}/api/slide/skills/slidev-deck.zip`,
    skillDocs: `${siteUrl}/api/slide/skills/slidev-deck/SKILL.md`,
    template: `${siteUrl}/api/slide/templates/slidev-deck.zip`,
    templateManifest: `${siteUrl}/api/slide/templates/slidev-deck/manifest.json`,
    checksums: {
      skill: sha256(skillZip),
      template: sha256(templateZip),
    },
  }
  write('api/slide/index.json', `${JSON.stringify(index, null, 2)}\n`)

  return { index, manifest }
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
    zipSync(
      Object.fromEntries(
        entries.map(([path, data]) => [path, [new Uint8Array(bytes(data)), { mtime: ZIP_MTIME }]]),
      ),
      { level: 9 },
    ),
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(root, 'dist')
  const { index, manifest } = build({ out })
  console.log(`built slide API in ${relative(root, out) || '.'}`)
  console.log(`  template: ${manifest.files.length} files, sha256 ${index.checksums.template.slice(0, 12)}...`)
  console.log(`  skill:    sha256 ${index.checksums.skill.slice(0, 12)}...`)
}
