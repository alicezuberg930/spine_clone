import type { Point, Transform } from './geometry'
import type { MeshDeformValue } from './mesh'

export type KeyframeValue = number | boolean | string | Point | Transform | MeshDeformValue
export type KeyframeInterpolation = 'linear' | 'stepped' | 'bezier'

export interface EditorKeyframe {
  id: string
  trackId: string
  targetId: string
  property: string
  frame: number
  value: KeyframeValue
  interpolation: KeyframeInterpolation
}

export interface AnimationTrack {
  id: string
  name: string
  targetId: string
  property: string
  color: string
}

export interface Animation {
  id: string
  name: string
  duration: number
  fps: number
  loop: boolean
  tracks: AnimationTrack[]
  keyframes: EditorKeyframe[]
}
