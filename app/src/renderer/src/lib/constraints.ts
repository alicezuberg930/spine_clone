import type { Point } from '@/@types/geometry'

const EPSILON = 1e-8

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value))

const degrees = (radians: number): number => (radians * 180) / Math.PI

const radians = (angle: number): number => (angle * Math.PI) / 180

const distanceBetween = (first: Point, second: Point): number =>
  Math.hypot(second.x - first.x, second.y - first.y)

const pointAlongAngle = (origin: Point, length: number, angle: number): Point => ({
  x: origin.x + Math.cos(angle) * length,
  y: origin.y + Math.sin(angle) * length
})

export function normalizeAngleDegrees(angle: number): number {
  return ((((angle + 180) % 360) + 360) % 360) - 180
}

export function lerpAngleDegrees(from: number, to: number, mix: number): number {
  return normalizeAngleDegrees(from + normalizeAngleDegrees(to - from) * clamp(mix, 0, 1))
}

export interface TwoBoneIkInput {
  root: Point
  target: Point
  upperLength: number
  lowerLength: number
  bendDirection?: 1 | -1
}

export interface TwoBoneIkSolution {
  rootRotation: number
  jointRotation: number
  endRotation: number
  joint: Point
  end: Point
  clampedTarget: Point
  targetDistance: number
  clampedDistance: number
  reachable: boolean
}

export function solveTwoBoneIk({
  root,
  target,
  upperLength,
  lowerLength,
  bendDirection = 1
}: TwoBoneIkInput): TwoBoneIkSolution {
  if (!Number.isFinite(upperLength) || upperLength <= 0) {
    throw new RangeError('The upper IK bone length must be greater than zero.')
  }
  if (!Number.isFinite(lowerLength) || lowerLength <= 0) {
    throw new RangeError('The lower IK bone length must be greater than zero.')
  }

  const targetDistance = distanceBetween(root, target)
  const minimumReach = Math.abs(upperLength - lowerLength)
  const maximumReach = upperLength + lowerLength
  const clampedDistance = clamp(targetDistance, minimumReach, maximumReach)
  const calculationDistance = Math.max(EPSILON, clampedDistance)
  const targetAngle =
    targetDistance <= EPSILON ? 0 : Math.atan2(target.y - root.y, target.x - root.x)
  const bend = bendDirection < 0 ? -1 : 1
  const jointCosine = clamp(
    (calculationDistance ** 2 - upperLength ** 2 - lowerLength ** 2) /
      (2 * upperLength * lowerLength),
    -1,
    1
  )
  const jointAngle = bend * Math.acos(jointCosine)
  const rootAngle =
    targetAngle -
    Math.atan2(lowerLength * Math.sin(jointAngle), upperLength + lowerLength * Math.cos(jointAngle))
  const endAngle = rootAngle + jointAngle
  const joint = pointAlongAngle(root, upperLength, rootAngle)
  const end = pointAlongAngle(joint, lowerLength, endAngle)
  const clampedTarget = pointAlongAngle(root, clampedDistance, targetAngle)

  return {
    rootRotation: normalizeAngleDegrees(degrees(rootAngle)),
    jointRotation: degrees(jointAngle),
    endRotation: normalizeAngleDegrees(degrees(endAngle)),
    joint,
    end,
    clampedTarget,
    targetDistance,
    clampedDistance,
    reachable: targetDistance >= minimumReach - EPSILON && targetDistance <= maximumReach + EPSILON
  }
}

export interface CubicBezierCurve {
  p0: Point
  p1: Point
  p2: Point
  p3: Point
}

export interface CubicBezierArcSample {
  t: number
  length: number
}

export interface CubicBezierArcLengthTable {
  samples: CubicBezierArcSample[]
  totalLength: number
}

export interface CubicBezierPathSample {
  t: number
  distance: number
  point: Point
  tangent: Point
  angleDegrees: number
}

export function cubicBezierFromVertices(vertices: readonly Point[]): CubicBezierCurve {
  if (vertices.length < 4) throw new Error('A cubic Bezier path requires four vertices.')
  return { p0: vertices[0], p1: vertices[1], p2: vertices[2], p3: vertices[3] }
}

