// Validates slide.project.json (and slide.activity.json when present) against schemas/, and checks slides.md.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ACTIVITY_FILE, PROJECT_FILE, loadSchemas, schemaErrors } from './lib/schema.mjs'

const root = process.cwd()
const errors = []
const schemas = loadSchemas(root)

for (const [name, validate, required] of [
  [PROJECT_FILE, schemas.project, true],
  [ACTIVITY_FILE, schemas.activity, false],
]) {
  const file = join(root, name)
  if (!existsSync(file)) {
    if (required) errors.push(`${name} does not exist`)
    continue
  }
  try {
    for (const e of schemaErrors(validate, JSON.parse(readFileSync(file, 'utf8')))) errors.push(`${name}: ${e}`)
  } catch (err) {
    errors.push(`${name} is not valid JSON: ${err.message}`)
  }
}

const slides = join(root, 'slides.md')
if (!existsSync(slides)) errors.push('slides.md does not exist')
else if (!readFileSync(slides, 'utf8').trim()) errors.push('slides.md is empty')

if (errors.length) {
  console.error('Validation failed:')
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log('✓ Slide project is valid')
