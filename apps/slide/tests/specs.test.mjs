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
for (const name of ['project', 'activity']) {
  ajv.addSchema(readJson(join(specsDir, `${name}.schema.json`)))
}
const validators = {
  project: ajv.getSchema('https://aofa.tigernaxo.com/slide/schemas/project.schema.json'),
  activity: ajv.getSchema('https://aofa.tigernaxo.com/slide/schemas/activity.schema.json'),
}

test('slide specs/examples valid and invalid schemas', () => {
  for (const expectValid of [true, false]) {
    const dir = join(specsDir, 'examples', expectValid ? 'valid' : 'invalid')
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
      const kind = file.match(/\.(project|activity)\.json$/)?.[1]
      assert.ok(kind, `${file}: name must end with .project.json or .activity.json`)
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
