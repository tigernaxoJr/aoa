// Reader page. Built pages arrive pre-rendered (SSG in vite.config.ts) and only get behaviour here:
// table-of-contents highlighting and the reading progress bar. During development the page is
// article.html?p=<path>, and the article is fetched and rendered with the same code as the build.
import './style.css'
import { ARTICLES, articleView, renderArticle } from './articles'

const root = document.getElementById('article-root')!

async function renderInBrowser() {
  const path = new URLSearchParams(location.search).get('p') ?? ''
  const entry = ARTICLES.find((a) => a.path === path)
  if (!entry) {
    root.innerHTML = `<p class="mx-auto max-w-3xl px-4 py-24 text-center text-stone-500">找不到文章：${path.replace(/</g, '&lt;')}</p>`
    return
  }
  const base = import.meta.env.BASE_URL
  const res = await fetch(`${base}${entry.path}.md`)
  const article = renderArticle(await res.text())
  document.title = `${article.title} · AOA`
  document.documentElement.lang = entry.lang
  root.innerHTML = articleView(entry, article, base)
  // Relative links in the article assume the page sits next to its Markdown file.
  root.querySelectorAll<HTMLAnchorElement>('.article-body a[href], header a[href$=".md"]').forEach((a) => {
    const href = a.getAttribute('href')!
    if (!/^([a-z]+:|#|\/)/i.test(href)) a.href = new URL(href, new URL(`${base}${entry.path}`, location.origin)).href
  })
}

function enhance() {
  const links = new Map([...root.querySelectorAll<HTMLAnchorElement>('[data-toc]')].map((a) => [a.dataset.toc!, a]))
  const setActive = (id: string) => {
    for (const [key, a] of links) {
      const on = key === id
      a.classList.toggle('!border-accent', on)
      a.classList.toggle('!text-stone-900', on)
      a.classList.toggle('dark:!text-white', on)
    }
  }
  const headings = [...links.keys()].map((id) => document.getElementById(id)).filter((h): h is HTMLElement => !!h)
  if (headings.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-80px 0px -70% 0px' },
    )
    headings.forEach((h) => observer.observe(h))
  }

  const bar = document.getElementById('reading-progress')
  const update = () => {
    const max = document.documentElement.scrollHeight - innerHeight
    if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`
  }
  addEventListener('scroll', update, { passive: true })
  update()
}

;(root.querySelector('.article-body') ? Promise.resolve() : renderInBrowser()).then(enhance)
