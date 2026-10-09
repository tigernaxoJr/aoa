// `video-agent mcp` through the official MCP client over stdio: guide resources and prompts, and the
// project tools running the project's own scripts end to end (fake TTS).
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { build as buildProduct } from '../../../apps/product/tools/build-api.mjs'
import { build as buildStory } from '../../../apps/story/tools/build-api.mjs'
import { killTree } from '../../video-core/tests/template/helpers.mjs'
import { FAKE_TTS, agentBin, fullProject, motionScene, repo } from './helpers.mjs'

let guide
before(() => {
  guide = mkdtempSync(join(tmpdir(), 'avp-guide-'))
  for (const build of [buildProduct, buildStory]) build({ siteUrl: 'https://example.test/index-url-director', out: guide })
})
after(() => rmSync(guide, { recursive: true, force: true }))

/**
 * Tool calls that run the project's scripts (tts, browsers, ffmpeg). On a busy machine they take longer
 * than the SDK's 60 s default; when that runs out the client cancels and the server drops the answer.
 */
const SLOW = { timeout: 5 * 60_000 }
/** A test that renders: a few slow calls, with room to spare. */
const RENDERS = { timeout: 15 * 60_000 }

/** Connects to a server for project `p`; the test's teardown stops the server, then removes `p`. */
async function connect(t, p) {
  const client = new Client({ name: 'test', version: '1.0.0' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [agentBin, 'mcp', '--project', p.root],
    env: { ...process.env, ...FAKE_TTS, VIDEO_AGENT_GUIDE_DIR: join(guide, 'api') },
    stderr: 'pipe',
  })
  let stderr = ''
  transport.stderr.on('data', (d) => (stderr += d)) // read, or a chatty server would block on a full pipe
  // One hook, in this order: a failed test can leave a script running in the project, which on Windows
  // keeps its files from being removed. With separate hooks the throwing cleanup made node:test skip
  // client.close(), and the server left running kept this file, and the whole suite, waiting forever.
  t.after(async () => {
    if (transport.pid) killTree(transport.pid) // with the scripts it is still running
    await client.close()
    p.cleanup()
    if (stderr) t.diagnostic(`server stderr: ${stderr}`)
  })
  await client.connect(transport)
  return client
}
const json = (result) => JSON.parse(result.content[0].text)

test('guide resources and prompts come from the Guide API', async (t) => {
  const p = fullProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene: motionScene('scene-001') }] })
  const client = await connect(t, p)
  const uris = (await client.listResources()).resources.map((r) => r.uri)
  for (const uri of ['video://guide', 'video://workflow', 'video://schemas/project', 'video://schemas/scene', 'video://rules/script', 'video://rules/visual', 'video://templates/product-introduction', 'video://project/current']) {
    assert.ok(uris.includes(uri), uri)
  }
  const workflow = await client.readResource({ uri: 'video://workflow' })
  assert.deepEqual(JSON.parse(workflow.contents[0].text), JSON.parse(readFileSync(join(repo, 'apps/product/specs/workflow.json'), 'utf8')))
  const storyWorkflow = await client.readResource({ uri: 'video://workflow/story' })
  assert.deepEqual(JSON.parse(storyWorkflow.contents[0].text), JSON.parse(readFileSync(join(repo, 'apps/story/specs/workflow.json'), 'utf8')))
  const current = JSON.parse((await client.readResource({ uri: 'video://project/current' })).contents[0].text)
  assert.equal(current.ok, true, JSON.stringify(current.errors))
  assert.equal(current.report.scenes[0].id, 'scene-001')

  const names = (await client.listPrompts()).prompts.map((x) => x.name)
  assert.deepEqual(names.sort(), ['analyze', 'analyze-style', 'scene-script', 'storyboard'])
  const prompt = await client.getPrompt({ name: 'scene-script', arguments: { id: 'scene-002' } })
  assert.match(prompt.messages[0].content.text, /^目標 scene：scene-002/)
  assert.match(prompt.messages[0].content.text, /寫旁白/)
})

