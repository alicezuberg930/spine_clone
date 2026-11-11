import type { Point } from '@/@types/geometry'
import type {
  ArtworkClipping,
  ArtworkMesh,
  ClipVertex,
  Matrix2D,
  MeshDeformValue,
  MeshTriangle,
  MeshVertex,
  WeightBrush
} from '@/@types/mesh'
import type { VertexWeight } from '@/@types/rig'
import type { Bone } from '@/@types/rig'
import type { Transform } from '@/@types/geometry'

const EPSILON = 1e-8

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value))

const finiteOr = (value: number, fallback = 0): number =>
  Number.isFinite(value) ? value : fallback

export function matrixFromTransform(transform: Transform): Matrix2D {
  const xAxis = ((transform.rotation + (transform.shearX ?? 0)) * Math.PI) / 180
  const yAxis = ((transform.rotation + 90 + (transform.shearY ?? 0)) * Math.PI) / 180
  return [
    Math.cos(xAxis) * transform.scaleX,
    Math.sin(xAxis) * transform.scaleX,
    Math.cos(yAxis) * transform.scaleY,
    Math.sin(yAxis) * transform.scaleY,
    transform.x,
    transform.y
  ]
}

function multiplyMatrices(left: Matrix2D, right: Matrix2D): Matrix2D {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5]
  ]
}

function resolveWorldMatrices(bones: readonly Bone[]): Map<string, Matrix2D> {
  const byId = new Map(bones.map((bone) => [bone.id, bone]))
  const matrices = new Map<string, Matrix2D>()
  const resolving = new Set<string>()

  const resolve = (bone: Bone): Matrix2D => {
    const cached = matrices.get(bone.id)
    if (cached) return cached
    const local = matrixFromTransform(bone.transform)
    if (resolving.has(bone.id)) return local
    resolving.add(bone.id)
    const parent = bone.parentId ? byId.get(bone.parentId) : undefined
    const world = parent ? multiplyMatrices(resolve(parent), local) : local
    resolving.delete(bone.id)
    matrices.set(bone.id, world)
    return world
  }

  bones.forEach(resolve)
  return matrices
}

function invertMatrix(matrix: Matrix2D): Matrix2D | null {
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

function transformPoint(matrix: Matrix2D, point: Point): Point {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5]
  }
}

/** Returns per-vertex offsets produced by the current bones relative to their captured bind pose. */
export function weightedMeshDeformation(
  mesh: ArtworkMesh,
  bones: Bone[],
  layerOrigin: Point = { x: 0, y: 0 }
): MeshDeformValue['offsets'] {
  if (!mesh.bindPose) return {}
  const worldMatrices = resolveWorldMatrices(bones)
  const deltas = new Map<string, Matrix2D>()
  Object.entries(mesh.bindPose).forEach(([boneId, bindMatrix]) => {
    const worldMatrix = worldMatrices.get(boneId)
    const inverseBind = invertMatrix(bindMatrix)
    if (!worldMatrix || !inverseBind) return
    deltas.set(boneId, multiplyMatrices(worldMatrix, inverseBind))
  })

  return Object.fromEntries(
    mesh.vertices.map((vertex) => {
      const documentPoint = {
        x: vertex.position.x + layerOrigin.x,
        y: vertex.position.y + layerOrigin.y
      }
      let x = documentPoint.x
      let y = documentPoint.y
      let totalWeight = 0
      let weightedX = 0
      let weightedY = 0
      vertex.weights.forEach((weight) => {
        const delta = deltas.get(weight.boneId)
        if (!delta || weight.value <= 0) return
        const point = transformPoint(delta, documentPoint)
        weightedX += point.x * weight.value
        weightedY += point.y * weight.value
        totalWeight += weight.value
      })
      if (totalWeight > EPSILON) {
        x = weightedX + documentPoint.x * Math.max(0, 1 - totalWeight)
        y = weightedY + documentPoint.y * Math.max(0, 1 - totalWeight)
      }
      return [vertex.id, { x: x - documentPoint.x, y: y - documentPoint.y }]
    })
  )
}

