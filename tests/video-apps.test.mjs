// The two video apps (apps/product, apps/story) against the shared protocol in packages/video-core:
// each workflow's structure and transitions, each Skill's frontmatter, and every link between the
// Skills (the story Skill links into the product one) and from workflow steps to Skill sections.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const repo = fileURLToPath(new URL('../', import.meta.url))
const specsDir = join(repo, 'packages/video-core/specs')
const sharedSkillDir = join(repo, 'packages/video-core/skills')
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const APPS = { product: 'product-video', story: 'story-video' }

const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false })
addFormats(ajv)
for (const name of ['common', 'project', 'scene', 'activity', 'workflow']) ajv.addSchema(readJson(join(specsDir, `${name}.schema.json`)))

for (const [app, skill] of Object.entries(APPS)) {
  test(`apps/${app} workflow.json structure and transitions`, () => {
    const workflow = readJson(join(repo, 'apps', app, 'specs', 'workflow.json'))
    const validateWorkflow = ajv.getSchema('workflow.schema.json')
    assert.ok(validateWorkflow(workflow), `workflow.json must match workflow.schema.json: ${JSON.stringify(validateWorkflow.errors)}`)
    const statusEnums = {
      project: ajv.getSchema('project.schema.json#/$defs/projectStatus').schema.enum,
      scene: ajv.getSchema('scene.schema.json#/$defs/sceneStatus').schema.enum,
    }
    const all = [...workflow.steps, ...workflow.operations]
    const seen = { id: new Set(), command: new Set() }
    for (const step of all) {
      assert.equal(step.kinds, undefined, `${step.id}: each app's workflow is for one kind; no kinds`)
      for (const key of ['id', 'command']) {
        assert.ok(!seen[key].has(step[key]), `duplicate ${key} ${step[key]}`)
        seen[key].add(step[key])
      }
      for (const gate of step.requires?.gates ?? []) assert.ok(workflow.gates[gate], `${step.id} requires unknown gate ${gate}`)
      for (const action of step.actions) {
        for (const t of action.transitions ?? []) {
          for (const value of [...(t.from ?? []), t.to]) {
            assert.ok(statusEnums[t.target].includes(value), `${step.id}.${action.id}: ${value} is not a ${t.target} status`)
          }
        }
      }
    }
  })

  test(`apps/${app} Skill frontmatter`, () => {
    const frontmatter = readFileSync(join(repo, 'apps', app, 'skills', skill, 'SKILL.md'), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ''
    const field = (key) => frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1].trim()
    const name = field('name')
    const description = field('description')
    assert.ok(name && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) && name.length <= 64, `${skill}: name must be lowercase-hyphenated, <= 64 chars`)
    assert.equal(name, skill, `name must match its directory (${skill})`)
    assert.ok(description && description.length <= 1024, `${skill}: description required, <= 1024 chars`)
  })
}

test('Skill links and workflow guide links resolve', () => {
  const shared = readdirSync(sharedSkillDir).filter((f) => f.endsWith('.md'))
  // Each Skill as published: its own documents plus the shared ones.
  const skillDocs = new Map(
    Object.entries(APPS).flatMap(([app, skill]) => [
      ...readdirSync(join(repo, 'apps', app, 'skills', skill))
        .filter((f) => f.endsWith('.md'))
        .map((f) => [`${skill}/${f}`, readFileSync(join(repo, 'apps', app, 'skills', skill, f), 'utf8')]),
      ...shared.map((f) => [`${skill}/${f}`, readFileSync(join(sharedSkillDir, f), 'utf8')]),
    ]),
  )
  const anchorsOf = (text) => new Set([...text.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]))
  const checkLink = (from, target) => {
    const [file, anchor] = target.split('#')
    assert.ok(skillDocs.has(file), `${from} → ${target}: file not found`)
    if (anchor) assert.ok(anchorsOf(skillDocs.get(file)).has(anchor), `${from} → ${target}: anchor not found`)
  }

  for (const [doc, text] of skillDocs) {
    const skill = doc.split('/')[0]
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:/i.test(target) || target.startsWith('{{')) continue // external URL or published-URL placeholder
      if (target.startsWith('#')) checkLink(doc, `${doc}${target}`)
      else if (target.startsWith('../')) checkLink(doc, target.slice(3))
      // A shared document's links to documents this Skill lacks are published as links into product-video.
      else if (shared.includes(doc.split('/')[1]) && !skillDocs.has(`${skill}/${target.split('#')[0]}`)) checkLink(doc, `product-video/${target}`)
      else checkLink(doc, `${skill}/${target}`)
    }
  }

  for (const app of Object.keys(APPS)) {
    const workflow = readJson(join(repo, 'apps', app, 'specs', 'workflow.json'))
    for (const step of [...workflow.steps, ...workflow.operations]) {
      if (step.guide) checkLink(`apps/${app} workflow.json:${step.id}`, step.guide.replace(/^skills\//, ''))
    }
  }
})

test('the template tests\' workflow fixture is both apps\' workflows merged', async () => {
  const { mergeWorkflows } = await import('../packages/video-core/tools/build-video-api.mjs')
  const merged = mergeWorkflows({ product: readJson(join(repo, 'apps/product/specs/workflow.json')), story: readJson(join(repo, 'apps/story/specs/workflow.json')) })
  const fixture = readJson(join(repo, 'packages/video-core/tests/template/fixtures/workflow.json'))
  // Only the scaffold URL differs: the fixture keeps the /api/video one.
  assert.deepEqual(JSON.parse(JSON.stringify(merged).replaceAll('/api/product/', '/api/video/')), fixture, 'run: update packages/video-core/tests/template/fixtures/workflow.json')
})
