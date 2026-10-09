// Web UI end-to-end harness for Slide Studio: builds the app, serves it under a sub-path like GitHub
// Pages, and drives it in Chromium. The project folder is an OPFS directory — a real
// FileSystemDirectoryHandle, opened through the app's test hook (window.__slide) since the native
// folder picker cannot be automated. Kept apart from the video apps' harness: apps do not share tests.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before } from 'node:test'
import { build as buildApi } from '../../tools/build-api.mjs'

export const BASE = '/sub-path'
const viteConfig = fileURLToPath(new URL('../../vite.config.ts', import.meta.url))

/** Registers before/after hooks that build and serve the app and launch a browser; `browser` is null when none is installed. */
export function slideApp() {
  const h = { origin: '', browser: null, server: null, outDir: '' }
  before(async () => {
    h.outDir = mkdtempSync(join(tmpdir(), 'slide-web-'))
    h.server = createServer((req, res) => {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      if (!path.startsWith(`${BASE}/`)) return res.writeHead(404).end()
      let file = join(h.outDir, path.slice(BASE.length))
      if (path.endsWith('/')) file = join(file, 'index.html')
      try {
        const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mjs': 'text/javascript' }[extname(file)] ?? 'application/octet-stream'
        res.writeHead(200, { 'content-type': type }).end(readFileSync(file))
      } catch {
        res.writeHead(404).end()
      }
    })
    await new Promise((resolve) => h.server.listen(0, '127.0.0.1', resolve))
    h.origin = `http://127.0.0.1:${h.server.address().port}`

    process.env.SITE_URL = `${h.origin}${BASE}`
    const { build } = await import('vite')
    await build({ configFile: viteConfig, logLevel: 'error', build: { outDir: join(h.outDir, 'slide'), emptyOutDir: true } })
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

  h.url = () => `${h.origin}${BASE}/slide/`

  /** A fresh browser context on the start page; null (test skipped) without a browser. */
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
  return h
}

/** Writes `files` ({ path: text }) into the OPFS folder `name`, creating sub-folders; `fresh` empties it first. */
export async function putFiles(page, name, files = {}, fresh = false) {
  await page.evaluate(
    async ([name, files, fresh]) => {
      const root = await navigator.storage.getDirectory()
      if (fresh) await root.removeEntry(name, { recursive: true }).catch(() => {})
      const top = await root.getDirectoryHandle(name, { create: true })
      for (const [path, text] of Object.entries(files)) {
        const parts = path.split('/')
        let dir = top
        for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true })
        const w = await (await dir.getFileHandle(parts.at(-1), { create: true })).createWritable()
        await w.write(text)
        await w.close()
      }
    },
    [name, files, fresh],
  )
}

/** Makes an OPFS folder with the given files and opens it, as if picked in the folder dialog. */
export async function openFolder(page, name, files = {}) {
  await putFiles(page, name, files, true)
  await page.evaluate(async (name) => window.__slide.open(await (await navigator.storage.getDirectory()).getDirectoryHandle(name)), name)
}

/** Text of an OPFS file, or null when it does not exist. */
export const readOpfs = (page, path) =>
  page.evaluate(async (path) => {
    try {
      let dir = await navigator.storage.getDirectory()
      const parts = path.split('/')
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part)
      return await (await (await dir.getFileHandle(parts.at(-1))).getFile()).text()
    } catch {
      return null
    }
  }, path)
