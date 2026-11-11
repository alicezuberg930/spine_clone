import type { EditorKeyframe } from '../@types/animation'
import type { Transform } from '../@types/geometry'
import type { Bone } from '../@types/rig'

const TRANSFORM_PROPERTIES = [
  'x',
  'y',
  'rotation',
  'scaleX',
  'scaleY',
  'shearX',
  'shearY',
  'opacity'
] as const satisfies ReadonlyArray<keyof Transform>

type NumericTransformProperty = (typeof TRANSFORM_PROPERTIES)[number]

const numericValue = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

function interpolationProgress(
  interpolation: EditorKeyframe['interpolation'],
  progress: number
): number {
  if (interpolation === 'stepped') return 0
  if (interpolation === 'bezier') return progress * progress * (3 - 2 * progress)
  return progress
}

/** Evaluates one absolute numeric transform timeline at a whole or fractional frame. */
export function evaluateTransformProperty(
  keyframes: readonly EditorKeyframe[],
  targetId: string,
  property: NumericTransformProperty,
  frame: number,
  setupValue: number
): number {
  const keys = keyframes
    .filter(
      (keyframe) =>
        keyframe.targetId === targetId &&
        keyframe.property === property &&
        numericValue(keyframe.value) !== null
    )
    .sort((left, right) => left.frame - right.frame)

  if (keys.length === 0 || frame < keys[0].frame) return setupValue

  let previous = keys[0]
  for (let index = 1; index < keys.length; index += 1) {
    const next = keys[index]
    if (frame < next.frame) {
      const from = numericValue(previous.value) ?? setupValue
      if (previous.interpolation === 'stepped') return from
      const to = numericValue(next.value) ?? from
      const span = Math.max(1, next.frame - previous.frame)
      const progress = Math.min(1, Math.max(0, (frame - previous.frame) / span))
      const mixed = interpolationProgress(previous.interpolation, progress)
      return from + (to - from) * mixed
    }
    previous = next
  }

  return numericValue(previous.value) ?? setupValue
}

/** Applies the active animation's transform timelines without mutating the setup-pose bones. */
export function evaluateBoneTransforms(
  bones: readonly Bone[],
  keyframes: readonly EditorKeyframe[],
  frame: number
): Bone[] {
  if (keyframes.length === 0)
    return bones.map((bone) => ({
      ...bone,
      transform: { ...bone.transform }
    }))

  return bones.map((bone) => {
    const transform = { ...bone.transform }
    for (const property of TRANSFORM_PROPERTIES) {
      const setupValue =
        transform[property] ?? (property.startsWith('scale') || property === 'opacity' ? 1 : 0)
      transform[property] = evaluateTransformProperty(
        keyframes,
        bone.id,
        property,
        frame,
        setupValue
      )
    }
    return { ...bone, transform }
  })
}
