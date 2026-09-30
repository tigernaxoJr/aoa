// Web UI end-to-end (SPEC §9): builds the app, serves it under a sub-path like GitHub Pages, and
// drives it in Chromium. The project folder is an OPFS directory — a real FileSystemDirectoryHandle,
// opened through the app's test hook since the native folder picker cannot be automated.
// Fixtures are made by the Node scripts, so a scene shown as "rendered" proves the browser computes
// the same inputHash as scripts/lib/hash.mjs.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { startCompanion } from '../../packages/video-agent/serve/server.mjs'
import { FAKE_TTS, fullProject, motionScene } from '../agent/helpers.mjs'
import { baseProject, baseScene, makeProject } from '../template/helpers.mjs'

const require = createRequire(import.meta.url)
const repo = fileURLToPath(new URL('../../', import.meta.url))
const BASE = '/index-url-director'

let server
let origin
let browser
let outDir

before(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'avp-web-'))
  server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (!path.startsWith(`${BASE}/`)) return res.writeHead(404).end()
    let file = join(outDir, path.slice(BASE.length))
    if (path.endsWith('/')) file = join(file, 'index.html')
    try {
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[extname(file)] ?? 'application/octet-stream'
      res.writeHead(200, { 'content-type': type }).end(readFileSync(file))
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`

  process.env.SITE_URL = `${origin}${BASE}`
  const { build } = await import('vite')
  await build({ configFile: join(repo, 'apps/web/vite.config.ts'), logLevel: 'error', build: { outDir, emptyOutDir: true } })

  const { chromium } = await import('playwright')
  for (const channel of [undefined, 'chrome', 'msedge']) {
    try {
      browser = await chromium.launch({ channel })
      break
    } catch {}
  }
})

after(async () => {
  await browser?.close()
  server?.close()
  rmSync(outDir, { recursive: true, force: true })
})

/** Two rendered scenes (real mp4s, hashes written by state.mjs) and one draft. */
function fixture() {
  const project = baseProject({ status: 'script_generated' })
  project.project.name = '網頁測試專案'
  project.project.format = { aspectRatio: '16:9', width: 640, height: 360, fps: 24, targetDurationSec: 10 }
  const p = makeProject({
    project,
    scenes: [
      { id: 'scene-001', dir: 'scenes/001-hook', scene: baseScene('scene-001', { title: '開場', durationSec: 1, purpose: 'hook' }), script: '第一句旁白。\n' },
      { id: 'scene-002', dir: 'scenes/002-cta', scene: baseScene('scene-002', { title: '行動呼籲', durationSec: 1, purpose: 'cta' }), script: '立即試用。\n' },
      { id: 'scene-003', dir: 'scenes/003-extra', scene: baseScene('scene-003', { title: '補充', durationSec: 1 }) },
    ],
  })
  const ffmpeg = require('ffmpeg-static')
  for (const [id, dir] of [['scene-001', 'scenes/001-hook'], ['scene-002', 'scenes/002-cta']]) {
    writeFileSync(p.path(dir, 'assets/captions.json'), '[{"start":0,"end":1,"text":"字幕"}]\n')
    mkdirSync(p.path(dir, 'output'), { recursive: true })
    const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=navy:s=640x360:r=24:d=1', '-pix_fmt', 'yuv420p', p.path(dir, 'output/scene.mp4')])
    assert.equal(r.status, 0, String(r.stderr))
    for (const args of [['--status', 'assets_ready'], ['--status', 'rendering'], ['--rendered']]) {
      const s = p.run('state.mjs', [id, ...args])
      assert.equal(s.code, 0, s.stderr)
    }
  }
  return p
}

/** Opens the app with the fixture copied into OPFS; returns the page and a reader for OPFS files. */
async function openApp(t, p, hash = '') {
  if (!browser) {
    t.skip('no browser available')
    return null
  }
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${origin}${BASE}/${hash}`)
  const files = []
  const walk = (dir) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, d.name)
      if (d.isDirectory()) walk(full)
      else files.push([relative(p.root, full).split('\\').join('/'), readFileSync(full).toString('base64')])
    }
  }
  walk(p.root)
  await page.evaluate(async (files) => {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry('proj', { recursive: true }).catch(() => {})
    const proj = await root.getDirectoryHandle('proj', { create: true })
    for (const [path, b64] of files) {
      const parts = path.split('/')
      let dir = proj
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true })
      const w = await (await dir.getFileHandle(parts.at(-1), { create: true })).createWritable()
      await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
      await w.close()
    }
    await window.__avp.open(proj)
  }, files)
  const read = (path) =>
    page.evaluate(async (path) => {
      let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('proj')
      const parts = path.split('/')
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part)
      return (await (await dir.getFileHandle(parts.at(-1))).getFile()).text()
    }, path)
  const writeFile = (path, text) =>
    page.evaluate(
      async ([path, text]) => {
        const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('proj')
        const w = await (await dir.getFileHandle(path, { create: true })).createWritable()
        await w.write(text)
        await w.close()
      },
      [path, text],
    )
  t.after(() => context.close())
  return { page, read, writeFile }
}

