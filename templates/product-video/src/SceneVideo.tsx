// Draws one scene render plan with Remotion. Layout and animation come from lib/motion.js,
// shared with the html-capture player so both renderers produce the same picture.
import React from 'react'
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, useCurrentFrame } from 'remotion'
import { backgroundScale, codeOpacity, elementState, elementTransform, styles, visibleText } from './lib/motion.js'
import type { Plan } from './plan'

export const SceneVideo: React.FC<{ plan: Plan }> = ({ plan }) => {
  const t = useCurrentFrame() / plan.fps
  const bg = plan.background
  const css = styles(plan.width, plan.height, bg.kind === 'code' ? bg.lines.length : 0)
  const fill = { ...css.fill, transform: `scale(${backgroundScale(bg, t, plan.durationSec)})` }
  const marked = new Set(bg.kind === 'code' ? bg.highlightLines : [])

  return (
    <AbsoluteFill style={css.stage}>
      {(bg.kind === 'gradient' || bg.kind === 'code') && <div style={css.gradient} />}
      {bg.kind === 'image' && <Img src={bg.src} style={{ ...fill, objectFit: bg.fit }} />}
      {bg.kind === 'video' && <OffthreadVideo src={bg.src} muted style={{ ...fill, objectFit: bg.fit }} />}
      {bg.kind === 'code' && (
        <div style={{ ...css.code, opacity: codeOpacity(t) }}>
          {bg.lines.map((line, i) => (
            <div key={i} style={css.codeLine(marked.has(i + 1), marked.size > 0 && !marked.has(i + 1))}>
              {line || ' '}
            </div>
          ))}
        </div>
      )}

      {plan.elements.map((item, i) => {
        const state = elementState(item, t)
        if (!state) return null
        return (
          <div key={i} style={{ ...css.box(item), opacity: state.opacity, transform: elementTransform(item, state, plan.width, plan.height) }}>
            {item.type === 'text' && <div style={css.text}>{visibleText(item, state)}</div>}
            {item.type === 'image' && <Img src={item.src} style={css.media('image')} />}
            {item.type === 'video' && (
              // The normalized clip starts at the element's `at`; Sequence shifts its timeline to match.
              <Sequence from={Math.round(item.at * plan.fps)} layout="none">
                <OffthreadVideo src={item.src} muted style={css.media('video')} />
              </Sequence>
            )}
          </div>
        )
      })}

      {plan.audio && <Audio src={plan.audio.src} />}
    </AbsoluteFill>
  )
}
