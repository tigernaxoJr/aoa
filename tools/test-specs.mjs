// Validates specs/examples: every file in valid/ must pass, every file in invalid/ must fail.
// The schema kind is taken from the file suffix (*.project.json / *.scene.json).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const specsDir = fileURLToPath(new URL('../specs/', import.meta.url))
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false })
addFormats(ajv)
for (const name of ['common', 'project', 'scene']) {
  ajv.addSchema(readJson(join(specsDir, `${name}.schema.json`)))
}
const validators = {
  project: ajv.getSchema('project.schema.json'),
  scene: ajv.getSchema('scene.schema.json'),
}

let failures = 0
for (const expectValid of [true, false]) {
  const dir = join(specsDir, 'examples', expectValid ? 'valid' : 'invalid')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const kind = file.match(/\.(project|scene)\.json$/)?.[1]
    if (!kind) {
      console.error(`✗ ${file}: name must end with .project.json or .scene.json`)
      failures++
      continue
    }
    const validate = validators[kind]
    const ok = validate(readJson(join(dir, file)))
    if (ok === expectValid) {
      console.log(`✓ ${expectValid ? 'valid  ' : 'invalid'} ${file}`)
    } else {
      failures++
      console.error(`✗ ${expectValid ? 'valid  ' : 'invalid'} ${file}: expected ${expectValid ? 'pass' : 'fail'}`)
      if (validate.errors) {
        for (const e of validate.errors) console.error(`    ${e.instancePath || '/'} ${e.message}`)
      }
    }
  }
}

if (failures) {
  console.error(`\n${failures} example(s) did not behave as expected`)
  process.exit(1)
}
console.log('\nall examples behave as expected')
