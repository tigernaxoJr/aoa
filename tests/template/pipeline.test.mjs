// End-to-end: hand-written scenes → tts (offline fake) → render-scene → state →
// assemble → completed, exactly as the agent runs it (SPEC §13 Phase 2 completion criterion).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { afterEach, test } from 'node:test'
import { baseProject, baseScene, makeProject } from './helpers.mjs'

const ffprobe = createRequire(import.meta.url)('ffprobe-static').path
const duration = (file) => Number(spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout)

let p
afterEach(() => p?.cleanup())

test('hand-written scenes become output/final.mp4', async (t) => {
  const project = baseProject()
  project.project.format = { aspectRatio: '16:9', width: 640, height: 360, fps: 24, targetDurationSec: 10 }
  const scenes = [
    {
      id: 'scene-001',
      dir: 'scenes/001-hook',
      script: '部署要花半天嗎？\n',
      scene: baseScene('scene-001', {
        purpose: 'hook',
        visual: { type: 'motion-graphic', description: '提問', elements: [{ type: 'text', content: '半天？', at: 0.2, animation: 'zoomIn' }] },
      }),
    },
    {
      id: 'scene-002',
      dir: 'scenes/002-cta',
      script: '立即試用。\n',
      scene: baseScene('scene-002', {
        purpose: 'cta',
        visual: { type: 'code', description: '指令', code: { language: 'bash', content: 'npx deploy' }, transitionIn: 'fade' },
      }),
    },
  ]
  p = makeProject({ project, scenes })
  cpSync(new URL('../../templates/product-video/src', import.meta.url), p.path('src'), { recursive: true })
  const step = async (script, args, env) => {
    const r = await p.runAsync(script, args, env)
    if (/no usable browser/.test(r.stderr)) return null
    assert.equal(r.code, 0, `${script} ${args.join(' ')}\n${r.stderr}`)
    return r
  }

  assert.ok(await step('state.mjs', ['project', '--status', 'producing']))
  for (const { id } of scenes) {
    await step('tts.mjs', [id], { VIDEO_AGENT_FAKE_TTS: '1' })
    await step('state.mjs', [id, '--status', 'assets_ready'])
    await step('state.mjs', [id, '--status', 'rendering'])
    if (!(await step('render-scene.mjs', [id]))) return t.skip('no browser available')
    await step('state.mjs', [id, '--rendered'])
  }
  assert.equal(p.read('video.project.json').status, 'ready_to_assemble')

  await step('assemble.mjs', [])
  await step('state.mjs', ['project', '--status', 'completed'])
  assert.equal(p.read('video.project.json').status, 'completed')
  assert.equal((await step('validate.mjs', [])).code, 0)

  const sceneSec = scenes.map(({ dir }) => p.read(`${dir}/scene.json`).render.actualDurationSec)
  const total = duration(p.path('output/final.mp4'))
  assert.ok(Math.abs(total - (sceneSec[0] + sceneSec[1] - 0.5)) < 0.1, `final ${total}s from scenes ${sceneSec}`)
  const srt = readFileSync(p.path('output/final.srt'), 'utf8')
  assert.match(srt, /部署要花半天嗎？/)
  assert.match(srt, /立即試用。/)
})
