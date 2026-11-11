import type { ArtworkClipping, ArtworkMesh, Matrix2D } from './mesh'

export type ArtworkSourceType = 'psd' | 'images'

export interface ArtworkLayer {
  id: string
  name: string
  groupPath: string[]
  dataUrl: string
  x: number
  y: number
  width: number
  height: number
  opacity: number
  visible: boolean
  blendMode: string
  order: number
  sourceFileName: string
  /** Bone that rigidly drives this layer when it is not relying solely on mesh weights. */
  boneId?: string
  /** Bone world matrix captured when the rigid binding was created. */
  boneBindPose?: Matrix2D
  mesh?: ArtworkMesh
  clipping?: ArtworkClipping
}

export interface ArtworkDocument {
  id: string
  name: string
  sourceType: ArtworkSourceType
  width: number
  height: number
  layers: ArtworkLayer[]
  importedAt: string
}
