// Core of `video-agent mcp` (SPEC §10.1). Everything that touches a
// project runs the project's own scripts (scripts/*.mjs from its template), so behaviour always
// matches the project's protocol version; this package holds no protocol logic of its own.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const PROJECT_FILE = 'video.project.json'

export class AgentError extends Error {}

/** Walks up from `start` to the directory holding video.project.json. */
export function findProject(start = process.cwd()) {
  let dir = resolve(start)
  for (;;) {
    if (existsSync(join(dir, PROJECT_FILE))) return dir
    const parent = dirname(dir)
    if (parent === dir) throw new AgentError(`${PROJECT_FILE} not found in ${start} or any parent directory`)
    dir = parent
  }
}

/**
 * Runs `node scripts/<script>.mjs ...args` in the project. Resolves { code, stdout, stderr };
 * `onLine` receives output lines as they arrive.
 */
export function runScript(root, script, args = [], { onLine, env } = {}) {
  const file = join(root, 'scripts', `${script}.mjs`)
  if (!existsSync(file)) return Promise.resolve({ code: 1, stdout: '', stderr: `scripts/${script}.mjs not found in the project` })
  return runProcess(process.execPath, [file, ...args], { cwd: root, onLine, env })
}

export function runProcess(command, args, { cwd, onLine, env } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, windowsHide: true })
    let stdout = ''
    let stderr = ''
    const lines = (stream, sink) => {
      let buf = ''
      stream.on('data', (d) => {
        const text = String(d)
        sink(text)
        buf += text
        const parts = buf.split(/\r?\n/)
        buf = parts.pop()
        for (const line of parts) onLine?.(line)
      })
      stream.on('end', () => buf && onLine?.(buf))
    }
    lines(child.stdout, (t) => (stdout += t))
    lines(child.stderr, (t) => (stderr += t))
    child.on('error', (err) => resolvePromise({ code: 1, stdout, stderr: `${stderr}${err.message}` }))
    child.on('close', (code) => resolvePromise({ code: code ?? 1, stdout, stderr }))
  })
}

/** `pnpm run status --json`: validation result plus per-scene report and the suggested next step. */
export async function status(root) {
  const r = await runScript(root, 'validate', ['--report', '--json'])
  try {
    return JSON.parse(r.stdout)
  } catch {
    throw new AgentError(r.stderr.trim() || 'validate produced no report')
  }
}

/** Applies an RFC 6902 patch through state.mjs (lock + atomic write + validation). */
export async function patch(root, target, operations, by) {
  const dir = mkdtempSync(join(tmpdir(), 'video-agent-'))
  try {
    const file = join(dir, 'patch.json')
    writeFileSync(file, JSON.stringify(operations))
    return await runScript(root, 'state', [target, '--patch-file', file, '--by', by])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * The project's own runner (scripts/lib/runner.mjs): build_scene and assemble are protocol logic, so
 * they come from the project's template version rather than from this package.
 */
async function projectRunner(root) {
  const file = join(root, 'scripts', 'lib', 'runner.mjs')
  if (!existsSync(file)) throw new AgentError('this project was created from an older template without scripts/lib/runner.mjs; sync the template first')
  return import(pathToFileURL(file).href)
}

/** The deterministic part of build_scene, run by the project's runner. Returns { ok, log }. */
export async function buildScene(root, id, options) {
  return (await projectRunner(root)).buildScene(root, id, options)
}

/** assemble + mark the project completed, run by the project's runner. */
export async function assembleVideo(root, options) {
  return (await projectRunner(root)).assembleVideo(root, options)
}
