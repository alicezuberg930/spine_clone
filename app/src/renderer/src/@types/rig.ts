import type { Point, Transform } from './geometry'

export interface PhysicsParams {
  inertia: number
  strength: number
  damping: number
  mass: number
  wind: number
  gravity: number
}

export interface Bone {
  id: string
  name: string
  parentId: string | null
  length: number
  color: string
  transform: Transform
}

export interface Slot {
  id: string
  name: string
  boneId: string
  attachmentIds: string[]
  activeAttachmentId: string
  drawOrder: number
}

export type AttachmentType = 'region' | 'mesh' | 'clipping' | 'bounding-box' | 'path'

export interface VertexWeight {
  boneId: string
  value: number
}

export interface Attachment {
  id: string
  name: string
  slotId: string
  type: AttachmentType
  color: string
  width: number
  height: number
  vertices?: Point[]
  weights?: Record<number, VertexWeight[]>
}

export type ConstraintType = 'physics' | 'ik' | 'transform' | 'path' | 'slider'

export interface Constraint {
  id: string
  name: string
  type: ConstraintType
  boneIds: string[]
  targetId?: string
  mix: number
  physics?: PhysicsParams
}

export interface Skin {
  id: string
  name: string
  accent: string
  attachmentIds: string[]
}
