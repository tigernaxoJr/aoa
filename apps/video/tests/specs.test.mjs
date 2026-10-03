// Validates specs/examples: every file in valid/ must pass, every file in invalid/ must fail.
// Also validates workflow.json, template project, skill frontmatters and links.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const specsDir = fileURLToPath(new URL('../specs/', import.meta.url))
const rootDir = fileURLToPath(new URL('../', import.meta.url))
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false })
addFormats(ajv)
for (const name of ['common', 'project', 'scene', 'activity', 'workflow']) {
  ajv.addSchema(readJson(join(specsDir, `${name}.schema.json`)))
}
const validators = {
  project: ajv.getSchema('project.schema.json'),
  scene: ajv.getSchema('scene.schema.json'),
  activity: ajv.getSchema('activity.schema.json'),
}

test('specs/examples valid and invalid schemas', () => {
  for (const expectValid of [true, false]) {
    const dir = join(specsDir, 'examples', expectValid ? 'valid' : 'invalid')
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
      const kind = file.match(/\.(project|scene|activity)\.json$/)?.[1]
      assert.ok(kind, `${file}: name must end with .project.json, .scene.json or .activity.json`)
      const validate = validators[kind]
      const ok = validate(readJson(join(dir, file)))
      const msg = validate.errors ? validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`).join(', ') : ''
      assert.equal(ok, expectValid, `${expectValid ? 'valid' : 'invalid'} ${file}: expected ${expectValid ? 'pass' : 'fail'}. ${msg}`)
    }
  }
})

test('workflow.json structure and transitions', () => {
  const workflow = readJson(join(specsDir, 'workflow.json'))
  const validateWorkflow = ajv.getSchema('workflow.schema.json')
  assert.ok(validateWorkflow(workflow), 'workflow.json must match workflow.schema.json')

  const statusEnums = {
    project: ajv.getSchema('project.schema.json#/$defs/projectStatus').schema.enum,
    scene: ajv.getSchema('scene.schema.json#/$defs/sceneStatus').schema.enum,
  }
  const all = [...workflow.steps, ...workflow.operations]
  const seen = { id: new Set(), command: new Set() }
  for (const step of all) {
    for (const key of ['id', 'command']) {
      assert.ok(!seen[key].has(step[key]), `duplicate ${key} ${step[key]}`)
      seen[key].add(step[key])
    }
    for (const gate of step.requires?.gates ?? []) {
      assert.ok(workflow.gates[gate], `${step.id} requires unknown gate ${gate}`)
    }
    for (const action of step.actions) {
      for (const t of action.transitions ?? []) {
        for (const value of [...(t.from ?? []), t.to]) {
          assert.ok(statusEnums[t.target].includes(value), `${step.id}.${action.id}: ${value} is not a ${t.target} status`)
        }
      }
    }
  }
})

test('template video.project.json validates against schema', () => {
  const templateProject = join(rootDir, 'template', 'video.project.json')
  const valid = validators.project(readJson(templateProject))
  assert.ok(valid, `apps/video/template/video.project.json must be valid: ${JSON.stringify(validators.project.errors)}`)
})

test('skills frontmatter in apps/video/skills', () => {
  const SKILLS = ['product-video', 'story-video']
  for (const skill of SKILLS) {
    const frontmatter = readFileSync(join(rootDir, 'skills', skill, 'SKILL.md'), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ''
    const field = (key) => frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1].trim()
    const skillName = field('name')
    const skillDescription = field('description')
    assert.ok(skillName && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillName) && skillName.length <= 64, `${skill}: name must be lowercase-hyphenated, <= 64 chars`)
    assert.equal(skillName, skill, `name must match its directory (${skill})`)
    assert.ok(skillDescription && skillDescription.length <= 1024, `${skill}: description required, <= 1024 chars`)
  }
})

test('skill links and workflow guide links', () => {
  const SKILLS = ['product-video', 'story-video']
  const skillDocs = new Map(
    SKILLS.flatMap((skill) =>
      readdirSync(join(rootDir, 'skills', skill))
        .filter((f) => f.endsWith('.md'))
        .map((f) => [`${skill}/${f}`, readFileSync(join(rootDir, 'skills', skill, f), 'utf8')]),
    ),
  )
  const anchorsOf = (text) => new Set([...text.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]))
  const checkLink = (from, target) => {
    const [file, anchor] = target.split('#')
    assert.ok(skillDocs.has(file), `${from} → ${target}: file not found`)
    if (anchor) {
      assert.ok(anchorsOf(skillDocs.get(file)).has(anchor), `${from} → ${target}: anchor not found`)
    }
  }

  for (const [doc, text] of skillDocs) {
    const skill = doc.split('/')[0]
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:/i.test(target)) continue // external URL
      if (target.startsWith('#')) checkLink(doc, `${doc}${target}`)
      else if (target.startsWith('../')) checkLink(doc, target.slice(3))
      else checkLink(doc, `${skill}/${target}`)
    }
  }

  const workflow = readJson(join(specsDir, 'workflow.json'))
  for (const step of [...workflow.steps, ...workflow.operations]) {
    if (step.guide) checkLink(`workflow.json:${step.id}`, step.guide.replace(/^skills\//, ''))
  }
})
