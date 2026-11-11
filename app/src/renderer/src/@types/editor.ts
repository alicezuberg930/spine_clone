import type { EditorKeyframe } from './animation'
import type { Transform } from './geometry'
import type { GeometrySelection, WeightBrush } from './mesh'
import type { EditorProject } from './project'
import type { PhysicsParams } from './rig'

export type EditorMode = 'setup' | 'animate'

export type EditorTool =
  | 'select'
  | 'translate'
  | 'rotate'
  | 'scale'
  | 'shear'
  | 'pose'
  | 'create-bone'
  | 'mesh'
  | 'deform'
  | 'weights'
  | 'clipping'
  | 'bounds'

export type TimelineView = 'dopesheet' | 'graph' | 'audio'

/** Determines what happens to a bone's descendants when the bone is deleted. */
export type BoneDeletionMode = 'branch' | 'reparent'

export type SelectionKind =
  | 'skeleton'
  | 'bone'
  | 'slot'
  | 'attachment'
  | 'constraint'
  | 'bounding-box'
  | 'animation'
  | 'skin'
  | 'artwork-layer'
  | 'audio'

export interface EditorSelection {
  kind: SelectionKind
  id: string
}

export type ViewFlag =
  'showBones' | 'showMesh' | 'showWeights' | 'showClipping' | 'showBounds' | 'showGrid' | 'snap'

export interface EditorState {
  project: EditorProject
  mode: EditorMode
  tool: EditorTool
  selection: EditorSelection | null
  selections: EditorSelection[]
  frame: number
  fps: number
  duration: number
  isPlaying: boolean
  loop: boolean
  autoKey: boolean
  ghosting: boolean
  showBones: boolean
  showMesh: boolean
  showWeights: boolean
  showClipping: boolean
  showBounds: boolean
  showGrid: boolean
  snap: boolean
  physicsEnabled: boolean
  zoom: number
  timelineView: TimelineView
  activeSkin: string
  activeAnimation: string
  geometrySelection: GeometrySelection | null
  weightBrush: WeightBrush
  transform: Transform
  physics: PhysicsParams
  keyframes: EditorKeyframe[]
}
