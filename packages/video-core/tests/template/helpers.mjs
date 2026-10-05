// Builds throwaway projects in a temp dir and runs the template scripts against them.
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../../../../', import.meta.url))
const scriptsDir = join(repo, 'packages', 'video-core', 'template', 'scripts')

/**
 * The workflow of both kinds (as /api/video publishes it), so the scripts are tested against every step.
 * tests/video-apps.test.mjs checks it still equals the apps' workflows merged.
 */
export const WORKFLOW = join(repo, 'packages', 'video-core', 'tests', 'template', 'fixtures', 'workflow.json')

export const PROJECT_ID = '8f1c2e0a-5b7d-4c3e-9a1f-2d6b8e4c7a90'

export function baseProject(overrides = {}) {
  return {
    $schema: './schemas/project.schema.json',
    specVersion: '1.0.0',
    project: {
      id: PROJECT_ID,
      name: 'Test Video',
      sources: { productUrl: 'https://example.com' },
      language: 'zh-TW',
      format: { aspectRatio: '16:9', width: 1920, height: 1080, fps: 30, targetDurationSec: 30 },
      tts: { provider: 'edge-tts', voice: 'zh-TW-HsiaoChenNeural', consent: { onlineTts: true, grantedAt: '2026-09-30T00:00:00Z' } },
    },
    scenes: [],
    status: 'script_generated',
    updatedAt: '2026-09-30T00:00:00Z',
    updatedBy: 'agent',
    ...overrides,
  }
}

export function baseScene(id, overrides = {}) {
  return {
    id,
    title: `Scene ${id}`,
    purpose: 'feature',
    narration: { scriptFile: 'script.md' },
    visual: { type: 'motion-graphic', description: 'title card' },
    durationSec: null,
    status: 'draft',
    locked: false,
    ...overrides,
  }
}

/**
 * Creates a project with the given scenes: [{ id, dir, scene?, script? }].
 * Returns helpers bound to that project.
 */
export function makeProject({ project = baseProject(), scenes = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'avp-test-'))
  mkdirSync(join(root, 'schemas'))
  for (const f of ['common.schema.json', 'project.schema.json', 'scene.schema.json', 'workflow.schema.json']) {
    cpSync(join(repo, 'packages', 'video-core', 'specs', f), join(root, 'schemas', f))
  }
  cpSync(WORKFLOW, join(root, 'schemas', 'workflow.json'))
  project.scenes = scenes.map(({ id, dir }) => ({ id, dir }))
  writeJson(join(root, 'video.project.json'), project)
  for (const s of scenes) {
    mkdirSync(join(root, s.dir, 'assets'), { recursive: true })
    writeJson(join(root, s.dir, 'scene.json'), s.scene ?? baseScene(s.id))
    writeFileSync(join(root, s.dir, 'script.md'), s.script ?? '這是一段旁白。\n')
  }
  return {
    root,
    path: (...p) => join(root, ...p),
    read: (...p) => JSON.parse(readFileSync(join(root, ...p), 'utf8')),
    write: (rel, data) => {
      const file = join(root, rel)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2))
    },
    run: (script, args = [], env = {}) => {
      const r = spawnSync(process.execPath, [join(scriptsDir, script), ...args], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, ...env },
      })
      return { code: r.status, stdout: r.stdout, stderr: r.stderr }
    },
    /** Like run(), but does not block the event loop (needed when the test process also serves HTTP). */
    runAsync: (script, args = [], env = {}) =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [join(scriptsDir, script), ...args], { cwd: root, env: { ...process.env, ...env } })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (d) => (stdout += d))
        child.stderr.on('data', (d) => (stderr += d))
        child.on('close', (code) => resolve({ code, stdout, stderr }))
      }),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

export function writeJson(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
}

export const twoScenes = () => [
  { id: 'scene-001', dir: 'scenes/001-hook', scene: baseScene('scene-001', { purpose: 'hook' }) },
  { id: 'scene-002', dir: 'scenes/002-cta', scene: baseScene('scene-002', { purpose: 'cta' }) },
]
