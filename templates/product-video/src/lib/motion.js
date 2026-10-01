// Layout and animation math for the scene player (src/html/player.js). Pure functions of time `t`
// (seconds from the scene start); no DOM here, so it can be unit-tested in Node.

export const THEME = {
  // Both families ship in src/fonts/ (loaded by the player), so every OS renders the same glyphs.
  fontFamily: '"Noto Sans TC", sans-serif',
  monoFamily: '"JetBrains Mono", "Noto Sans TC", monospace',
  background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0c4a6e 100%)',
  text: '#ffffff',
  accent: '#38bdf8',
  panel: 'rgba(15, 23, 42, 0.62)',
  codeBackground: '#0b1220',
  codeText: '#e2e8f0',
}

/** Font scale of a text element per `size`. Enlarged text shrinks back toward 1 to fit (player.js). */
export const TEXT_SIZE = { normal: 1, large: 1.35, xl: 1.7 }
/** Most lines an enlarged text element may wrap to before it is shrunk. */
export const TEXT_MAX_LINES = 2

/** Seconds an element takes to animate in, and to fade out when it has a `duration`. */
export const ENTER_SEC = 0.5
export const EXIT_SEC = 0.3
/** Distance a slide animation travels, as a fraction of the frame width/height. */
const SLIDE = 0.08
/** Safe margin for preset positions, as a percentage of the frame. */
const MARGIN = 8
/** Screenshot backgrounds zoom in by this much over the scene (Ken Burns). */
const KEN_BURNS = 0.06

const clamp = (x) => Math.min(1, Math.max(0, x))
const easeOut = (x) => 1 - (1 - x) ** 3

/**
 * State of an overlay element at time t, or null when it is not on screen.
 * Returns { opacity, dx, dy, scale, chars } where dx/dy are fractions of the frame size and
 * chars is the number of visible characters (typewriter) or null for all.
 */
export function elementState(el, t) {
  if (t < el.at || t >= el.end) return null
  const p = easeOut(clamp((t - el.at) / ENTER_SEC))
  const out = Number.isFinite(el.exitAt) ? clamp((el.end - t) / EXIT_SEC) : 1
  const s = { opacity: out, dx: 0, dy: 0, scale: 1, chars: null }
  switch (el.animation) {
    case 'none':
      break
    case 'slideInLeft':
      Object.assign(s, { opacity: p * out, dx: -SLIDE * (1 - p) })
      break
    case 'slideInRight':
      Object.assign(s, { opacity: p * out, dx: SLIDE * (1 - p) })
      break
    case 'slideInUp':
      Object.assign(s, { opacity: p * out, dy: SLIDE * (1 - p) })
      break
    case 'slideInDown':
      Object.assign(s, { opacity: p * out, dy: -SLIDE * (1 - p) })
      break
    case 'zoomIn':
      Object.assign(s, { opacity: p * out, scale: 0.8 + 0.2 * p })
      break
    case 'typewriter': {
      const text = [...(el.content ?? '')]
      const typeSec = Math.max(ENTER_SEC, text.length * 0.06)
      s.chars = Math.floor(text.length * clamp((t - el.at) / typeSec))
      break
    }
    default: // fadeIn
      s.opacity = p * out
  }
  return s
}

/** Visible text for an element state (handles typewriter by code point, safe for CJK). */
export function visibleText(el, state) {
  if (state.chars === null) return el.content
  return [...el.content].slice(0, state.chars).join('')
}

/**
 * Anchor point of an element as { left, top } percentages of the frame, plus the translate
 * that aligns the element box to that point (presets hug the edges; custom points are centers).
 */
