// Assemble timeline (SPEC §6.2 Step 5, §7.5): scene placement with transitions, the FFmpeg filter
// graph, and caption files. Pure functions; assemble.mjs does the I/O.

/** Target transition length; shortened for short scenes and snapped to whole frames. */
export const TRANSITION_SEC = 0.5
/** BGM fade in/out at the start and end of the video. */
export const BGM_FADE_SEC = 1

/** scene.visual.transitionIn → FFmpeg xfade transition. */
const XFADE = { fade: 'fade', 'slide-left': 'slideleft', 'slide-right': 'slideright', wipe: 'wipeleft', zoom: 'zoomin' }

/**
 * Places scenes on the final timeline. `clips` are { duration, transition } in playback order
 * (duration in seconds, a whole number of frames). A transition overlaps the end of the previous
 * scene, so the total is shorter than the sum of the scenes.
 * Returns { items: [{ start, duration, xfade, overlap }], total }.
 */
export function layout(clips, fps) {
  const items = []
  let total = 0
  clips.forEach((clip, i) => {
    const xfade = i > 0 ? XFADE[clip.transition] ?? null : null
    let overlap = 0
    if (xfade) {
      const limit = Math.min(TRANSITION_SEC, clips[i - 1].duration / 2, clip.duration / 2)
      overlap = Math.floor(limit * fps) / fps
    }
    const item = { start: total - overlap, duration: clip.duration, xfade: overlap > 0 ? xfade : null, overlap }
    items.push(item)
    total = item.start + clip.duration
  })
  return { items, total }
}

const n = (x) => Number(x.toFixed(6))

/**
 * Builds the -filter_complex graph. Inputs 0..N-1 are the scene files; input N is the looped BGM
 * when `bgm` is set. Output pads: [vout], [aout].
 */
export function filterGraph({ items, total }, { fps, bgm = null, burn = null, fontsDir = null }) {
  const lines = []
  items.forEach((item, i) => {
    lines.push(`[${i}:v]fps=${fps},settb=AVTB,format=yuv420p,setpts=PTS-STARTPTS[v${i}]`)
    // Pad or cut each scene's audio to its video length, so audio and video never drift apart.
    lines.push(`[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${n(item.duration)},asetpts=PTS-STARTPTS[a${i}]`)
  })
  let v = 'v0'
  let a = 'a0'
  items.slice(1).forEach((item, k) => {
    const i = k + 1
    if (item.xfade) {
      lines.push(`[${v}][v${i}]xfade=transition=${item.xfade}:duration=${n(item.overlap)}:offset=${n(item.start)}[vx${i}]`)
      lines.push(`[${a}][a${i}]acrossfade=d=${n(item.overlap)}:c1=tri:c2=tri[ax${i}]`)
    } else {
      lines.push(`[${v}][v${i}]concat=n=2:v=1:a=0[vx${i}]`)
      lines.push(`[${a}][a${i}]concat=n=2:v=0:a=1[ax${i}]`)
    }
    v = `vx${i}`
    a = `ax${i}`
  })

  lines.push(burn ? `[${v}]ass=${burn}${fontsDir ? `:fontsdir=${fontsDir}` : ''}[vout]` : `[${v}]null[vout]`)

  if (!bgm) {
    lines.push(`[${a}]anull[aout]`)
  } else {
    const fade = n(Math.min(BGM_FADE_SEC, total / 2))
    lines.push(
      `[${items.length}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${bgm.volume},` +
        `atrim=duration=${n(total)},asetpts=PTS-STARTPTS,afade=t=in:d=${fade},afade=t=out:st=${n(total - fade)}:d=${fade}[bgm]`,
    )
    if (bgm.ducking) {
      lines.push(`[${a}]asplit=2[narr][key]`)
      lines.push(`[bgm][key]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=400[duck]`)
      lines.push(`[narr][duck]amix=inputs=2:duration=first:normalize=0[aout]`)
    } else {
      lines.push(`[${a}][bgm]amix=inputs=2:duration=first:normalize=0[aout]`)
    }
  }
  return lines.join(';\n')
}

/**
 * Shifts each scene's captions by its start time. A cue never runs past the next scene's start
 * or its own scene's end; cues left empty by that are dropped.
 */
export function mergeCaptions({ items }, perScene) {
  const cues = []
  items.forEach((item, i) => {
    const limit = Math.min(item.start + item.duration, items[i + 1]?.start ?? Infinity)
    for (const cue of perScene[i] ?? []) {
      const start = item.start + cue.start
      const end = Math.min(item.start + cue.end, limit)
      if (end - start >= 0.05) cues.push({ start, end, text: cue.text })
    }
  })
  return cues
}

function clock(sec, sep) {
  const ms = Math.round(sec * 1000)
  const pad = (x, w = 2) => String(x).padStart(w, '0')
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}${sep}${pad(ms % 1000, 3)}`
}

export function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${clock(c.start, ',')} --> ${clock(c.end, ',')}\n${c.text}\n`).join('\n')
}

/**
 * ASS subtitles for burning in, with PlayRes equal to the output size so `fontSize` is in output
 * pixels. White text with a dark outline; position bottom / middle / top.
 */
export function toAss(cues, { width, height }, style = {}) {
  const fontSize = style.fontSize ?? Math.round((height * 48) / 1080)
  const align = { bottom: 2, middle: 5, top: 8 }[style.position ?? 'bottom']
  const font = (style.fontFamily ?? 'Noto Sans TC').replace(/,/g, ' ')
  const outline = Math.max(1, Math.round(fontSize * 0.07))
  const marginV = Math.round(height * 0.06)
  const assTime = (sec) => clock(sec, '.').slice(1, -1) // H:MM:SS.cc
  const text = (t) => t.replace(/\\/g, '\\\\').replace(/[{}]/g, '').replace(/\r?\n/g, '\\N')
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${font},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,${outline},0,${align},${Math.round(width * 0.06)},${Math.round(width * 0.06)},${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...cues.map((c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${text(c.text)}`),
    '',
  ].join('\n')
}
