export interface ParsedSlide {
  index: number
  title: string
  layout: string
  content: string
  notes?: string
  hasVisuals: boolean
  visualTypes: string[]
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
    if (/<(?:svg|Svg[A-Z0-9_-]*)/i.test(bodyText)) visualTypes.push('SVG')
    if (/<(?:Three[A-Z0-9_-]*|canvas)/i.test(bodyText)) visualTypes.push('Three.js / 3D')
    if (/```mermaid/i.test(bodyText)) visualTypes.push('Mermaid')
    if (/v-click/i.test(bodyText)) visualTypes.push('Motion / Clicks')

    slides.push({
      index: slides.length + 1,
      title,
      layout: slideFm.layout || (slides.length === 0 ? 'cover' : 'default'),
      content: bodyText,
      notes,
      hasVisuals: visualTypes.length > 0,
      visualTypes,
    })
  }

  return {
    slides,
    frontmatter: globalFrontmatter,
  }
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