export function anchor(position = 'center') {
  if (typeof position === 'object') return { left: position.x, top: position.y, tx: -50, ty: -50 }
  const [v, h] = {
    center: ['center', 'center'],
    top: ['top', 'center'],
    bottom: ['bottom', 'center'],
    left: ['center', 'left'],
    right: ['center', 'right'],
    'top-left': ['top', 'left'],
    'top-right': ['top', 'right'],
    'bottom-left': ['bottom', 'left'],
    'bottom-right': ['bottom', 'right'],
  }[position]
  const axis = (side, start, end) => (side === start ? [MARGIN, 0] : side === end ? [100 - MARGIN, -100] : [50, -50])
  const [left, tx] = axis(h, 'left', 'right')
  const [top, ty] = axis(v, 'top', 'bottom')
  return { left, top, tx, ty }
}

/** CSS transform for an element: anchor alignment + animation offset + scale. */
export function elementTransform(el, state, width, height) {
  const a = anchor(el.position)
  return `translate(${a.tx}%, ${a.ty}%) translate(${state.dx * width}px, ${state.dy * height}px) scale(${state.scale})`
}

/** Background scale at time t (slow zoom for still screenshots, 1 otherwise). */
export function backgroundScale(bg, t, duration) {
  return bg.kenBurns ? 1 + KEN_BURNS * clamp(t / duration) : 1
}

/** Opacity of the code panel (fades in with the scene). */
export function codeOpacity(t) {
  return easeOut(clamp(t / ENTER_SEC))
}

/** Max box size for image/video overlays, as fractions of the frame. */
const MEDIA_BOX = { image: [0.42, 0.42], video: [0.5, 0.5] }

/**
 * Static CSS for every layer, sized from the frame so layouts scale with the output format.
 * Values are strings with units, usable both as a React `style` and via Object.assign(node.style).
 */
export function styles(width, height, codeLines = 0) {
  const unit = Math.min(width, height)
  const px = (n) => `${Math.round(n)}px`
  const radius = px(unit * 0.018)
  return {
    stage: { background: '#000', fontFamily: THEME.fontFamily, color: THEME.text, overflow: 'hidden' },
    fill: { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', transformOrigin: '50% 50%' },
    gradient: { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', background: THEME.background },
    box: (el) => {
      const a = anchor(el.position)
      return { position: 'absolute', left: `${a.left}%`, top: `${a.top}%`, transformOrigin: '50% 50%' }
    },
    textFont: (scale = 1) => px(unit * 0.062 * scale),
    text: {
      maxWidth: px(width * 0.8),
      width: 'max-content',
      padding: `${px(unit * 0.016)} ${px(unit * 0.03)}`,
      borderRadius: radius,
      background: THEME.panel,
      fontSize: px(unit * 0.062),
      fontWeight: '700',
      lineHeight: '1.3',
      textAlign: 'center',
      textShadow: '0 2px 12px rgba(0,0,0,0.35)',
      whiteSpace: 'pre-wrap',
    },
    media: (type) => ({
      display: 'block',
      maxWidth: px(width * MEDIA_BOX[type][0]),
      maxHeight: px(height * MEDIA_BOX[type][1]),
      borderRadius: radius,
      boxShadow: '0 18px 48px rgba(0,0,0,0.4)',
    }),
    code: {
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      maxWidth: '84%',
      padding: px(unit * 0.035),
      borderRadius: radius,
      background: THEME.codeBackground,
      boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
      fontFamily: THEME.monoFamily,
      fontSize: px(Math.min(unit * 0.034, (height * 0.78) / Math.max(1, codeLines) / 1.5)),
      lineHeight: '1.5',
      color: THEME.codeText,
      whiteSpace: 'pre',
      overflow: 'hidden',
    },
    /** One code line; `dim` when other lines are highlighted and this one is not. */
    codeLine: (hit, dim) => ({
      opacity: dim ? '0.5' : '1',
      background: hit ? 'rgba(56, 189, 248, 0.16)' : 'transparent',
      borderLeft: `4px solid ${hit ? THEME.accent : 'transparent'}`,
      paddingLeft: '0.6em',
    }),
  }
}
