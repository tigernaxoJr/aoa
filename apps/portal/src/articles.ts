// Articles shown by the Portal reader. Used in two places with the same code:
//  - at build time (vite.config.ts) to pre-render every article into static HTML (SSG, for SEO);
//  - in the browser (article.ts) during development, where article.html?p=<path> renders on the fly.
// Sources live once at the repo root (docs/, paper/, posts/); <path> is the file without ".md".
import { Marked, type Tokens } from 'marked'
import { langSwitch } from './i18n'

export interface ArticleEntry {
  path: string
  kind: string
  lang: 'en' | 'zh-Hant'
  /** The same article in the other language. */
  translation?: string
}

export const ARTICLES: ArticleEntry[] = [
  { path: 'docs/architecture.zh-TW', kind: '架構規格', lang: 'zh-Hant', translation: 'docs/architecture' },
  { path: 'docs/architecture', kind: 'Specification', lang: 'en', translation: 'docs/architecture.zh-TW' },
  { path: 'posts/2026-10-introducing-aofa', kind: 'Blog', lang: 'en' },
  { path: 'paper/proposal', kind: 'Paper proposal', lang: 'en' },
]

export interface Heading {
  id: string
  text: string
  depth: number
}

export interface RenderedArticle {
  title: string
  /** Shown under the title; empty when the article has none. */
  subtitle: string
  /** For <meta name="description">: the subtitle, else the first paragraph. */
  description: string
  html: string
  headings: Heading[]
  minutes: number
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Markdown inline text to plain text. */
const plain = (s: string) =>
  s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]|\\(?=\S)/g, '')
    .replace(/<[^>]+>/g, '')
    .trim()

