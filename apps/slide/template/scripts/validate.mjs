// Validates slide.project.json and slides.md in the project directory
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const cwd = process.cwd()
const projectFile = join(cwd, 'slide.project.json')
const slidesFile = join(cwd, 'slides.md')

let errors = []

if (!existsSync(projectFile)) {
  errors.push('slide.project.json does not exist')
} else {
  try {
    const project = JSON.parse(readFileSync(projectFile, 'utf8'))
    if (!project.title) errors.push('slide.project.json: title is required')
    if (!project.status) errors.push('slide.project.json: status is required')
  } catch (err) {
    errors.push(`slide.project.json is not valid JSON: ${err.message}`)
  }
}

if (!existsSync(slidesFile)) {
  errors.push('slides.md does not exist')
} else {
  const content = readFileSync(slidesFile, 'utf8')
  if (!content.trim()) errors.push('slides.md is empty')
}

if (errors.length) {
  console.error('Validation failed:')
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

console.log('✓ Slide project is valid')
