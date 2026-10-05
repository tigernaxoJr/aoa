// Validates apps/slide/specs examples and workflow
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const specsDir = fileURLToPath(new URL('../specs/', import.meta.url))
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false })
addFormats(ajv)
for (const name of ['project', 'activity', 'check']) {
  ajv.addSchema(readJson(join(specsDir, `${name}.schema.json`)))
}
const validators = {
  project: ajv.getSchema('project.schema.json'),
  activity: ajv.getSchema('activity.schema.json'),
  check: ajv.getSchema('check.schema.json'),
}

test('slide specs/examples valid and invalid schemas', () => {
  for (const expectValid of [true, false]) {
    const dir = join(specsDir, 'examples', expectValid ? 'valid' : 'invalid')
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
      const kind = file.match(/\.(project|activity|check)\.json$/)?.[1]
      assert.ok(kind, `${file}: name must end with .project.json, .activity.json or .check.json`)
      const validate = validators[kind]
      const ok = validate(readJson(join(dir, file)))
      const msg = validate.errors ? validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`).join(', ') : ''
      assert.equal(ok, expectValid, `${expectValid ? 'valid' : 'invalid'} ${file}: expected ${expectValid ? 'pass' : 'fail'}. ${msg}`)
    }
  }
})

test('slide workflow.json structure', () => {
  const workflow = readJson(join(specsDir, 'workflow.json'))
  assert.equal(workflow.version, '1.0.0')
  assert.ok(Array.isArray(workflow.steps))
  assert.ok(workflow.steps.length >= 3)
  const seen = new Set()
  for (const step of workflow.steps) {
    assert.ok(step.id && step.title && step.command)
    assert.ok(!seen.has(step.id), `duplicate step ${step.id}`)
    seen.add(step.id)
  }
})

test('slide skill links and workflow guide links resolve', () => {
  const skillDir = fileURLToPath(new URL('../skills/slidev-deck/', import.meta.url))
  const docs = new Map(readdirSync(skillDir).filter((f) => f.endsWith('.md')).map((f) => [f, readFileSync(join(skillDir, f), 'utf8')]))
  const anchors = (text) => new Set([...text.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]))
  const check = (from, target) => {
    const [file, anchor] = target.split('#')
    assert.ok(docs.has(file), `${from} → ${target}: file not found`)
    if (anchor) assert.ok(anchors(docs.get(file)).has(anchor), `${from} → ${target}: anchor not found`)
  }
  for (const [doc, text] of docs) {
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^([a-z]+:|\{\{SITE_URL\}\})/i.test(target)) continue
      check(doc, target.startsWith('#') ? `${doc}${target}` : target)
    }
  }
  for (const step of readJson(join(specsDir, 'workflow.json')).steps) {
    assert.ok(step.guide, `${step.id} needs a guide`)
    check(`workflow.json:${step.id}`, step.guide)
  }
})

test('template/schemas/ is an exact copy of specs/', () => {
  const copy = fileURLToPath(new URL('../template/schemas/', import.meta.url))
  for (const f of ['project.schema.json', 'activity.schema.json', 'check.schema.json', 'workflow.json']) {
    assert.equal(readFileSync(join(copy, f), 'utf8'), readFileSync(join(specsDir, f), 'utf8'), `template/schemas/${f} differs from specs/${f}; copy it over`)
  }
})
