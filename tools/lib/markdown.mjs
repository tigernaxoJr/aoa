// Markdown helpers for build-api: cut a section out by its `<a id>` anchor, and make relative
// links absolute so extracted text still works when published elsewhere.

const HEADING = /^(#{1,6})\s/
const FENCE = /^\s*(```|~~~)/

/**
 * Returns the section whose heading contains `<a id="anchor">`, up to the next heading of the same
 * or a higher level (headings inside code fences are ignored). Throws when the anchor is missing.
 */
export function section(markdown, anchor) {
  const lines = markdown.split('\n')
  let fenced = false
  let start = -1
  let level = 0
  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i])) fenced = !fenced
    if (fenced) continue
    const m = HEADING.exec(lines[i])
    if (!m) continue
    if (start < 0) {
      if (lines[i].includes(`<a id="${anchor}"></a>`)) {
        start = i
        level = m[1].length
      }
    } else if (m[1].length <= level) {
      return trimRule(lines.slice(start, i))
    }
  }
  if (start < 0) throw new Error(`anchor #${anchor} not found`)
  return trimRule(lines.slice(start))
}

/** Drops trailing blank lines and a trailing `---` separator. */
function trimRule(lines) {
  while (lines.length && /^\s*(---)?\s*$/.test(lines.at(-1))) lines.pop()
  return lines.join('\n')
}

/** Removes YAML frontmatter. */
export function stripFrontmatter(markdown) {
  return markdown.replace(/^---\n[\s\S]*?\n---\n+/, '')
}

/**
 * Rewrites relative links `](file.md#x)` and in-page links `](#x)` to absolute URLs under `base`
 * (the published directory of the source file named `file`). External links are left alone.
 */
export function absolutizeLinks(markdown, base, file) {
  return markdown.replace(/\]\(([^)\s]+)\)/g, (all, target) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return all
    return `](${base}/${target.startsWith('#') ? `${file}${target}` : target})`
  })
}
