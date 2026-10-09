// Updates slide.activity.json or slide.project.json. Every write is validated against schemas/ first
// and committed atomically; an invalid change or an unreadable project file writes nothing.
//
//   pnpm run state activity --step outline --message "正在規劃大綱" [--waiting] [--slide 3 --total 8]
//   pnpm run state project --status drafted [--pages 8] [--title ...] [--id ...] [--description ...] [--theme ...]
//                     [--style formal|tech|whiteboard] [--pdf output/slides.pdf]
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ACTIVITY_FILE, PROJECT_FILE, loadSchemas, schemaErrors, writeJsonAtomic } from './lib/schema.mjs'

const root = process.cwd()
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const int = (name) => {
  const v = flag(name)
  if (v === undefined) return undefined
  if (!/^\d+$/.test(v)) fail(`--${name} must be a whole number, got "${v}"`)
  return Number(v)
}
function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

const target = args[0]
const schemas = loadSchemas(root)
let file, doc

if (target === 'activity') {
  const message = flag('message')
  if (!message) fail('activity needs --message')
  file = join(root, ACTIVITY_FILE)
  doc = {
    message,
    step: flag('step') ?? 'idle',
    currentSlide: int('slide') ?? null,
    totalSlides: int('total') ?? null,
    waitingForUser: args.includes('--waiting'),
    updatedAt: new Date().toISOString(),
  }
  const errors = schemaErrors(schemas.activity, doc)
  if (errors.length) fail(`${ACTIVITY_FILE} would be invalid:\n  ${errors.join('\n  ')}`)
} else if (target === 'project') {
  file = join(root, PROJECT_FILE)
  if (!existsSync(file)) fail(`${PROJECT_FILE} not found; unpack the template first`)
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    fail(`${PROJECT_FILE} is not valid JSON (${err.message}); fix it before updating, nothing was written`)
  }
  for (const key of ['id', 'title', 'description', 'theme', 'style', 'status']) if (flag(key) !== undefined) doc[key] = flag(key)
  if (flag('pages') !== undefined) doc.pagesCount = int('pages')
  const pdf = flag('pdf')
  if (pdf !== undefined) {
    if (!existsSync(join(root, pdf))) fail(`--pdf ${pdf} does not exist; export first`)
    doc.export = { pdfPath: pdf, exportedAt: new Date().toISOString(), sizeBytes: statSync(join(root, pdf)).size }
  }
  doc.updatedAt = new Date().toISOString()
  doc.updatedBy = 'agent'
  const errors = schemaErrors(schemas.project, doc)
  if (errors.length) fail(`${PROJECT_FILE} would be invalid, nothing was written:\n  ${errors.join('\n  ')}`)
} else {
  console.log('Usage:')
  console.log('  pnpm run state activity --step outline --message "正在寫大綱" [--waiting] [--slide 3 --total 8]')
  console.log('  pnpm run state project --status drafted [--pages 6] [--title ...] [--style whiteboard]')
  console.log('  pnpm run state project --status exported --pdf output/slides.pdf')
  process.exit(target ? 1 : 0)
}

writeJsonAtomic(file, doc)
console.log(`✓ updated ${target === 'activity' ? ACTIVITY_FILE : PROJECT_FILE}${doc.status ? ` (status: ${doc.status})` : ''}`)
