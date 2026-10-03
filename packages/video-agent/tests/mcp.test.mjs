// `video-agent mcp` through the official MCP client over stdio: guide resources and prompts, and the
// project tools running the project's own scripts end to end (fake TTS).
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { build } from '../../../apps/video/tools/build-api.mjs'
import { FAKE_TTS, agentBin, fullProject, motionScene, repo } from './helpers.mjs'

let guide
before(() => {
  guide = mkdtempSync(join(tmpdir(), 'avp-guide-'))
  build({ siteUrl: 'https://example.test/index-url-director', out: guide })
})
after(() => rmSync(guide, { recursive: true, force: true }))

async function connect(t, projectDir) {
  const client = new Client({ name: 'test', version: '1.0.0' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [agentBin, 'mcp', '--project', projectDir],
    env: { ...process.env, ...FAKE_TTS, VIDEO_AGENT_GUIDE_DIR: join(guide, 'api') },
    stderr: 'pipe',
  })
  await client.connect(transport)
  t.after(() => client.close())
  return client
}
const json = (result) => JSON.parse(result.content[0].text)

test('guide resources and prompts come from the Guide API', async (t) => {
  const p = fullProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene: motionScene('scene-001') }] })
  t.after(p.cleanup)
  const client = await connect(t, p.root)
  const uris = (await client.listResources()).resources.map((r) => r.uri)
  for (const uri of ['video://guide', 'video://workflow', 'video://schemas/project', 'video://schemas/scene', 'video://rules/script', 'video://rules/visual', 'video://templates/product-introduction', 'video://project/current']) {
    assert.ok(uris.includes(uri), uri)
  }
  const workflow = await client.readResource({ uri: 'video://workflow' })
  assert.deepEqual(JSON.parse(workflow.contents[0].text), JSON.parse(readFileSync(join(repo, 'apps/video/specs/workflow.json'), 'utf8')))
  const current = JSON.parse((await client.readResource({ uri: 'video://project/current' })).contents[0].text)
  assert.equal(current.ok, true, JSON.stringify(current.errors))
  assert.equal(current.report.scenes[0].id, 'scene-001')

  const names = (await client.listPrompts()).prompts.map((x) => x.name)
  assert.deepEqual(names.sort(), ['analyze', 'analyze-style', 'scene-script', 'storyboard'])
  const prompt = await client.getPrompt({ name: 'scene-script', arguments: { id: 'scene-002' } })
  assert.match(prompt.messages[0].content.text, /^目標 scene：scene-002/)
  assert.match(prompt.messages[0].content.text, /寫旁白/)
})

test('create_scene, update_scene, render_scene, assemble_video drive a project to completed', async (t) => {
  const p = fullProject()
  t.after(p.cleanup)
  const client = await connect(t, p.root)
  const call = (name, args = {}) => client.callTool({ name, arguments: args })

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
  t.after(p.cleanup)
  const client = await connect(t, p.root)
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
  t.after(p.cleanup)
  const client = await connect(t, p.root)
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

  const zip = join(guide, 'api/templates/product-video.zip')
  const original = readFileSync(zip)
  t.after(() => writeFileSync(zip, original))
  writeFileSync(zip, Buffer.concat([original, Buffer.from('tampered')]))
  const other = join(p.root, 'other')
  const bad = await client.callTool({ name: 'create_project', arguments: { directory: other, name: 'x', description: 'y' } })
  assert.equal(bad.isError, true)
  assert.match(bad.content[0].text, /checksum mismatch/)
  assert.equal(existsSync(join(other, 'video.project.json')), false)
})