/** GitHub-style heading ids, so links such as architecture.md#7-when-to-use--limitations keep working. */
export function slugify(text: string): string {
  return plain(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
}

/** A line such as "**English** | [繁體中文](...)": the reader shows its own language switch instead. */
const isLanguageSwitch = (t: Tokens.Generic) => t.type === 'paragraph' && /English/.test(t.text) && /繁體中文/.test(t.text) && t.text.length < 120

export function renderArticle(md: string): RenderedArticle {
  const headings: Heading[] = []
  const used = new Map<string, number>()
  const marked = new Marked({ gfm: true })
  marked.use({
    renderer: {
      heading({ tokens, depth, text }) {
        const base = slugify(text) || 'section'
        const n = used.get(base) ?? 0
        used.set(base, n + 1)
        const id = n ? `${base}-${n}` : base
        if (depth === 2 || depth === 3) headings.push({ id, text: plain(text), depth })
        return `<h${depth} id="${id}"><a class="heading-anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${this.parser.parseInline(tokens)}</h${depth}>\n`
      },
      table(token) {
        // Default table markup, wrapped so wide tables scroll instead of widening the page.
        const cell = (c: Tokens.TableCell, tag: 'th' | 'td') =>
          `<${tag}${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</${tag}>`
        const head = `<tr>${token.header.map((c) => cell(c, 'th')).join('')}</tr>`
        const body = token.rows.map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`).join('')
        return `<div class="table-wrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>\n`
      },
    },
  })

  const tokens = marked.lexer(md)
  // Links between articles point at their rendered pages. (walkTokens only runs inside parse(), so walk here.)
  marked.walkTokens(tokens, (token) => {
    if (token.type === 'link' && !/^([a-z]+:|#)/i.test(token.href)) token.href = token.href.replace(/\.md(#|$)/, '.html$1')
  })
  const h1 = tokens.findIndex((t) => t.type === 'heading' && t.depth === 1)
  const title = h1 >= 0 ? plain((tokens[h1] as Tokens.Heading).text) : 'AOA'
  // The title goes to the page header; drop it and a language-switch line from the body.
  let body = tokens.filter((t, i) => i !== h1 && !isLanguageSwitch(t)) as typeof tokens
  // A short blockquote or an all-italic paragraph right after the title is a subtitle: shown in the
  // header instead of the body.
  const first = body.find((t) => t.type !== 'space')
  const isSubtitle =
    !!first &&
    ((first.type === 'blockquote' && first.text.length < 200) || (first.type === 'paragraph' && /^\*[^*][\s\S]*\*$/.test(first.raw.trim())))
  const subtitle = isSubtitle ? plain(first.text).replace(/\s+/g, ' ') : ''
  if (isSubtitle) body = body.filter((t) => t !== first) as typeof tokens
  body.links = tokens.links
  const lead = body.find((t) => t.type === 'paragraph') as Tokens.Paragraph | undefined
  const description = (subtitle || (lead ? plain(lead.text).replace(/\s+/g, ' ') : title)).slice(0, 160)

  const text = plain(md)
  const cjk = (text.match(/[㐀-鿿]/g) ?? []).length
  const words = (text.replace(/[㐀-鿿]/g, ' ').match(/[A-Za-z0-9]+/g) ?? []).length
  const minutes = Math.max(1, Math.round(cjk / 400 + words / 220))

  return { title, subtitle, description, html: marked.parser(body), headings, minutes }
}

const t = (lang: ArticleEntry['lang'], zh: string, en: string) => (lang === 'en' ? en : zh)

/** The home page in the article's language. */
const homeOf = (lang: ArticleEntry['lang'], base: string) => (lang === 'en' ? base : `${base}zh-TW/`)

/**
 * The sticky site header for an article page, in the article's language. The language switch jumps
 * to the translated article when there is one, else to the other language's home page.
 */
export function readerHeader(entry: ArticleEntry, base: string): string {
  const home = homeOf(entry.lang, base)
  const self = `${base}${entry.path}.html`
  const other = entry.translation ? `${base}${entry.translation}.html` : undefined
  const enHref = entry.lang === 'en' ? self : (other ?? base)
  const zhHref = entry.lang === 'zh-Hant' ? self : (other ?? `${base}zh-TW/`)
  const link = 'hidden hover:text-stone-900 sm:inline dark:hover:text-white'
  return `<header class="sticky top-0 z-30 border-b border-stone-200 bg-paper/90 backdrop-blur-sm dark:border-stone-800">
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="${home}" class="flex items-baseline gap-3">
          <span class="font-serif text-lg font-bold tracking-tight">AOA</span>
          <span class="hidden font-mono text-[11px] text-stone-500 md:inline">Agent-Offloaded Architecture</span>
        </a>
        <nav class="flex items-center gap-5 text-[13px] text-stone-600 dark:text-stone-400">
          <a href="${home}#workbenches" class="${link}">${t(entry.lang, '範例工具', 'Tools')}</a>
          <a href="${home}#architecture" class="${link}">${t(entry.lang, '架構', 'Architecture')}</a>
          <a href="${home}#docs" class="${link}">${t(entry.lang, '文獻', 'Read')}</a>
          <a href="https://github.com/tigernaxojr/aoa" target="_blank" rel="noopener noreferrer" class="hidden font-mono text-xs text-stone-900 underline decoration-stone-300 underline-offset-4 hover:decoration-accent sm:inline dark:text-stone-100 dark:decoration-stone-600">GitHub ↗</a>
          ${langSwitch(entry.lang, enHref, zhHref)}
        </nav>
      </div>
    </header>`
}

/**
 * The reader's <main> content. `base` is the site base path ("/" or "/repo/"); `titles` maps article
 * paths to titles for the "read more" cards (falls back to the file name).
 */
export function articleView(entry: ArticleEntry, article: RenderedArticle, base: string, titles: Record<string, string> = {}): string {
  const { lang } = entry
  const name = entry.path.split('/').pop()!
  const others = ARTICLES.filter((a) => a.path !== entry.path && a.path !== entry.translation)
  const toc = article.headings
    .map(
      (h) =>
        `<li><a href="#${h.id}" data-toc="${h.id}" class="block border-l border-stone-200 dark:border-stone-800 py-1 ${h.depth === 3 ? 'pl-6 text-[13px]' : 'pl-3'} text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white transition-colors">${escapeHtml(h.text)}</a></li>`,
    )
    .join('')
  const chip = 'inline-flex items-center gap-1 rounded-md border border-stone-200 bg-transparent px-2.5 py-1 font-mono text-xs font-medium text-stone-600 hover:border-stone-500 hover:text-stone-900 dark:border-stone-700 dark:text-stone-300 dark:hover:text-white transition-colors'

  return `
<div class="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:grid lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-14">
  <article class="min-w-0">
    <nav class="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400" aria-label="breadcrumb">
      <a href="${homeOf(lang, base)}" class="hover:text-stone-900 dark:hover:text-white">AOA</a><span aria-hidden="true">/</span>
      <a href="${homeOf(lang, base)}#docs" class="hover:text-stone-900 dark:hover:text-white">${t(lang, '文獻', 'Read')}</a><span aria-hidden="true">/</span>
      <span class="text-stone-700 dark:text-stone-300">${escapeHtml(entry.kind)}</span>
    </nav>

    <header class="mt-6 border-b border-stone-200 pb-8 dark:border-stone-800">
      <p class="font-mono text-xs uppercase tracking-[0.2em] text-accent">${escapeHtml(entry.kind)}</p>
      <h1 class="mt-4 font-serif text-3xl font-bold leading-tight tracking-tight text-stone-900 sm:text-[2.6rem] dark:text-white">${escapeHtml(article.title)}</h1>
      ${article.subtitle ? `<p class="mt-4 text-lg leading-relaxed text-stone-600 dark:text-stone-300">${escapeHtml(article.subtitle)}</p>` : ''}
      <div class="mt-6 flex flex-wrap items-center gap-2">
        <span class="text-xs text-stone-500 dark:text-stone-400">${t(lang, `約 ${article.minutes} 分鐘閱讀`, `${article.minutes} min read`)}</span>
        <span class="text-stone-300 dark:text-stone-700" aria-hidden="true">·</span>
        ${entry.translation ? `<a class="${chip}" href="${base}${entry.translation}.html" hreflang="${lang === 'en' ? 'zh-Hant' : 'en'}">${lang === 'en' ? '繁體中文' : 'English'}</a>` : ''}
        <a class="${chip}" href="${name}.md">Markdown</a>
        <a class="${chip}" href="https://github.com/tigernaxojr/aoa/blob/main/${entry.path}.md" target="_blank" rel="noopener noreferrer">GitHub</a>
      </div>
    </header>

    ${toc ? `<details class="mt-6 rounded-md border border-stone-200 bg-white p-4 lg:hidden dark:border-stone-800 dark:bg-stone-900"><summary class="cursor-pointer text-sm font-semibold">${t(lang, '目錄', 'Contents')}</summary><ul class="mt-3 text-sm">${toc}</ul></details>` : ''}

    <div class="article-body mt-8">${article.html}</div>

    <footer class="mt-16 border-t border-stone-200 pt-8 dark:border-stone-800">
      <p class="text-xs text-stone-500 dark:text-stone-400">© 2026 tigernaxo · ${t(lang, '本文採用', 'Licensed under')} <a class="underline hover:text-stone-900" href="${base}LICENSE-docs.txt">CC BY 4.0</a></p>
      ${
        others.length
          ? `<h2 class="mt-10 text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">${t(lang, '延伸閱讀', 'Read more')}</h2>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">${others
        .map(
          (a) =>
            `<a href="${base}${a.path}.html" class="rounded-md border border-stone-300 p-5 hover:border-stone-500 transition-colors dark:border-stone-700 dark:hover:border-stone-500"><span class="font-mono text-[11px] uppercase tracking-wider text-stone-500">${escapeHtml(a.kind)}</span><span class="mt-2 block font-serif text-base font-bold text-stone-900 dark:text-white" >${escapeHtml(titles[a.path] ?? a.path.split('/').pop()!)}</span></a>`,
        )
        .join('')}</div>`
          : ''
      }
    </footer>
  </article>

  ${toc ? `<aside class="hidden lg:block"><div class="sticky top-24"><p class="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">${t(lang, '目錄', 'On this page')}</p><ul class="mt-3 max-h-[calc(100vh-8rem)] overflow-y-auto text-sm">${toc}</ul></div></aside>` : ''}
</div>`
}
