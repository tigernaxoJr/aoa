// Portal: the AOA site root (overview page + article reader). Builds first (it empties dist/).
// Shared recipe: ../vite.shared.ts.
//
// Articles live once at the repo root (docs/, paper/, posts/; see src/articles.ts). The build
// pre-renders each one into <path>.html from the reader shell article.html (static HTML for SEO, no
// Jekyll), and also publishes the raw .md for agents. Licenses are published as .txt so browsers
// show them. During development, <path>.html redirects to article.html?p=<path>, which renders live.
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'
import { ARTICLES, articleView, readerHeader, renderArticle, type ArticleEntry, type RenderedArticle } from './src/articles'
import { langSwitch } from './src/i18n'
import { appConfig, here, siteUrl } from '../vite.shared'

const repo = here(import.meta.url, '../../')
const LICENSES = ['LICENSE', 'LICENSE-docs']

const escapeAttr = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const source = (entry: ArticleEntry) => readFileSync(join(repo, `${entry.path}.md`), 'utf8')

/** Raw files published next to the pages: article Markdown and licenses. */
function rawFiles(): Map<string, string> {
  const files = new Map<string, string>()
  for (const entry of ARTICLES) files.set(`${entry.path}.md`, source(entry))
  for (const name of LICENSES) if (existsSync(join(repo, name))) files.set(`${name}.txt`, readFileSync(join(repo, name), 'utf8'))
  return files
}

function headTags(entry: ArticleEntry, article: RenderedArticle): string {
  const url = `${siteUrl}/${entry.path}.html`
  const tags = [
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="AOA" />`,
    `<meta property="og:title" content="${escapeAttr(article.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(article.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta name="twitter:card" content="summary" />`,
  ]
  if (entry.translation) {
    const other = ARTICLES.find((a) => a.path === entry.translation)!
    tags.push(`<link rel="alternate" hreflang="${entry.lang}" href="${url}" />`)
    tags.push(`<link rel="alternate" hreflang="${other.lang}" href="${siteUrl}/${other.path}.html" />`)
  }
  return tags.join('\n    ')
}

function articles(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'aofa-articles',
    // Home pages: English at the root, 繁體中文 under zh-TW/; both get the same switch.
    transformIndexHtml(html, ctx) {
      if (!html.includes('<!--lang-switch-->')) return html
      const zh = /zh-TW[\\/]index\.html$/.test(ctx.filename)
      // Absolute alternates (Vite would try to resolve relative <link href> values as assets).
      const alternates = [`<link rel="alternate" hreflang="en" href="${siteUrl}/" />`, `<link rel="alternate" hreflang="zh-Hant" href="${siteUrl}/zh-TW/" />`].join('\n    ')
      return html
        .replace('<!--hreflang-->', alternates)
        .replace('<!--lang-switch-->', zh ? langSwitch('zh-Hant', '../', './') : langSwitch('en', './', './zh-TW/'))
    },
    configResolved(resolved) {
      config = resolved
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const base = server.config.base
        const url = decodeURIComponent((req.url ?? '').split('?')[0])
        if (!url.startsWith(base)) return next()
        const path = url.slice(base.length)
        if (ARTICLES.some((a) => `${a.path}.html` === path)) {
          res.statusCode = 302
          res.setHeader('Location', `${base}article.html?p=${path.replace(/\.html$/, '')}`)
          return res.end()
        }
        const raw = rawFiles().get(path)
        if (raw === undefined) return next()
        res.setHeader('Content-Type', `${path.endsWith('.md') ? 'text/markdown' : 'text/plain'}; charset=utf-8`)
        res.end(raw)
      })
    },
    generateBundle() {
      for (const [fileName, content] of rawFiles()) this.emitFile({ type: 'asset', fileName, source: content })
    },
    // After Vite has written the hashed reader shell, render each article into its own page.
    closeBundle(error?: Error) {
      if (error) return // let the real build error surface
      const outDir = config.build.outDir
      const shell = readFileSync(join(outDir, 'article.html'), 'utf8')
      const rendered = new Map(ARTICLES.map((entry) => [entry.path, renderArticle(source(entry))]))
      const titles = Object.fromEntries([...rendered].map(([path, a]) => [path, a.title]))
      for (const entry of ARTICLES) {
        const article = rendered.get(entry.path)!
        const page = shell
          .replace('<html lang="zh-Hant"', `<html lang="${entry.lang}"`)
          .replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(article.title)} · AOA</title>`)
          .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeAttr(article.description)}" />`)
          .replace('<!--article-head-->', headTags(entry, article))
          .replace('<!--article-header-->', readerHeader(entry, config.base))
          .replace('<!--article-body-->', articleView(entry, article, config.base, titles))
        const file = join(outDir, `${entry.path}.html`)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, page)
      }
      const pages = ['', 'zh-TW/', ...ARTICLES.map((a) => `${a.path}.html`)]
      writeFileSync(
        join(outDir, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
          .map((p) => `  <url><loc>${siteUrl}/${p}</loc></url>`)
          .join('\n')}\n</urlset>\n`,
      )
      writeFileSync(join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`)
      // Site-wide GitHub Pages files: the custom domain (from SITE_URL) and no Jekyll processing.
      const host = new URL(siteUrl).hostname
      if (!host.endsWith('.github.io') && host !== 'localhost' && host !== '127.0.0.1') writeFileSync(join(outDir, 'CNAME'), `${host}\n`)
      writeFileSync(join(outDir, '.nojekyll'), '')
    },
  }
}

export default appConfig(here(import.meta.url, '.'), '', {
  plugins: [articles()],
  build: {
    rollupOptions: {
      input: {
        main: here(import.meta.url, './index.html'),
        zh: here(import.meta.url, './zh-TW/index.html'),
        article: here(import.meta.url, './article.html'),
      },
    },
  },
})
