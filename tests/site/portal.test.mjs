// apps/portal: articles are pre-rendered into static pages (SSG for SEO), every relative link and
// anchor resolves, and raw Markdown, licenses, sitemap and robots.txt are published.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const SITE = 'https://example.test'
const ARTICLES = ['docs/architecture', 'docs/architecture.zh-TW', 'posts/2026-10-introducing-aofa', 'paper/proposal']
let out

before(async () => {
  process.env.SITE_URL = SITE
  mkdirSync(join(repo, '.tmp'), { recursive: true })
  out = mkdtempSync(join(repo, '.tmp', 'portal-'))
  const { build } = await import('vite')
  await build({ configFile: join(repo, 'apps/portal/vite.config.ts'), logLevel: 'silent', build: { outDir: out, emptyOutDir: true } })
})
after(() => rmSync(out, { recursive: true, force: true }))

const read = (p) => readFileSync(join(out, p), 'utf8')

test('every article is a static page with its content, title and SEO tags', () => {
  for (const path of ARTICLES) {
    const html = read(`${path}.html`)
    const title = /^#\s+(.+)$/m.exec(readFileSync(join(repo, `${path}.md`), 'utf8'))[1].replace(/[*_`]/g, '')
    assert.match(html, /class="article-body/, `${path}: body pre-rendered`)
    assert.ok(html.includes(`<title>${title}`), `${path}: <title>`)
    assert.ok(html.includes(`<link rel="canonical" href="${SITE}/${path}.html" />`), `${path}: canonical`)
    assert.ok(!html.includes('<!--article-'), `${path}: placeholders replaced`)
    assert.ok(existsSync(join(out, `${path}.md`)), `${path}.md published for agents`)
  }
  assert.match(read('docs/architecture.html'), /hreflang="zh-Hant" href="https:\/\/example\.test\/docs\/architecture\.zh-TW\.html"/)
})

test('relative links and #anchors in the portal and articles resolve', () => {
  const broken = []
  for (const page of ['index.html', ...ARTICLES.map((p) => `${p}.html`)]) {
    const html = read(page)
    for (const [, url, hash] of html.matchAll(/href="([^"#:]*)(#[^"]*)?"/g)) {
      if (!url) {
        if (hash?.length > 1 && page !== 'index.html' && !html.includes(`id="${hash.slice(1)}"`)) broken.push(`${page} → ${hash}`)
        continue
      }
      if (/^\.\/(video|slide)\/$/.test(url)) continue // other apps, built separately
      let target = url.startsWith('/') ? join(out, url) : join(out, dirname(page), url)
      if (url.endsWith('/')) target = join(target, 'index.html')
      if (!existsSync(target)) broken.push(`${page} → ${url}`)
      else if (hash?.length > 1 && target.endsWith('.html') && !readFileSync(target, 'utf8').includes(`id="${hash.slice(1)}"`)) broken.push(`${page} → ${url}${hash}`)
    }
  }
  assert.deepEqual(broken, [])
})

test('licenses, sitemap and robots.txt are published', () => {
  assert.match(read('LICENSE.txt'), /MIT License/)
  assert.match(read('LICENSE-docs.txt'), /Attribution 4\.0/)
  const sitemap = read('sitemap.xml')
  for (const path of ARTICLES) assert.ok(sitemap.includes(`<loc>${SITE}/${path}.html</loc>`), path)
  assert.match(read('robots.txt'), /Sitemap: https:\/\/example\.test\/sitemap\.xml/)
  assert.equal(read('CNAME'), 'example.test\n', 'custom domain survives force_orphan deploys')
  assert.ok(existsSync(join(out, '.nojekyll')))
})