test('create_scene, update_scene, render_scene, assemble_video drive a project to completed', RENDERS, async (t) => {
  const p = fullProject()
  const client = await connect(t, p)
  const call = (name, args = {}) => client.callTool({ name, arguments: args }, undefined, SLOW)

  let r = await call('create_scene', { dir: 'scenes/001-hook', scene: motionScene('scene-001'), script: '一二三四。' })
  assert.ok(!r.isError, r.content[0].text)
  r = await call('update_scene', { id: 'scene-001', patch: [{ op: 'replace', path: '/title', value: 'MCP 開場' }] })
  assert.ok(!r.isError, r.content[0].text)
  const scene = JSON.parse(readFileSync(p.path('scenes/001-hook/scene.json'), 'utf8'))
  assert.equal(scene.title, 'MCP 開場')
  assert.equal(scene.updatedBy, 'mcp')

  r = await call('render_scene', { id: 'scene-001' })
  assert.ok(!r.isError, r.content[0].text)
  assert.equal(JSON.parse(readFileSync(p.path('scenes/001-hook/scene.json'), 'utf8')).status, 'rendered')

  const status = json(await call('project_status'))
  assert.equal(status.report.project.status, 'ready_to_assemble')
  assert.equal(status.report.next.command, '/video-assemble')

  r = await call('assemble_video')
  assert.ok(!r.isError, r.content[0].text)
  assert.ok(existsSync(p.path('output/final.mp4')))
  assert.equal(JSON.parse(readFileSync(p.path('video.project.json'), 'utf8')).status, 'completed')

  // Rendering again after an edit goes through stale (a rendered scene cannot jump to assets_ready).
  r = await call('update_scene', { id: 'scene-001', patch: [{ op: 'replace', path: '/durationSec', value: 1.5 }] })
  assert.ok(!r.isError, r.content[0].text)
  r = await call('render_scene', { id: 'scene-001' })
  assert.ok(!r.isError, r.content[0].text)
  assert.equal(JSON.parse(readFileSync(p.path('scenes/001-hook/scene.json'), 'utf8')).status, 'rendered')
})

test('invalid changes are refused and leave no trace', async (t) => {
  const p = fullProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene: motionScene('scene-001') }] })
  const client = await connect(t, p)
  const bad = motionScene('scene-002', { purpose: 'not-a-purpose' })
  let r = await client.callTool({ name: 'create_scene', arguments: { dir: 'scenes/002-bad', scene: bad, script: 'x' } })
  assert.equal(r.isError, true)
  assert.equal(existsSync(p.path('scenes/002-bad')), false)

  r = await client.callTool({ name: 'update_scene', arguments: { id: 'scene-001', patch: [{ op: 'replace', path: '/status', value: 'approved' }] } })
  assert.equal(r.isError, true)
  assert.match(r.content[0].text, /not allowed by workflow\.json/)

  r = await client.callTool({ name: 'render_scene', arguments: { id: 'scene-404' } })
  assert.equal(r.isError, true)
  assert.match(r.content[0].text, /scene-404 is not listed/)
})

test('create_project unpacks the checksum-verified template and rejects a tampered one', async (t) => {
  const p = fullProject()
  const client = await connect(t, p)
  const target = join(p.root, 'new-project')
  const r = await client.callTool({ name: 'create_project', arguments: { directory: target, name: '新影片', productUrl: 'https://acme.test', language: 'en-US' } })
  assert.ok(!r.isError, r.content[0].text)
  const project = JSON.parse(readFileSync(join(target, 'video.project.json'), 'utf8'))
  assert.notEqual(project.project.id, '00000000-0000-0000-0000-000000000000')
  assert.equal(project.project.name, '新影片')
  assert.equal(project.project.sources.productUrl, 'https://acme.test')
  assert.equal(project.project.language, 'en-US')
  assert.ok(existsSync(join(target, '.claude/commands/video-scene.md')))

  const storyDir = join(p.root, 'story-project')
  const story = await client.callTool({ name: 'create_project', arguments: { directory: storyDir, name: '小狐狸找月亮', kind: 'story', story: '小狐狸以為月亮掉進池塘。' } })
  assert.ok(!story.isError, story.content[0].text)
  const storyProject = JSON.parse(readFileSync(join(storyDir, 'video.project.json'), 'utf8'))
  assert.equal(storyProject.project.kind, 'story')
  assert.equal(storyProject.project.customMotion, 'allow')
  assert.deepEqual(storyProject.project.sources, { story: '小狐狸以為月亮掉進池塘。', description: null })
  assert.ok(existsSync(join(storyDir, '.claude/commands/video-design.md')))
  assert.ok(existsSync(join(storyDir, 'src/lib/rig.js')))
  const noStory = await client.callTool({ name: 'create_project', arguments: { directory: join(p.root, 'empty-story'), name: 'x', kind: 'story', productUrl: 'https://acme.test' } })
  assert.equal(noStory.isError, true)
  assert.match(noStory.content[0].text, /needs story/)

  const zip = join(guide, 'api/product/templates/product-video.zip')
  const original = readFileSync(zip)
  t.after(() => writeFileSync(zip, original))
  writeFileSync(zip, Buffer.concat([original, Buffer.from('tampered')]))
  const other = join(p.root, 'other')
  const bad = await client.callTool({ name: 'create_project', arguments: { directory: other, name: 'x', description: 'y' } })
  assert.equal(bad.isError, true)
  assert.match(bad.content[0].text, /checksum mismatch/)
  assert.equal(existsSync(join(other, 'video.project.json')), false)
})
