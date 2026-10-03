// Updates slide.activity.json or slide.project.json atomically
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const cwd = process.cwd()
const args = process.argv.slice(2)

function flag(name) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

const target = args[0] // 'activity' or 'project'

if (target === 'activity') {
  const message = flag('message') || 'Agent 正在工作中...'
  const step = flag('step') || 'draft'
  const currentSlide = flag('slide') ? parseInt(flag('slide'), 10) : null
  const totalSlides = flag('total') ? parseInt(flag('total'), 10) : null
  const waiting = args.includes('--waiting')

  const activity = {
    message,
    step,
    currentSlide,
    totalSlides,
    waitingForUser: waiting,
    updatedAt: new Date().toISOString(),
  }

  writeFileSync(join(cwd, 'slide.activity.json'), JSON.stringify(activity, null, 2) + '\n')
  console.log(`✓ updated slide.activity.json: ${message}`)
} else if (target === 'project') {
  const projectFile = join(cwd, 'slide.project.json')
  let project = {}
  if (existsSync(projectFile)) {
    try {
      project = JSON.parse(readFileSync(projectFile, 'utf8'))
    } catch {}
  }

  if (flag('status')) project.status = flag('status')
  if (flag('title')) project.title = flag('title')
  if (flag('pages')) project.pagesCount = parseInt(flag('pages'), 10)
  project.updatedAt = new Date().toISOString()
  project.updatedBy = 'agent'

  writeFileSync(projectFile, JSON.stringify(project, null, 2) + '\n')
  console.log(`✓ updated slide.project.json (status: ${project.status})`)
} else {
  console.log('Usage:')
  console.log('  node scripts/state.mjs activity --message "正在寫大綱" --step outline')
  console.log('  node scripts/state.mjs project --status drafted --pages 6')
}
