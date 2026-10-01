// Remotion compositions. "Scene" renders one scene plan (pnpm run render:scene passes the real plan
// as inputProps); the default plan is only a placeholder for `pnpm run preview`.
import React from 'react'
import { Composition } from 'remotion'
import { SceneVideo } from './SceneVideo'
import type { Plan } from './plan'

const previewPlan: Plan = {
  id: 'preview',
  width: 1920,
  height: 1080,
  fps: 30,
  frames: 120,
  durationSec: 4,
  background: { kind: 'gradient' },
  elements: [
    { type: 'text', content: 'pnpm run render:scene <id>', at: 0.3, end: 4, exitAt: null, animation: 'slideInUp', position: 'center' },
  ],
  audio: null,
}

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Scene"
    component={SceneVideo}
    defaultProps={{ plan: previewPlan }}
    durationInFrames={previewPlan.frames}
    fps={previewPlan.fps}
    width={previewPlan.width}
    height={previewPlan.height}
    calculateMetadata={({ props }) => ({
      durationInFrames: props.plan.frames,
      fps: props.plan.fps,
      width: props.plan.width,
      height: props.plan.height,
    })}
  />
)
