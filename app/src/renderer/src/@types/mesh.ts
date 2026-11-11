import type { Point } from './geometry'
import type { VertexWeight } from './rig'

/** SVG/Canvas 2D affine matrix in [a, b, c, d, e, f] order. */
export type Matrix2D = [number, number, number, number, number, number]

/**
 * A mesh vertex stores its immutable texture-space coordinate separately from
 * its editable setup position. Both coordinates are local to the artwork
 * layer, not the full artwork document.
 */
export interface MeshVertex {
  id: string
  source: Point
  position: Point
  weights: VertexWeight[]
}

export interface MeshTriangle {
  id: string
  vertexIds: [string, string, string]
}

export interface ArtworkMesh {
  vertices: MeshVertex[]
  triangles: MeshTriangle[]
  /** Optional setup-pose matrices captured when bone weighting is enabled. */
  bindPose?: Record<string, Matrix2D>
}

/** A deform key stores offsets from each vertex's setup position. */
export interface MeshDeformValue {
  kind: 'mesh-deform'
  offsets: Record<string, Point>
}

export interface ClipVertex extends Point {
  id: string
}

export interface ArtworkClipping {
  id: string
  enabled: boolean
  inverted: boolean
  vertices: ClipVertex[]
}

export type GeometrySelectionKind = 'mesh' | 'clip'

export interface GeometrySelection {
  kind: GeometrySelectionKind
  layerId: string
  vertexIds: string[]
}

export type WeightPaintMode = 'add' | 'subtract' | 'replace'

export interface WeightBrush {
  boneId: string | null
  /** Brush radius in artwork-layer pixels. */
  radius: number
  /** A normalized amount from 0 to 1. */
  strength: number
  mode: WeightPaintMode
}

/** Fields that can be mixed into an imported ArtworkLayer. */
export interface ArtworkGeometry {
  mesh?: ArtworkMesh
  clipping?: ArtworkClipping
}
