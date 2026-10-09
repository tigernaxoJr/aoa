// Real projects for video-agent tests: the template (scripts, src, schemas) plus given scenes, created
// inside the repo's .tmp/ so the project's scripts resolve dependencies from the repo's node_modules.
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WORKFLOW, baseProject, baseScene, writeJson } from '../../video-core/tests/template/helpers.mjs'

export const repo = fileURLToPath(new URL('../../../', import.meta.url))
export const agentBin = join(repo, 'packages/video-agent/bin/video-agent.mjs')

export function fullProject({ scenes = [] } = {}) {
  mkdirSync(join(repo, '.tmp'), { recursive: true })
  const root = mkdtempSync(join(repo, '.tmp', 'agent-'))
  for (const dir of ['scripts', 'src']) cpSync(join(repo, 'packages/video-core/template', dir), join(root, dir), { recursive: true })
  mkdirSync(join(root, 'schemas'))
  for (const f of ['common.schema.json', 'project.schema.json', 'scene.schema.json', 'workflow.schema.json']) {
    cpSync(join(repo, 'packages', 'video-core', 'specs', f), join(root, 'schemas', f))
  }
  cpSync(WORKFLOW, join(root, 'schemas', 'workflow.json'))
  const project = baseProject()
  project.project.format = { aspectRatio: '16:9', width: 640, height: 360, fps: 24, targetDurationSec: 10 }
  project.scenes = scenes.map(({ id, dir }) => ({ id, dir }))
  writeJson(join(root, 'video.project.json'), project)
  for (const s of scenes) {
    mkdirSync(join(root, s.dir, 'assets'), { recursive: true })
    writeJson(join(root, s.dir, 'scene.json'), s.scene ?? baseScene(s.id))
    writeFileSync(join(root, s.dir, 'script.md'), s.script ?? '一二三四。\n')
  }
  return { root, path: (...p) => join(root, ...p), cleanup: () => rmSync(root, { recursive: true, force: true, maxRetries: 10 }) }
}

export const motionScene = (id, extra = {}) =>
  baseScene(id, { visual: { type: 'motion-graphic', description: 'title', elements: [{ type: 'text', content: '測試', at: 0 }] }, ...extra })

export const FAKE_TTS = { VIDEO_AGENT_FAKE_TTS: '1' }
