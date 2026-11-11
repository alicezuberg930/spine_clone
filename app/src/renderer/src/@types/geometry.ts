export interface Point {
  x: number
  y: number
}

export interface Transform {
  x: number
  y: number
  rotation: number
  scaleX: number
  scaleY: number
  /** Rotation offset, in degrees, applied to the transform's local X axis. */
  shearX?: number
  /** Rotation offset, in degrees, applied to the transform's local Y axis. */
  shearY?: number
  opacity: number
}
