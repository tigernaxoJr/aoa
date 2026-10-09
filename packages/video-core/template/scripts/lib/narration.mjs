// script.md parsing and caption timing (SPEC §4.3, §7.5).
import { SPEAKER } from './core.mjs'

/**
 * Extracts display text (for subtitles and captions) by resolving inline tts tags:
 * `[重慶](tts: 蟲慶)` -> `重慶`
 * `{重慶|tts: 蟲慶}` -> `重慶`
 */
export function toDisplayText(text) {
  return text
    .replace(/\[([^\]]+)\]\(tts:\s*([^)]+)\)/g, '$1')
    .replace(/\{([^|]+)\|tts:\s*([^}]+)\}/g, '$1')
}

/**
 * Extracts spoken text (for TTS audio synthesis) by resolving inline tts tags and pronunciation dictionary:
 * `[重慶](tts: 蟲慶)` -> `蟲慶`
 * `{重慶|tts: 蟲慶}` -> `蟲慶`
 * And replacing words matching `dict` entries.
 */
export function toSpokenText(text, dict = null) {
  let spoken = text
    .replace(/\[([^\]]+)\]\(tts:\s*([^)]+)\)/g, '$2')
    .replace(/\{([^|]+)\|tts:\s*([^}]+)\}/g, '$2')
  if (dict && typeof dict === 'object') {
    const keys = Object.keys(dict).filter(Boolean).sort((a, b) => b.length - a.length)
    for (const key of keys) {
      if (spoken.includes(key)) {
        spoken = spoken.replaceAll(key, dict[key])
      }
    }
  }
  return spoken
}

/**
 * Splits a script into blocks: { type: 'text', lines: string[], displayLines: string[], spokenLines: string[], speaker? } separated by
 * { type: 'pause', sec } for `<!-- pause 0.5 -->` markers. Other comments and blank lines are dropped.
 * A line starting with 【name】 is spoken by that character (the marker is not part of the text);
 * consecutive lines of the same speaker share a block, and unmarked lines are the narrator's.
 * Options may include `pronunciation` mapping dict: { "word": "replacement" }.
 */
export function parseScript(script, options = {}) {
  const pronunciation = options.pronunciation ?? null
  const blocks = []
  let rawLines = []
  let speaker = null
  const flush = () => {
    if (rawLines.length) {
      const displayLines = rawLines.map(toDisplayText)
      const spokenLines = rawLines.map((l) => toSpokenText(l, pronunciation))
      const block = { type: 'text', lines: displayLines }
      if (speaker) block.speaker = speaker
      if (spokenLines.some((l, idx) => l !== displayLines[idx])) {
        block.spokenLines = spokenLines
      }
      blocks.push(block)
    }
    rawLines = []
  }
  const tokens = script.split(/(<!--[\s\S]*?-->)/)
  for (const token of tokens) {
    const pause = token.match(/^<!--\s*pause\s+(\d+(?:\.\d+)?)\s*-->$/)
    if (pause) {
      flush()
      blocks.push({ type: 'pause', sec: Number(pause[1]) })
      continue
    }
    if (token.startsWith('<!--')) continue
    for (const line of token.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const marked = trimmed.match(SPEAKER)
      const who = marked ? marked[1] : null
      const text = marked ? marked[2].trim() : trimmed
      if (who !== speaker) {
        flush()
        speaker = who
      }
      if (text) rawLines.push(text)
    }
  }
  flush()
  return blocks
}

const CJK = /[぀-ヿ㐀-鿿가-힯]/
const LATIN = /[A-Za-z0-9]/

/** Max caption length: 16 characters for CJK text, 42 otherwise. */
export function captionLimit(text) {
  return CJK.test(text) ? 16 : 42
}

/** Visible length used for proportional timing (whitespace ignored). */
const weight = (text) => text.replace(/\s+/g, '').length || 1

/**
 * Splits a sentence into caption-sized pieces of roughly equal length. Each cut goes to the
 * break nearest the ideal position: punctuation first, then whitespace, then a hard cut.
 */
