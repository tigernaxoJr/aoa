// Validates specs/examples (every file in valid/ must pass, every file in invalid/ must fail) and the
// template's placeholder project. Each app's workflow and Skill are checked in tests/video-apps.test.mjs.
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

test('template video.project.json validates against schema', () => {
  const templateProject = join(rootDir, 'template', 'video.project.json')
  const valid = validators.project(readJson(templateProject))
  assert.ok(valid, `packages/video-core/template/video.project.json must be valid: ${JSON.stringify(validators.project.errors)}`)
})
