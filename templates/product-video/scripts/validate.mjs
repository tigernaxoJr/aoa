// npm run validate            → validate; exit 1 on errors
// npm run status              → (validate --report) per-scene status table and the suggested next step
// add --json for machine-readable output (Web UI / Companion)
import { run, parseArgs } from './lib/cli.mjs'
import { suggestNext } from './lib/core.mjs'
import { findRoot } from './lib/project.mjs'
import { deriveProjectStatus } from './lib/status.mjs'
import { validateProject } from './lib/validate.mjs'

run((argv) => {
  const { flags } = parseArgs(argv)
  const root = findRoot()
  const result = validateProject(root)
  const report = flags.report ? buildReport(root, result) : null

  if (flags.json) {
    console.log(JSON.stringify({ ok: result.errors.length === 0, errors: result.errors, warnings: result.warnings, report }, null, 2))
    return result.errors.length ? 1 : 0
  }
  if (report) printReport(report)
  for (const w of result.warnings) console.warn(`warning: ${w}`)
  for (const e of result.errors) console.error(`error: ${e}`)
  if (result.errors.length) {
    console.error(`\n${result.errors.length} error(s)`)
    return 1
  }
  if (!report) console.log('ok')
  return 0
})

function buildReport(root, { project, inspected, errors }) {
  const scenes = (inspected ?? []).map((s) => ({
    id: s.ref.id,
    dir: s.ref.dir,
    title: s.scene?.title ?? null,
    purpose: s.scene?.purpose ?? null,
    status: s.scene?.status ?? 'missing',
    outdated: Boolean(s.outdated),
    locked: Boolean(s.scene?.locked),
    durationSec: s.scene?.render?.actualDurationSec ?? s.scene?.durationSec ?? null,
    error: s.scene?.error?.message ?? null,
  }))
  const derived = inspected ? deriveProjectStatus(root, project, inspected) : null
  return {
    project: { name: project?.project?.name, status: project?.status, derivedStatus: derived },
    scenes,
    next: suggestNext(project, scenes, errors),
  }
}

function printReport({ project, scenes, next }) {
  const derived = project.derivedStatus && project.derivedStatus !== project.status ? ` (derived: ${project.derivedStatus})` : ''
  console.log(`${project.name} — ${project.status}${derived}\n`)
  if (scenes.length) {
    const rows = scenes.map((s, i) => [
      String(i + 1),
      s.id,
      s.purpose ?? '',
      s.status + (s.outdated ? ' (outdated)' : '') + (s.locked ? ' [locked]' : ''),
      s.durationSec === null ? '' : `${s.durationSec}s`,
      s.title ?? '',
    ])
    const header = ['#', 'scene', 'purpose', 'status', 'dur', 'title']
    const widths = header.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c].length)))
    const line = (cells) => cells.map((cell, c) => cell.padEnd(widths[c])).join('  ').trimEnd()
    console.log(line(header))
    for (const r of rows) console.log(line(r))
    console.log()
  }
  console.log(next.command ? `next: ${next.command}  (${next.reason})` : `next: ${next.reason}`)
}