test('home page walks a non-technical user to a plain-language message for the agent', async (t) => {
  if (!browser) return t.skip('no browser available')
  const context = await browser.newContext()
  t.after(() => context.close())
  const page = await context.newPage()
  await page.goto(`${origin}${BASE}/`)
  assert.match(await page.getByTestId('step-run').textContent(), /請先在步驟 2 填入/, 'no message before any source')

  await page.getByTestId('agent-ready').click()
  await page.getByPlaceholder('https://example.com').fill('https://acme.test')
  const message = await page.getByTestId('launch-message').textContent()
  assert.equal(
    message,
    `請讀取 ${origin}${BASE}/api/agent-guide.md，依照裡面的步驟幫我製作產品介紹影片。\n・產品網址：https://acme.test\n我不熟悉電腦操作：需要執行的指令請直接替我執行；需要我自己動手的地方（例如安裝軟體、按允許），請一步一步用白話告訴我要點哪裡。`,
  )
  const visible = await page.locator('main').innerText()
  assert.doesNotMatch(visible, /終端機中開啟|npm install|cd /, 'the main path never asks for a terminal')
  assert.equal(await page.getByTestId('launch-command').isVisible(), false, 'the terminal command stays folded away')
})

test('guided start: picking the source folder prefills from package.json / README and passes only its name', async (t) => {
  if (!browser) return t.skip('no browser available')
  const context = await browser.newContext()
  t.after(() => context.close())
  const page = await context.newPage()
  await page.goto(`${origin}${BASE}/`)
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry('acme-app', { recursive: true }).catch(() => {})
    const dir = await root.getDirectoryHandle('acme-app', { create: true })
    const put = async (name, text) => {
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable()
      await w.write(text)
      await w.close()
    }
    await put('package.json', JSON.stringify({ name: 'acme-deploy', homepage: 'https://acme.test' }))
    await put('README.md', '# Acme\n\n[![build](https://x/badge.svg)](https://x)\n\nAcme 讓你**一鍵部署**網站，不用設定伺服器。\n\n## 安裝\n')
    await window.__avp.pickSource(dir)
  })
  assert.equal(await page.getByTestId('source-folder').getByText('acme-app').count(), 1)
  assert.match(await page.getByTestId('source-filled').textContent(), /說明與網址/)
  const message = await page.getByTestId('launch-message').textContent()
  assert.match(message, /・產品網址：https:\/\/acme\.test/)
  assert.match(message, /・產品原始碼在我電腦上名為「acme-app」的資料夾（請幫我找到它；找不到就問我）/)
  assert.match(message, /・產品說明：acme-deploy：Acme 讓你一鍵部署網站，不用設定伺服器。/)

  await page.reload()
  assert.equal(await page.getByTestId('launch-message').textContent(), message, 'inputs survive a reload')
})

test('opened project shows scenes; browser inputHash matches the Node scripts', async (t) => {
  const p = fixture()
  t.after(() => p.cleanup())
  const app = await openApp(t, p)
  if (!app) return
  const { page } = app
  await page.getByTestId('project-name').waitFor()
  assert.equal(await page.getByTestId('project-name').textContent(), '網頁測試專案')
  const status = (id) => page.getByTestId(`scene-${id}`).getByTestId('scene-status').textContent()
  assert.equal(await status('scene-001'), '已渲染', 'rendered, not "內容已變更": hashes agree')
  assert.equal(await status('scene-002'), '已渲染')
  assert.equal(await status('scene-003'), '草稿')
  assert.equal(await page.getByTestId('next-command').textContent(), '/video-scene all')
})

