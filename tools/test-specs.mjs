// Validates specs/examples: every file in valid/ must pass, every file in invalid/ must fail.
// The schema kind is taken from the file suffix (*.project.json / *.scene.json).
// Also validates specs/workflow.json and cross-checks it against the status enums.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const specsDir = fileURLToPath(new URL('../specs/', import.meta.url))
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false })
addFormats(ajv)
for (const name of ['common', 'project', 'scene', 'workflow']) {
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

const fail = (msg) => {
  failures++
  console.error(`✗ workflow.json: ${msg}`)
}
const workflow = readJson(join(specsDir, 'workflow.json'))
const validateWorkflow = ajv.getSchema('workflow.schema.json')
if (!validateWorkflow(workflow)) {
  for (const e of validateWorkflow.errors) fail(`${e.instancePath || '/'} ${e.message}`)
} else {
  const statusEnums = {
    project: ajv.getSchema('project.schema.json#/$defs/projectStatus').schema.enum,
    scene: ajv.getSchema('scene.schema.json#/$defs/sceneStatus').schema.enum,
  }
  const all = [...workflow.steps, ...workflow.operations]
  const seen = { id: new Set(), command: new Set() }
  const before = failures
  for (const step of all) {
    for (const key of ['id', 'command']) {
      if (seen[key].has(step[key])) fail(`duplicate ${key} ${step[key]}`)
      seen[key].add(step[key])
    }
    for (const gate of step.requires?.gates ?? []) {
      if (!workflow.gates[gate]) fail(`${step.id} requires unknown gate ${gate}`)
    }
    for (const action of step.actions) {
      for (const t of action.transitions ?? []) {
        for (const value of [...(t.from ?? []), t.to]) {
          if (!statusEnums[t.target].includes(value)) {
            fail(`${step.id}.${action.id}: ${value} is not a ${t.target} status`)
          }
        }
      }
    }
  }
  if (failures === before) console.log(`✓ workflow.json (${all.length} steps/operations)`)
}

// Template project file must be valid (placeholders are chosen to pass the schema).
const rootDir = join(specsDir, '..')
const templateProject = join(rootDir, 'templates', 'product-video', 'video.project.json')
if (validators.project(readJson(templateProject))) {
  console.log('✓ templates/product-video/video.project.json')
} else {
  failures++
  console.error('✗ templates/product-video/video.project.json')
  for (const e of validators.project.errors) console.error(`    ${e.instancePath || '/'} ${e.message}`)
}

// SKILL.md frontmatter per the Agent Skills format.
const skillFile = join(rootDir, 'skills', 'product-video', 'SKILL.md')
const frontmatter = readFileSync(skillFile, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ''
const field = (key) => frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1].trim()
const skillName = field('name')
const skillDescription = field('description')
const skillErrors = []
if (!skillName || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillName) || skillName.length > 64) {
  skillErrors.push('name must be lowercase-hyphenated, ≤ 64 chars')
}
if (skillName !== 'product-video') skillErrors.push('name must match its directory (product-video)')
if (!skillDescription || skillDescription.length > 1024) skillErrors.push('description required, ≤ 1024 chars')
if (skillErrors.length) {
  failures++
  console.error(`✗ skills/product-video/SKILL.md: ${skillErrors.join('; ')}`)
} else {
  console.log('✓ skills/product-video/SKILL.md frontmatter')
}

if (failures) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
