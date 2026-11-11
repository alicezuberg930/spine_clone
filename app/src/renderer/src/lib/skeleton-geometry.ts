import type { ArtworkLayer, Bone, Matrix2D, Point, Transform } from '@/@types'

const EPSILON = 1e-8

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface BoneSegment {
  id: string
  name: string
  parentId: string | null
  color: string
  start: Point
  end: Point
}

export interface WorldBonePose {
  origin: Point
  rotation: number
  scaleX: number
  scaleY: number
  shearX: number
  shearY: number
  matrix: Matrix2D
}

export interface BoneFitTransform {
  scale: number
  sourceCenter: Point
  targetCenter: Point
}

export interface CreateBoneOptions {
  id: string
  name: string
  color: string
}

const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / 180

const radiansToDegrees = (radians: number): number => (radians * 180) / Math.PI

const normalizeDegrees = (degrees: number): number => {
  const normalized = ((((degrees + 180) % 360) + 360) % 360) - 180
  return Object.is(normalized, -0) ? 0 : normalized
}

/**
 * Builds a Spine-style local affine transform. Shear rotates the X and Y axes
 * independently: X uses rotation + shearX while Y uses rotation + 90 + shearY.
 */
export function matrixFromBoneTransform(transform: Transform): Matrix2D {
  const xAxis = degreesToRadians(transform.rotation + (transform.shearX ?? 0))
  const yAxis = degreesToRadians(transform.rotation + 90 + (transform.shearY ?? 0))
  return [
    Math.cos(xAxis) * transform.scaleX,
    Math.sin(xAxis) * transform.scaleX,
    Math.cos(yAxis) * transform.scaleY,
    Math.sin(yAxis) * transform.scaleY,
    transform.x,
    transform.y
  ]
}

export function multiplyAffineMatrices(left: Matrix2D, right: Matrix2D): Matrix2D {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5]
  ]
}

export function invertAffineMatrix(matrix: Matrix2D): Matrix2D | null {
  const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2]
  if (Math.abs(determinant) <= EPSILON) return null
  return [
    matrix[3] / determinant,
    -matrix[1] / determinant,
    -matrix[2] / determinant,
    matrix[0] / determinant,
    (matrix[2] * matrix[5] - matrix[3] * matrix[4]) / determinant,
    (matrix[1] * matrix[4] - matrix[0] * matrix[5]) / determinant
  ]
}

export function transformPointByMatrix(matrix: Matrix2D, point: Point): Point {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5]
  }
}

export function transformVectorByMatrix(matrix: Matrix2D, vector: Point): Point {
  return {
    x: matrix[0] * vector.x + matrix[2] * vector.y,
    y: matrix[1] * vector.x + matrix[3] * vector.y
  }
}

/**
 * Decomposes an affine matrix without losing its two independent axis angles.
 * The template's shearX and scale signs are retained to keep editor values
 * stable; shearY absorbs the remaining angle between the axes.
 */
export function transformFromMatrix(matrix: Matrix2D, template: Transform): Transform {
  const xMagnitude = Math.hypot(matrix[0], matrix[1])
  const yMagnitude = Math.hypot(matrix[2], matrix[3])
  const scaleXSign = template.scaleX < 0 ? -1 : 1
  const scaleYSign = template.scaleY < 0 ? -1 : 1
  const scaleX = xMagnitude <= EPSILON ? template.scaleX : xMagnitude * scaleXSign
  const scaleY = yMagnitude <= EPSILON ? template.scaleY : yMagnitude * scaleYSign
  const xAxis =
    xMagnitude <= EPSILON
      ? template.rotation + (template.shearX ?? 0)
      : radiansToDegrees(Math.atan2(matrix[1] / scaleXSign, matrix[0] / scaleXSign))
  const yAxis =
    yMagnitude <= EPSILON
      ? template.rotation + 90 + (template.shearY ?? 0)
      : radiansToDegrees(Math.atan2(matrix[3] / scaleYSign, matrix[2] / scaleYSign))
  const shearX = template.shearX ?? 0
  const rotation = normalizeDegrees(xAxis - shearX)

  return {
    ...template,
    x: matrix[4],
    y: matrix[5],
    rotation,
    scaleX,
    scaleY,
    shearX,
    shearY: normalizeDegrees(yAxis - rotation - 90)
  }
}

