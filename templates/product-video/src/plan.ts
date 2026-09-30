// Shape of the render plan built by scripts/lib/scene-plan.mjs and passed in as inputProps.
export type Position = string | { x: number; y: number }

export type Background =
  | { kind: 'gradient' }
  | { kind: 'image'; src: string; fit: 'contain' | 'cover'; kenBurns: boolean }
  | { kind: 'video'; src: string; fit: 'contain' | 'cover' }
  | { kind: 'code'; language: string; lines: string[]; highlightLines: number[] }

export type PlanElement = {
  type: 'text' | 'image' | 'video'
  content?: string
  src?: string
  at: number
  end: number
  exitAt: number | null
  animation: string
  position: Position
}

export type Plan = {
  id: string
  width: number
  height: number
  fps: number
  frames: number
  durationSec: number
  background: Background
  elements: PlanElement[]
  audio: { src: string; durationSec: number } | null
}