test('editing a rendered scene marks it stale, re-derives the project, and shows the sync banner', async (t) => {
  const p = fixture()
  t.after(() => p.cleanup())
  const app = await openApp(t, p)
  if (!app) return
  const { page, read } = app
  await page.getByTestId('scene-scene-001').getByRole('button', { name: /開場/ }).click()
  await page.getByTestId('script-input').fill('改過的第一句。')
  await page.getByTestId('save').click()
  await page.getByTestId('stale-banner').waitFor()

  assert.equal(await read('scenes/001-hook/script.md'), '改過的第一句。\n')
  const scene = JSON.parse(await read('scenes/001-hook/scene.json'))
  assert.equal(scene.status, 'stale')
  assert.equal(scene.updatedBy, 'user')
  assert.ok(scene.render, 'render record is kept for comparison')
  const project = JSON.parse(await read('video.project.json'))
  assert.equal(project.status, 'producing')
  assert.equal(await page.getByTestId('next-command').textContent(), '/video-sync')
})

test('approve and reorder follow the UI write rules', async (t) => {
  const p = fixture()
  t.after(() => p.cleanup())
  const app = await openApp(t, p)
  if (!app) return
  const { page, read } = app
  await page.getByTestId('scene-scene-002').getByRole('button', { name: /行動呼籲/ }).click()
  await page.getByTestId('approve').click()
  await page.getByTestId('notice').filter({ hasText: '已核准' }).waitFor()
  assert.equal(JSON.parse(await read('scenes/002-cta/scene.json')).status, 'approved')

  await page.getByRole('button', { name: '下移 scene-001' }).click()
  await page.getByTestId('notice').filter({ hasText: '順序' }).waitFor()
  const order = JSON.parse(await read('video.project.json')).scenes.map((s) => s.id)
  assert.deepEqual(order, ['scene-002', 'scene-001', 'scene-003'])
})

test('writes wait while an agent holds the lock', async (t) => {
  const p = fixture()
  t.after(() => p.cleanup())
  const app = await openApp(t, p)
  if (!app) return
  const { page, read, writeFile } = app
  await writeFile('.video-agent.lock', JSON.stringify({ writer: 'agent', pid: 1, at: new Date().toISOString() }))
  await page.getByTestId('scene-scene-003').getByRole('button', { name: /補充/ }).click()
  await page.getByTestId('script-input').fill('不會被寫入。')
  await page.getByTestId('save').click()
  await page.getByTestId('notice').filter({ hasText: 'Agent 正在寫入' }).waitFor()
  assert.equal(await read('scenes/003-extra/script.md'), '這是一段旁白。\n')
})

test('the pairing link connects the Companion; "立即重新產生" rebuilds the scene without a terminal', async (t) => {
  if (!browser) return t.skip('no browser available')
  Object.assign(process.env, FAKE_TTS)
  const p = fullProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene: motionScene('scene-001', { title: '開場' }) }] })
  t.after(p.cleanup)
  const c = await startCompanion({ projectDir: p.root, port: 0, site: `${origin}${BASE}`, log: () => {} })
  t.after(() => c.close())

  const app = await openApp(t, p, `#pair=${c.port}:${c.token}`)
  const { page } = app
  await page.getByTestId('companion-status').getByText('本機助手已連線').waitFor()
  assert.equal(await page.evaluate(() => location.hash), '', 'the token is removed from the address bar')

  await page.getByTestId('scene-scene-001').getByRole('button', { name: /開場/ }).click()
  await page.getByTestId('rebuild').click()
  await page.getByTestId('notice').filter({ hasText: '重新產生 scene-001：完成' }).waitFor({ timeout: 120_000 })
  const scene = JSON.parse(readFileSync(p.path('scenes/001-hook/scene.json'), 'utf8'))
  assert.equal(scene.status, 'rendered')
  assert.equal(scene.updatedBy, 'companion')
})