export function resolveBoneWorldMatrices(bones: readonly Bone[]): Map<string, Matrix2D> {
  const boneById = new Map(bones.map((bone) => [bone.id, bone]))
  const matrices = new Map<string, Matrix2D>()
  const resolving = new Set<string>()

  const resolveMatrix = (bone: Bone): Matrix2D => {
    const cached = matrices.get(bone.id)
    if (cached) return cached
    const local = matrixFromBoneTransform(bone.transform)

    // Keep malformed cyclic rigs finite. The cycle entry behaves like a root.
    if (resolving.has(bone.id)) return local

    resolving.add(bone.id)
    const parent = bone.parentId ? boneById.get(bone.parentId) : undefined
    const world = parent ? multiplyAffineMatrices(resolveMatrix(parent), local) : local
    resolving.delete(bone.id)
    matrices.set(bone.id, world)
    return world
  }

  bones.forEach(resolveMatrix)
  return matrices
}

export function resolveBoneWorldPoses(bones: readonly Bone[]): Map<string, WorldBonePose> {
  const matrices = resolveBoneWorldMatrices(bones)
  return new Map(
    bones.map((bone) => {
      const matrix = matrices.get(bone.id) ?? matrixFromBoneTransform(bone.transform)
      const transform = transformFromMatrix(matrix, bone.transform)
      return [
        bone.id,
        {
          origin: { x: matrix[4], y: matrix[5] },
          rotation: transform.rotation,
          scaleX: transform.scaleX,
          scaleY: transform.scaleY,
          shearX: transform.shearX ?? 0,
          shearY: transform.shearY ?? 0,
          matrix
        }
      ]
    })
  )
}

export function resolveBoneSegments(bones: readonly Bone[]): BoneSegment[] {
  const matrices = resolveBoneWorldMatrices(bones)

  return bones.map((bone) => {
    const matrix = matrices.get(bone.id) ?? matrixFromBoneTransform(bone.transform)
    const start = { x: matrix[4], y: matrix[5] }
    const end = transformPointByMatrix(matrix, { x: bone.length, y: 0 })
    return {
      id: bone.id,
      name: bone.name,
      parentId: bone.parentId,
      color: bone.color,
      start,
      end
    }
  })
}