export function cubicBezierPoint(curve: CubicBezierCurve, t: number): Point {
  const progress = clamp(t, 0, 1)
  const inverse = 1 - progress
  const inverseSquared = inverse * inverse
  const progressSquared = progress * progress

  return {
    x:
      inverseSquared * inverse * curve.p0.x +
      3 * inverseSquared * progress * curve.p1.x +
      3 * inverse * progressSquared * curve.p2.x +
      progressSquared * progress * curve.p3.x,
    y:
      inverseSquared * inverse * curve.p0.y +
      3 * inverseSquared * progress * curve.p1.y +
      3 * inverse * progressSquared * curve.p2.y +
      progressSquared * progress * curve.p3.y
  }
}

export function cubicBezierDerivative(curve: CubicBezierCurve, t: number): Point {
  const progress = clamp(t, 0, 1)
  const inverse = 1 - progress

  return {
    x:
      3 * inverse * inverse * (curve.p1.x - curve.p0.x) +
      6 * inverse * progress * (curve.p2.x - curve.p1.x) +
      3 * progress * progress * (curve.p3.x - curve.p2.x),
    y:
      3 * inverse * inverse * (curve.p1.y - curve.p0.y) +
      6 * inverse * progress * (curve.p2.y - curve.p1.y) +
      3 * progress * progress * (curve.p3.y - curve.p2.y)
  }
}

export function cubicBezierTangent(curve: CubicBezierCurve, t: number): Point {
  let derivative = cubicBezierDerivative(curve, t)
  let magnitude = Math.hypot(derivative.x, derivative.y)

  if (magnitude <= EPSILON) {
    const before = cubicBezierPoint(curve, Math.max(0, t - 0.001))
    const after = cubicBezierPoint(curve, Math.min(1, t + 0.001))
    derivative = { x: after.x - before.x, y: after.y - before.y }
    magnitude = Math.hypot(derivative.x, derivative.y)
  }

  return magnitude <= EPSILON
    ? { x: 1, y: 0 }
    : { x: derivative.x / magnitude, y: derivative.y / magnitude }
}

export function cubicBezierAngleDegrees(curve: CubicBezierCurve, t: number): number {
  const tangent = cubicBezierTangent(curve, t)
  return normalizeAngleDegrees(degrees(Math.atan2(tangent.y, tangent.x)))
}

export function buildCubicBezierArcLengthTable(
  curve: CubicBezierCurve,
  sampleCount = 80
): CubicBezierArcLengthTable {
  const count = Math.max(4, Math.min(4096, Math.round(sampleCount)))
  const samples: CubicBezierArcSample[] = [{ t: 0, length: 0 }]
  let previous = curve.p0
  let totalLength = 0

  for (let index = 1; index <= count; index += 1) {
    const t = index / count
    const point = cubicBezierPoint(curve, t)
    totalLength += distanceBetween(previous, point)
    samples.push({ t, length: totalLength })
    previous = point
  }

  return { samples, totalLength }
}

export function cubicBezierTAtDistance(table: CubicBezierArcLengthTable, distance: number): number {
  if (table.samples.length === 0 || table.totalLength <= EPSILON) return 0
  const target = clamp(distance, 0, table.totalLength)
  if (target <= 0) return 0
  if (target >= table.totalLength) return 1

  let low = 0
  let high = table.samples.length - 1
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2)
    if (table.samples[middle].length < target) low = middle
    else high = middle
  }

  const start = table.samples[low]
  const end = table.samples[high]
  const segmentLength = end.length - start.length
  const mix = segmentLength <= EPSILON ? 0 : (target - start.length) / segmentLength
  return start.t + (end.t - start.t) * mix
}

export function sampleCubicBezierAtDistance(
  curve: CubicBezierCurve,
  distance: number,
  table = buildCubicBezierArcLengthTable(curve)
): CubicBezierPathSample {
  const clampedDistance = clamp(distance, 0, table.totalLength)
  const t = cubicBezierTAtDistance(table, clampedDistance)
  const tangent = cubicBezierTangent(curve, t)

  return {
    t,
    distance: clampedDistance,
    point: cubicBezierPoint(curve, t),
    tangent,
    angleDegrees: normalizeAngleDegrees(degrees(Math.atan2(tangent.y, tangent.x)))
  }
}

export function sampleCubicBezierAtProgress(
  curve: CubicBezierCurve,
  progress: number,
  table = buildCubicBezierArcLengthTable(curve)
): CubicBezierPathSample {
  return sampleCubicBezierAtDistance(curve, clamp(progress, 0, 1) * table.totalLength, table)
}

export function rotatePoint(point: Point, angleDegrees: number): Point {
  const angle = radians(angleDegrees)
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine
  }
}