export function splitCaption(text, limit = captionLimit(text)) {
  if (text.length <= limit) return [text]
  // A cut never splits a Latin word; in CJK text it also keeps a run of Latin words (a name such as
  // "Slide Studio") together, since the space inside it is not where a CJK reader expects a break.
  const cjk = CJK.test(text)
  const splits = (s, at) => {
    const before = cjk ? s.slice(0, at).trimEnd().slice(-1) : s[at - 1]
    const after = cjk ? s.slice(at).trimStart()[0] : s[at]
    return LATIN.test(before ?? '') && LATIN.test(after ?? '')
  }
  const pieces = []
  let rest = text
  while (rest.length > limit) {
    const count = Math.ceil(rest.length / limit)
    const ideal = Math.round(rest.length / count)
    const reach = Math.floor(limit / 3)
    let cut = -1
    for (const re of [/[，、；：,;:]/g, /\s/g]) {
      let best = Infinity
      for (const m of rest.matchAll(re)) {
        const at = m.index + 1
        const distance = Math.abs(at - ideal)
        if (at <= limit && distance <= reach && distance < best && !splits(rest, at)) {
          best = distance
          cut = at
        }
      }
      if (cut > 0) break
    }
    if (cut <= 0) {
      // Hard cut: move to whichever edge of the word (or run of words) is nearer the ideal and still
      // fits the line; a word longer than the line goes whole.
      const hard = Math.min(ideal, limit)
      let back = hard
      while (back > 0 && splits(rest, back)) back--
      let ahead = hard
      while (ahead < rest.length && splits(rest, ahead)) ahead++
      const fits = [back, ahead].filter((at) => at > 0 && at <= limit)
      cut = fits.length ? fits.reduce((a, b) => (Math.abs(b - ideal) < Math.abs(a - ideal) ? b : a)) : ahead
    }
    pieces.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) pieces.push(rest)
  return pieces
}

/** Sentences of a line, split after 。！？!? and after ". " style endings. */
export function sentences(line) {
  return line.match(/[^。！？!?]+[。！？!?]*|[。！？!?]+/g)?.map((s) => s.trim()).filter(Boolean) ?? [line]
}

/**
 * Builds caption cues for one synthesized text block.
 * `words` (optional) are provider word boundaries: [{ start, end, text }] in seconds relative to the block.
 * Without words, time is distributed proportionally to text length over `duration`.
 * Returns cues relative to the block start.
 */
export function blockCues(lines, duration, words = null) {
  const pieces = lines.flatMap((line) => sentences(line).flatMap((s) => splitCaption(s)))
  if (!pieces.length) return []
  if (words?.length) {
    const aligned = alignToWords(pieces, words, duration)
    if (aligned) return aligned
  }
  const total = pieces.reduce((n, p) => n + weight(p), 0)
  let t = 0
  return pieces.map((text) => {
    const start = t
    t += (duration * weight(text)) / total
    return { start: round(start), end: round(t), text }
  })
}

/**
 * Maps caption pieces onto word boundaries by walking the concatenated (whitespace-free) text.
 * Returns null when the provider's words do not line up with the script (e.g. number expansion).
 */
function alignToWords(pieces, words, duration) {
  const norm = (s) => s.replace(/[\s\p{P}\p{S}]/gu, '')
  const spans = []
  let pos = 0
  for (const w of words) {
    const n = norm(w.text)
    spans.push({ from: pos, to: pos + n.length, start: w.start, end: w.end })
    pos += n.length
  }
  const cues = []
  let cursor = 0
  for (let i = 0; i < pieces.length; i++) {
    const len = norm(pieces[i]).length
    const from = cursor
    const to = cursor + len
    cursor = to
    const covering = spans.filter((s) => s.to > from && s.from < to)
    if (!covering.length) return null
    cues.push({ start: covering[0].start, end: covering.at(-1).end, text: pieces[i] })
  }
  if (Math.abs(cursor - pos) > Math.max(2, pos * 0.1)) return null
  // Close the gaps so captions stay on screen until the next one starts.
  for (let i = 0; i < cues.length; i++) {
    cues[i].start = round(i === 0 ? 0 : cues[i - 1].end)
    cues[i].end = round(i === cues.length - 1 ? duration : Math.max(cues[i].end, cues[i + 1].start))
  }
  return cues
}

const round = (n) => Math.round(n * 1000) / 1000
