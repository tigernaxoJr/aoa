// Web UI end-to-end harness for the video apps (SPEC §9): builds one app, serves it under a sub-path
// like GitHub Pages, and drives it in Chromium. The project folder is an OPFS directory — a real
// FileSystemDirectoryHandle, opened through the app's test hook since the native folder picker cannot
// be automated. Fixtures are made by the Node scripts, so a scene shown as "rendered" proves the
// browser computes the same inputHash as scripts/lib/hash.mjs.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { extname, join, relative } from 'node:path'
import { after, before } from 'node:test'
import { baseProject, baseScene, makeProject } from '../template/helpers.mjs'

const require = createRequire(import.meta.url)
export const BASE = '/index-url-director'

/**
 * Registers before/after hooks that build and serve the app `slug` (its vite config and Guide API
 * builder) and launch a browser. Returns the live harness; `browser` is null when none is installed.
 */
export function webApp({ slug, viteConfig, buildApi }) {
  const h = { slug, origin: '', browser: null, server: null, outDir: '' }
  before(async () => {
    h.outDir = mkdtempSync(join(tmpdir(), 'avp-web-'))
    h.server = createServer((req, res) => {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      if (!path.startsWith(`${BASE}/`)) return res.writeHead(404).end()
      let file = join(h.outDir, path.slice(BASE.length))
      if (path.endsWith('/')) file = join(file, 'index.html')
      try {
        const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.zip': 'application/zip' }[extname(file)] ?? 'application/octet-stream'
        res.writeHead(200, { 'content-type': type }).end(readFileSync(file))
      } catch {
        res.writeHead(404).end()
      }
    })
    await new Promise((resolve) => h.server.listen(0, '127.0.0.1', resolve))
    h.origin = `http://127.0.0.1:${h.server.address().port}`

    process.env.SITE_URL = `${h.origin}${BASE}`
    const { build } = await import('vite')
    await build({ configFile: viteConfig, logLevel: 'error', build: { outDir: join(h.outDir, slug), emptyOutDir: true } })
    buildApi({ siteUrl: process.env.SITE_URL, out: h.outDir })

    const { chromium } = await import('playwright')
    for (const channel of [undefined, 'chrome', 'msedge']) {
      try {
        h.browser = await chromium.launch({ channel })
        break
      } catch {}
    }
  })
  after(async () => {
    await h.browser?.close()
    h.server?.close()
    rmSync(h.outDir, { recursive: true, force: true })
  })

  /** The app's URL (plus `hash`). */
  h.url = (hash = '') => `${h.origin}${BASE}/${slug}/${hash}`

  /** A fresh page on the app's start page; null (test skipped) without a browser. */
  h.newPage = async (t) => {
    if (!h.browser) {
      t.skip('no browser available')
      return null
    }
    const context = await h.browser.newContext()
    t.after(() => context.close())
    const page = await context.newPage()
    await page.goto(h.url())
    return page
  }

  /** Opens the app with the project `p` copied into OPFS; returns the page and readers for OPFS files. */
  h.openApp = async (t, p, hash = '') => {
    if (!h.browser) {
      t.skip('no browser available')
      return null
    }
    const context = await h.browser.newContext()
    const page = await context.newPage()
    await page.goto(h.url(hash))
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
    const read = (path) => readOpfs(page, `proj/${path}`)
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
  return h
}

/** Makes an OPFS folder with the given files and opens it as the project folder, as if picked in step 1. */
export async function prepareFolder(page, name, files = {}) {
  await page.evaluate(
    async ([name, files]) => {
      const root = await navigator.storage.getDirectory()
      await root.removeEntry(name, { recursive: true }).catch(() => {})
      const dir = await root.getDirectoryHandle(name, { create: true })
      for (const [file, text] of Object.entries(files)) {
        const w = await (await dir.getFileHandle(file, { create: true })).createWritable()
        await w.write(text)
        await w.close()
      }
      await window.__avp.open(dir)
    },
    [name, files],
  )
}

export const readOpfs = (page, path) =>
  page.evaluate(async (path) => {
    let dir = await navigator.storage.getDirectory()
    const parts = path.split('/')
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part)
    return (await (await dir.getFileHandle(parts.at(-1))).getFile()).text()
  }, path)

/** Waits until the page has mirrored the form into acme-video/video.start.json. */
export async function waitForStart(page, text) {
  for (let i = 0; i < 50; i++) {
    if ((await readOpfs(page, 'acme-video/video.start.json').catch(() => '')).includes(text)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.fail(`video.start.json never contained ${text}`)
}

/** Renders a 1-second mp4 for a scene and walks it to rendered with the Node scripts. */
export function renderScene(p, id, dir) {
  mkdirSync(p.path(dir, 'output'), { recursive: true })
  const r = spawnSync(require('ffmpeg-static'), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=navy:s=640x360:r=24:d=1', '-pix_fmt', 'yuv420p', p.path(dir, 'output/scene.mp4')])
  assert.equal(r.status, 0, String(r.stderr))
  for (const args of [['--status', 'assets_ready'], ['--status', 'rendering'], ['--rendered']]) {
    const s = p.run('state.mjs', [id, ...args])
    assert.equal(s.code, 0, s.stderr)
  }
}

/** Two rendered scenes (real mp4s, hashes written by state.mjs) and one draft. */
export function fixture() {
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
  for (const [id, dir] of [['scene-001', 'scenes/001-hook'], ['scene-002', 'scenes/002-cta']]) {
    writeFileSync(p.path(dir, 'assets/captions.json'), '[{"start":0,"end":1,"text":"字幕"}]\n')
    renderScene(p, id, dir)
  }
  return p
}

/** A story project: one rendered scene whose motion uses the fox's shared art, with two cast members. */
export function storyFixture() {
  const project = baseProject({ status: 'script_generated' })
  Object.assign(project.project, {
    name: '小狐狸找月亮',
    kind: 'story',
    sources: { story: '小狐狸以為月亮掉進了池塘。' },
    format: { aspectRatio: '16:9', width: 640, height: 360, fps: 24 },
    cast: [
      { id: 'fox', name: '小狐狸', voice: 'zh-TW-HsiaoYuNeural', art: '@/assets/cast/fox/' },
      { id: 'owl', name: '貓頭鷹', voice: 'zh-TW-YunJheNeural' },
    ],
  })
  const scene = baseScene('scene-001', {
    title: '池塘',
    purpose: 'conflict',
    durationSec: 1,
    visual: { type: 'motion-graphic', description: '池塘邊', motion: { file: 'assets/motion.js', uses: ['@/assets/cast/fox/'] } },
  })
  const p = makeProject({ project, scenes: [{ id: 'scene-001', dir: 'scenes/001-pond', scene, script: '夜深了。\n【小狐狸】月亮掉進水裡了！\n' }] })
  p.write('scenes/001-pond/assets/motion.js', 'export default async () => () => {}\n')
  p.write('assets/cast/fox/fox.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"/>\n')
  p.write('scenes/001-pond/assets/captions.json', '[]\n')
  renderScene(p, 'scene-001', 'scenes/001-pond')
  return p
}

export const activityJson = (fields) => JSON.stringify({ waitingForUser: false, step: null, scene: null, updatedAt: new Date().toISOString(), ...fields })