function geometryId(prefix: string): string {
  const suffix =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${suffix}`
}

export interface CreateGridMeshOptions {
  /** Horizontal cell count. A value of 2 creates 3 columns of vertices. */
  columns?: number
  /** Vertical cell count. A value of 2 creates 3 rows of vertices. */
  rows?: number
  idPrefix?: string
}

/** Creates a regular 3x3-vertex mesh by default. */
export function createGridMesh(
  width: number,
  height: number,
  options: CreateGridMeshOptions = {}
): ArtworkMesh {
  const columns = clamp(Math.round(options.columns ?? 2), 1, 32)
  const rows = clamp(Math.round(options.rows ?? 2), 1, 32)
  const idPrefix = options.idPrefix ?? geometryId('mesh')
  const safeWidth = Math.max(1, finiteOr(width, 1))
  const safeHeight = Math.max(1, finiteOr(height, 1))
  const vertices: MeshVertex[] = []
  const triangles: MeshTriangle[] = []

  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const position = {
        x: (column / columns) * safeWidth,
        y: (row / rows) * safeHeight
      }
      vertices.push({
        id: `${idPrefix}-v-${row}-${column}`,
        source: { ...position },
        position: { ...position },
        weights: []
      })
    }
  }

  const vertexId = (row: number, column: number): string => `${idPrefix}-v-${row}-${column}`

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const topLeft = vertexId(row, column)
      const topRight = vertexId(row, column + 1)
      const bottomLeft = vertexId(row + 1, column)
      const bottomRight = vertexId(row + 1, column + 1)

      triangles.push(
        {
          id: `${idPrefix}-t-${row}-${column}-a`,
          vertexIds: [topLeft, topRight, bottomRight]
        },
        {
          id: `${idPrefix}-t-${row}-${column}-b`,
          vertexIds: [topLeft, bottomRight, bottomLeft]
        }
      )
    }
  }

  return { vertices, triangles }
}

/** Creates a four-point clipping polygon inset from a layer's bounds. */
export function createDefaultClipping(
  width: number,
  height: number,
  insetRatio = 0.05
): ArtworkClipping {
  const safeWidth = Math.max(1, finiteOr(width, 1))
  const safeHeight = Math.max(1, finiteOr(height, 1))
  const ratio = clamp(finiteOr(insetRatio, 0.05), 0, 0.45)
  const insetX = safeWidth * ratio
  const insetY = safeHeight * ratio
  const id = geometryId('clip')

  return {
    id,
    enabled: true,
    inverted: false,
    vertices: [
      { id: `${id}-v-0`, x: insetX, y: insetY },
      { id: `${id}-v-1`, x: safeWidth - insetX, y: insetY },
      { id: `${id}-v-2`, x: safeWidth - insetX, y: safeHeight - insetY },
      { id: `${id}-v-3`, x: insetX, y: safeHeight - insetY }
    ]
  }
}

export function meshVertexMap(mesh: ArtworkMesh): Map<string, MeshVertex> {
  return new Map(mesh.vertices.map((vertex) => [vertex.id, vertex]))
}

export function deformedVertexPosition(
  vertex: MeshVertex,
  deformation?: MeshDeformValue['offsets'] | null
): Point {
  const offset = deformation?.[vertex.id]
  return {
    x: vertex.position.x + (offset?.x ?? 0),
    y: vertex.position.y + (offset?.y ?? 0)
  }
}

export interface ResolvedMeshTriangle {
  id: string
  source: [Point, Point, Point]
  destination: [Point, Point, Point]
}

export function resolveMeshTriangles(
  mesh: ArtworkMesh,
  deformation?: MeshDeformValue['offsets'] | null
): ResolvedMeshTriangle[] {
  const vertices = meshVertexMap(mesh)
  const resolved: ResolvedMeshTriangle[] = []

  for (const triangle of mesh.triangles) {
    const triangleVertices = triangle.vertexIds.map((id) => vertices.get(id))
    if (triangleVertices.some((vertex) => !vertex)) continue
    const [first, second, third] = triangleVertices as [MeshVertex, MeshVertex, MeshVertex]
    const source: [Point, Point, Point] = [first.source, second.source, third.source]
    const destination: [Point, Point, Point] = [
      deformedVertexPosition(first, deformation),
      deformedVertexPosition(second, deformation),
      deformedVertexPosition(third, deformation)
    ]
    if (Math.abs(triangleArea(source)) <= EPSILON) continue
    if (Math.abs(triangleArea(destination)) <= EPSILON) continue
    resolved.push({ id: triangle.id, source, destination })
  }

  return resolved
}

export function triangleArea([first, second, third]: [Point, Point, Point]): number {
  return (
    ((second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x)) / 2
  )
}

/** Returns the affine matrix that maps a source triangle onto a destination triangle. */
export function affineFromTriangles(
  [sourceA, sourceB, sourceC]: [Point, Point, Point],
  [destinationA, destinationB, destinationC]: [Point, Point, Point]
): Matrix2D | null {
  const determinant =
    sourceA.x * (sourceB.y - sourceC.y) +
    sourceB.x * (sourceC.y - sourceA.y) +
    sourceC.x * (sourceA.y - sourceB.y)

  if (Math.abs(determinant) <= EPSILON) return null

  const solve = (first: number, second: number, third: number): [number, number, number] => [
    (first * (sourceB.y - sourceC.y) +
      second * (sourceC.y - sourceA.y) +
      third * (sourceA.y - sourceB.y)) /
      determinant,
    (first * (sourceC.x - sourceB.x) +
      second * (sourceA.x - sourceC.x) +
      third * (sourceB.x - sourceA.x)) /
      determinant,
    (first * (sourceB.x * sourceC.y - sourceC.x * sourceB.y) +
      second * (sourceC.x * sourceA.y - sourceA.x * sourceC.y) +
      third * (sourceA.x * sourceB.y - sourceB.x * sourceA.y)) /
      determinant
  ]

  const [a, c, e] = solve(destinationA.x, destinationB.x, destinationC.x)
  const [b, d, f] = solve(destinationA.y, destinationB.y, destinationC.y)
  return [a, b, c, d, e, f]
}

export function svgMatrix(matrix: Matrix2D): string {
  return `matrix(${matrix.map((value) => Number(value.toFixed(8))).join(' ')})`
}

export function interpolateDeformation(
  previous: MeshDeformValue['offsets'] | undefined,
  next: MeshDeformValue['offsets'] | undefined,
  progress: number
): MeshDeformValue['offsets'] {
  const amount = clamp(finiteOr(progress), 0, 1)
  const ids = new Set([...Object.keys(previous ?? {}), ...Object.keys(next ?? {})])
  const result: MeshDeformValue['offsets'] = {}

  ids.forEach((id) => {
    const from = previous?.[id] ?? { x: 0, y: 0 }
    const to = next?.[id] ?? { x: 0, y: 0 }
    result[id] = {
      x: from.x + (to.x - from.x) * amount,
      y: from.y + (to.y - from.y) * amount
    }
  })

  return result
}

export function normalizeVertexWeights(weights: VertexWeight[], maxInfluences = 4): VertexWeight[] {
  const totals = new Map<string, number>()
  weights.forEach((weight) => {
    if (!weight.boneId || !Number.isFinite(weight.value) || weight.value <= 0) return
    totals.set(weight.boneId, (totals.get(weight.boneId) ?? 0) + weight.value)
  })
  const normalized = [...totals.entries()]
    .map(([boneId, value]) => ({ boneId, value }))
    .sort((left, right) => right.value - left.value)
    .slice(0, Math.max(1, Math.round(maxInfluences)))
  const total = normalized.reduce((sum, weight) => sum + weight.value, 0)
  if (total <= EPSILON) return []
  return normalized.map((weight) => ({ ...weight, value: weight.value / total }))
}

export function vertexWeightForBone(vertex: MeshVertex, boneId: string | null): number {
  if (!boneId) return 0
  return vertex.weights.find((weight) => weight.boneId === boneId)?.value ?? 0
}

function setBoneWeight(weights: VertexWeight[], boneId: string, nextValue: number): VertexWeight[] {
  const normalized = normalizeVertexWeights(weights)
  const desired = clamp(nextValue, 0, 1)
  const others = normalized.filter((weight) => weight.boneId !== boneId).slice(0, 3)
  const otherTotal = others.reduce((sum, weight) => sum + weight.value, 0)

  if (others.length === 0 || otherTotal <= EPSILON) {
    return desired <= EPSILON ? [] : [{ boneId, value: 1 }]
  }

  const result: VertexWeight[] = []
  if (desired > EPSILON) result.push({ boneId, value: desired })
  const remaining = 1 - desired
  others.forEach((weight) => {
    const value = (weight.value / otherTotal) * remaining
    if (value > EPSILON) result.push({ boneId: weight.boneId, value })
  })
  return normalizeVertexWeights(result)
}

export interface WeightPaintResult {
  mesh: ArtworkMesh
  changedVertexIds: string[]
}

/** Applies a radial weight brush and returns an immutable mesh update. */
export function paintMeshWeights(
  mesh: ArtworkMesh,
  point: Point,
  brush: WeightBrush,
  deformation?: MeshDeformValue['offsets'] | null
): WeightPaintResult {
  const boneId = brush.boneId
  if (!boneId || brush.radius <= 0 || brush.strength <= 0) {
    return { mesh, changedVertexIds: [] }
  }

  const radius = Math.max(EPSILON, finiteOr(brush.radius, 1))
  const strength = clamp(finiteOr(brush.strength), 0, 1)
  const changedVertexIds: string[] = []
  const vertices = mesh.vertices.map((vertex) => {
    const position = deformedVertexPosition(vertex, deformation)
    const distance = Math.hypot(position.x - point.x, position.y - point.y)
    if (distance > radius) return vertex

    const falloff = 1 - distance / radius
    const current = vertexWeightForBone(vertex, boneId)
    const next =
      brush.mode === 'add'
        ? current + (1 - current) * strength * falloff
        : brush.mode === 'subtract'
          ? current * (1 - strength * falloff)
          : current + (strength - current) * falloff

    changedVertexIds.push(vertex.id)
    return { ...vertex, weights: setBoneWeight(vertex.weights, boneId, next) }
  })

  return changedVertexIds.length === 0
    ? { mesh, changedVertexIds }
    : { mesh: { ...mesh, vertices }, changedVertexIds }
}

export function closestClippingSegment(
  vertices: ClipVertex[],
  point: Point
): { afterVertexId: string; distance: number } | null {
  if (vertices.length < 2) return null
  let closest: { afterVertexId: string; distance: number } | null = null

  vertices.forEach((start, index) => {
    const end = vertices[(index + 1) % vertices.length]
    const dx = end.x - start.x
    const dy = end.y - start.y
    const lengthSquared = dx * dx + dy * dy
    const amount =
      lengthSquared <= EPSILON
        ? 0
        : clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)
    const projected = { x: start.x + dx * amount, y: start.y + dy * amount }
    const distance = Math.hypot(projected.x - point.x, projected.y - point.y)
    if (!closest || distance < closest.distance) closest = { afterVertexId: start.id, distance }
  })

  return closest
}
