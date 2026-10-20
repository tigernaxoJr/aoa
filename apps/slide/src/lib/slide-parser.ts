import { marked } from 'marked'

export interface ParsedSlide {
  index: number
  title: string
  layout: string
  background?: string
  class?: string
  content: string
  renderedHtml?: string
  notes?: string
  hasVisuals: boolean
  visualTypes: string[]
  rawMarkdown: string
}

export interface ParsedDeck {
  slides: ParsedSlide[]
  frontmatter: Record<string, string>
}

/** Parses raw slides.md text into individual slides and frontmatter. */
export function parseSlides(markdown: string): ParsedDeck {
  if (!markdown || !markdown.trim()) {
    return { slides: [], frontmatter: {} }
  }

  const lines = markdown.split(/\r?\n/)
  const rawChunks: string[][] = []
  let currentChunk: string[] = []
  let inCodeBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock
    }

    // Split on '---' outside code blocks
    if (!inCodeBlock && line.trim() === '---') {
      if (currentChunk.length > 0) {
        rawChunks.push(currentChunk)
        currentChunk = []
      }
      continue
    }

    currentChunk.push(line)
  }

  if (currentChunk.length > 0) {
    rawChunks.push(currentChunk)
  }

  let globalFrontmatter: Record<string, string> = {}
  let startIndex = 0

  if (rawChunks.length > 0 && isPureFrontmatter(rawChunks[0])) {
    globalFrontmatter = parseKeyValues(rawChunks[0])
    startIndex = 1
  }

  const slides: ParsedSlide[] = []
  let pendingFrontmatter: Record<string, string> = {}

  for (let idx = startIndex; idx < rawChunks.length; idx++) {
    const chunkLines = rawChunks[idx]
    if (chunkLines.length === 0) continue

    // If chunk is standalone frontmatter (e.g. --- layout: two-cols ---)
    if (isPureFrontmatter(chunkLines)) {
      pendingFrontmatter = { ...pendingFrontmatter, ...parseKeyValues(chunkLines) }
      continue
    }

    // Extract slide-level frontmatter at the top of chunk if any
    let fmEnd = 0
    while (fmEnd < chunkLines.length && chunkLines[fmEnd].includes(':') && !chunkLines[fmEnd].startsWith('#')) {
      fmEnd++
    }

    const slideFmLines = chunkLines.slice(0, fmEnd)
    const slideFm = { ...pendingFrontmatter, ...parseKeyValues(slideFmLines) }
    pendingFrontmatter = {}

    const bodyLines = chunkLines.slice(fmEnd)
    const bodyText = bodyLines.join('\n').trim()

    // Extract title (first # Heading)
    let title = ''
    for (const line of bodyLines) {
      const match = /^#{1,3}\s+(.+)$/.exec(line.trim())
      if (match) {
        title = match[1].replace(/<[^>]+>/g, '').trim()
        break
      }
    }
    if (!title) {
      title = `第 ${slides.length + 1} 頁`
    }

    // Speaker notes: like Slidev, the last HTML comment of the slide (earlier comments are not notes)
    let notes: string | undefined
    const comments = [...bodyText.matchAll(/<!--([\s\S]*?)-->/g)]
    const lastComment = comments.at(-1)?.[1].trim()
    if (lastComment) notes = lastComment

    // Detect visuals
    const visualTypes: string[] = []
    if (/<(?:svg|Svg[A-Z0-9_-]*|Rough[A-Z0-9_-]*)/i.test(bodyText)) visualTypes.push('SVG')
    if (/<(?:Three[A-Z0-9_-]*|canvas)/i.test(bodyText)) visualTypes.push('Three.js / 3D')
    if (/```mermaid/i.test(bodyText)) visualTypes.push('Mermaid')
    if (/v-click/i.test(bodyText)) visualTypes.push('Motion / Clicks')

    // Clean text without html tags and comments for text previews
    const textWithoutComments = bodyText.replace(/<!--[\s\S]*?-->/g, '')
    const cleanLines = textWithoutComments
      .split('\n')
      .filter((l) => !/^#{1,3}\s+/.test(l.trim())) // omit title heading from body preview
      .join('\n')
      .replace(/<[^>]+>/g, '') // strip raw html tags like <div>, <ThreeGlobe />
      .replace(/::right::/g, '')
      .replace(/::left::/g, '')
      .trim()

    // Render markdown to sanitized HTML using marked
    let renderedHtml = ''
    try {
      renderedHtml = previewHtml(textWithoutComments)
    } catch {
      renderedHtml = bodyText
    }

    slides.push({
      index: slides.length + 1,
      title,
      layout: slideFm.layout || (slides.length === 0 ? 'cover' : 'default'),
      background: slideFm.background || (slides.length === 0 ? globalFrontmatter.background : undefined),
      class: slideFm.class || (slides.length === 0 ? globalFrontmatter.class : undefined),
      content: cleanLines || bodyText,
      renderedHtml,
      notes,
      hasVisuals: visualTypes.length > 0,
      visualTypes,
      rawMarkdown: chunkLines.join('\n').trim(),
    })
  }

  return {
    slides,
    frontmatter: globalFrontmatter,
  }
}

/** What a Mermaid diagram draws, by its first word. */
const DIAGRAM: Record<string, string> = {
  pie: '圓餅圖',
  flowchart: '流程圖',
  graph: '流程圖',
  sequenceDiagram: '時序圖',
  classDiagram: '類別圖',
  stateDiagram: '狀態圖',
  'stateDiagram-v2': '狀態圖',
  erDiagram: '關聯圖',
  gantt: '甘特圖',
  journey: '旅程圖',
  mindmap: '心智圖',
  timeline: '時間軸',
  quadrantChart: '象限圖',
  'xychart-beta': '座標圖',
  gitGraph: '分支圖',
}

/** A box naming what only the real render can draw. Inline, so the markdown around it stays markdown. */
const box = (label: string) => `<span class="slide-placeholder">${label}</span>`

/** A Vue component the deck uses, e.g. `<ThreeGlobe />`. */
const COMPONENT = /<([A-Z][\w-]*)\b[^>]*\/>/g

/**
 * The slide body as the text preview shows it, split at Slidev's named slots (a line like `::right::`;
 * the text before the first one is the default slot). Mermaid diagrams and Vue components become boxes
 * naming them instead of their source; code inside other fences is left as written.
 */
function previewSlots(body: string): { name: string; md: string }[] {
  const slots: { name: string; lines: string[] }[] = [{ name: 'default', lines: [] }]
  let fence: { mark: string; mermaid: boolean; lines: string[] } | null = null
  for (const line of body.split('\n')) {
    const at = slots[slots.length - 1].lines
    const t = line.trim()
    if (fence) {
      if (t.startsWith(fence.mark) && /^(`{3,}|~{3,})$/.test(t)) {
        if (fence.mermaid) {
          const kind = fence.lines.slice(1).map((l) => l.trim()).find(Boolean)?.split(/\s/)[0] ?? ''
          at.push('', box(`圖表 · ${DIAGRAM[kind] ?? 'Mermaid'}`), '')
        } else at.push(...fence.lines, line)
        fence = null
      } else fence.lines.push(line)
      continue
    }
    const open = /^(`{3,}|~{3,})\s*([\w-]*)/.exec(t)
    if (open) {
      fence = { mark: open[1], mermaid: open[2].toLowerCase() === 'mermaid', lines: [line] }
      continue
    }
    const slot = /^::([\w-]+)::$/.exec(t)
    if (slot) slots.push({ name: slot[1], lines: [] })
    else at.push(line.replace(COMPONENT, (_, name: string) => box(`元件 · ${name}`)))
  }
  if (fence) slots[slots.length - 1].lines.push(...fence.lines)
  return slots.map((s) => ({ name: s.name, md: s.lines.join('\n') }))
}

/**
 * The slide as HTML for the text preview. With named slots the slide is laid out in columns, as Slidev's
 * two-column layouts do: the default slot is the left column (two-cols), or the heading above the
 * columns when they are named left and right (two-cols-header).
 */
function previewHtml(body: string): string {
  const render = (md: string) => marked.parse(md, { async: false }) as string
  const [main, ...named] = previewSlots(body)
  if (!named.length) return render(main.md)
  const header = named.some((s) => s.name === 'left') ? main : null
  const columns = header ? named : [main, ...named]
  return `${header ? render(header.md) : ''}<div class="slide-cols">${columns.map((c) => `<div>${render(c.md)}</div>`).join('')}</div>`
}

function isPureFrontmatter(lines: string[]): boolean {
  const nonEmpty = lines.filter((l) => l.trim() && !l.trim().startsWith('#'))
  return nonEmpty.length > 0 && nonEmpty.every((l) => l.includes(':') && !l.trim().startsWith('-') && !l.trim().startsWith('*'))
}

function parseKeyValues(lines: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim()
      const val = trimmed.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '')
      if (key) result[key] = val
    }
  }
  return result
}