export function artworkContentBounds(layers: readonly ArtworkLayer[], fallback: Bounds): Bounds {
  const visibleLayers = layers.filter(
    (layer) => layer.visible && layer.width > 0 && layer.height > 0
  )
  if (visibleLayers.length === 0) return fallback

  const left = Math.min(...visibleLayers.map((layer) => layer.x))
  const top = Math.min(...visibleLayers.map((layer) => layer.y))
  const right = Math.max(...visibleLayers.map((layer) => layer.x + layer.width))
  const bottom = Math.max(...visibleLayers.map((layer) => layer.y + layer.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function fitBoneSegmentsToBounds(
  segments: readonly BoneSegment[],
  target: Bounds,
  paddingRatio = 0.12
): BoneSegment[] {
  if (segments.length === 0) return []

  const transform = boneFitTransform(segments, target, paddingRatio)
  const mapPoint = (point: Point): Point => mapPointThroughBoneFit(point, transform)

  return segments.map((segment) => ({
    ...segment,
    start: mapPoint(segment.start),
    end: mapPoint(segment.end)
  }))
}

export function boneFitTransform(
  segments: readonly BoneSegment[],
  target: Bounds,
  paddingRatio = 0.12
): BoneFitTransform {
  if (segments.length === 0) {
    const center = { x: target.x + target.width / 2, y: target.y + target.height / 2 }
    return { scale: 1, sourceCenter: center, targetCenter: center }
  }

  const points = segments.flatMap((segment) => [segment.start, segment.end])
  const left = Math.min(...points.map((point) => point.x))
  const top = Math.min(...points.map((point) => point.y))
  const right = Math.max(...points.map((point) => point.x))
  const bottom = Math.max(...points.map((point) => point.y))
  const sourceWidth = Math.max(1, right - left)
  const sourceHeight = Math.max(1, bottom - top)
  const padding = Math.max(0, Math.min(0.45, paddingRatio))
  const targetWidth = Math.max(1, target.width * (1 - padding * 2))
  const targetHeight = Math.max(1, target.height * (1 - padding * 2))
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
  const sourceCenter = { x: (left + right) / 2, y: (top + bottom) / 2 }
  const targetCenter = {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2
  }

  return { scale, sourceCenter, targetCenter }
}

export function mapPointThroughBoneFit(point: Point, transform: BoneFitTransform): Point {
  return {
    x: transform.targetCenter.x + (point.x - transform.sourceCenter.x) * transform.scale,
    y: transform.targetCenter.y + (point.y - transform.sourceCenter.y) * transform.scale
  }
}

/**
 * Converts a legacy model-space rig to stable artwork document coordinates once.
 * After this migration the overlay can render resolved segments directly, so adding a
 * bone never causes the rest of the skeleton to be refitted or shifted.
 */
export function fitBonesToBounds(
  bones: readonly Bone[],
  target: Bounds,
  paddingRatio = 0.12
): Bone[] {
  if (bones.length === 0) return []

  const transform = boneFitTransform(resolveBoneSegments(bones), target, paddingRatio)
  const ids = new Set(bones.map((bone) => bone.id))

  return bones.map((bone) => {
    const isRoot = bone.parentId === null || !ids.has(bone.parentId)
    const origin = isRoot
      ? mapPointThroughBoneFit({ x: bone.transform.x, y: bone.transform.y }, transform)
      : {
          x: bone.transform.x * transform.scale,
          y: bone.transform.y * transform.scale
        }

    return {
      ...bone,
      length: bone.length * transform.scale,
      transform: {
        ...bone.transform,
        x: origin.x,
        y: origin.y
      }
    }
  })
}

/** Creates a root or child bone from points authored in the rig's world coordinate space. */
export function createBoneFromWorldSegment(
  bones: readonly Bone[],
  parentId: string | null,
  start: Point,
  end: Point,
  options: CreateBoneOptions
): Bone {
  const parent = parentId ? bones.find((bone) => bone.id === parentId) : undefined
  const parentMatrix = parent ? resolveBoneWorldMatrices(bones).get(parent.id) : undefined
  const inverseParent = parentMatrix ? invertAffineMatrix(parentMatrix) : null
  let localStart = { ...start }
  let localEnd = { ...end }

  if (inverseParent) {
    localStart = transformPointByMatrix(inverseParent, start)
    localEnd = transformPointByMatrix(inverseParent, end)
  } else if (parentMatrix) {
    // A singular parent cannot be inverted. Keep the result finite and position it
    // relative to the parent origin; ordinary non-singular rigs use the exact path.
    localStart = { x: start.x - parentMatrix[4], y: start.y - parentMatrix[5] }
    localEnd = { x: end.x - parentMatrix[4], y: end.y - parentMatrix[5] }
  }

  const localDelta = { x: localEnd.x - localStart.x, y: localEnd.y - localStart.y }
  const length = Math.hypot(localDelta.x, localDelta.y)
  const rotation =
    length > EPSILON
      ? normalizeDegrees(radiansToDegrees(Math.atan2(localDelta.y, localDelta.x)))
      : 0

  return {
    id: options.id,
    name: options.name,
    parentId: parent ? parent.id : null,
    length,
    color: options.color,
    transform: {
      x: localStart.x,
      y: localStart.y,
      rotation,
      scaleX: 1,
      scaleY: 1,
      shearX: 0,
      shearY: 0,
      opacity: 1
    }
  }
}
