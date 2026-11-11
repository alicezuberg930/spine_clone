import type {
  Bone,
  BoneDeletionMode,
  EditorKeyframe,
  EditorProject,
  EditorSelection,
  EditorState,
  Matrix2D,
  Transform,
  VertexWeight
} from '@/@types'

const EPSILON = 1e-8

export interface BoneDeletionSummary {
  project: EditorProject
  deletedBoneIds: Set<string>
  deletedConstraintIds: Set<string>
  removedTrackIds: Set<string>
  fallbackBoneId: string | null
  reparentedBoneIds: Set<string>
}

const normalizeDegrees = (degrees: number): number => {
  const normalized = ((((degrees + 180) % 360) + 360) % 360) - 180
  return Object.is(normalized, -0) ? 0 : normalized
}

function matrixFromBoneTransform(transform: Transform): Matrix2D {
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

function multiplyAffineMatrices(left: Matrix2D, right: Matrix2D): Matrix2D {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5]
  ]
}

function invertAffineMatrix(matrix: Matrix2D): Matrix2D | null {
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

function transformFromMatrix(matrix: Matrix2D, template: Transform): Transform {
  const xMagnitude = Math.hypot(matrix[0], matrix[1])
  const yMagnitude = Math.hypot(matrix[2], matrix[3])
  const scaleXSign = template.scaleX < 0 ? -1 : 1
  const scaleYSign = template.scaleY < 0 ? -1 : 1
  const scaleX = xMagnitude <= EPSILON ? template.scaleX : xMagnitude * scaleXSign
  const scaleY = yMagnitude <= EPSILON ? template.scaleY : yMagnitude * scaleYSign
  const xAxis =
    xMagnitude <= EPSILON
      ? template.rotation + (template.shearX ?? 0)
      : (Math.atan2(matrix[1] / scaleXSign, matrix[0] / scaleXSign) * 180) / Math.PI
  const yAxis =
    yMagnitude <= EPSILON
      ? template.rotation + 90 + (template.shearY ?? 0)
      : (Math.atan2(matrix[3] / scaleYSign, matrix[2] / scaleYSign) * 180) / Math.PI
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

function resolveBoneWorldMatrices(bones: readonly Bone[]): Map<string, Matrix2D> {
  const byId = new Map(bones.map((bone) => [bone.id, bone]))
  const matrices = new Map<string, Matrix2D>()
  const resolving = new Set<string>()

  const resolve = (bone: Bone): Matrix2D => {
    const cached = matrices.get(bone.id)
    if (cached) return cached
    const local = matrixFromBoneTransform(bone.transform)
    if (resolving.has(bone.id)) return local
    resolving.add(bone.id)
    const parent = bone.parentId ? byId.get(bone.parentId) : undefined
    const world = parent ? multiplyAffineMatrices(resolve(parent), local) : local
    resolving.delete(bone.id)
    matrices.set(bone.id, world)
    return world
  }

  bones.forEach(resolve)
  return matrices
}

function localTransformForWorldMatrix(
  transform: Transform,
  worldMatrix: Matrix2D,
  parentMatrix: Matrix2D | undefined
): Transform {
  if (!parentMatrix) return transformFromMatrix(worldMatrix, transform)
  const inverseParent = invertAffineMatrix(parentMatrix)
  if (!inverseParent) return { ...transform }
  return transformFromMatrix(multiplyAffineMatrices(inverseParent, worldMatrix), transform)
}

function collectBranchIds(bones: readonly Bone[], targetId: string): Set<string> {
  const result = new Set<string>([targetId])
  let changed = true
  while (changed) {
    changed = false
    for (const bone of bones) {
      if (bone.parentId && result.has(bone.parentId) && !result.has(bone.id)) {
        result.add(bone.id)
        changed = true
      }
    }
  }
  return result
}

function normalizeWeights(weights: readonly VertexWeight[]): VertexWeight[] {
  const totals = new Map<string, number>()
  weights.forEach((weight) => {
    if (!weight.boneId || !Number.isFinite(weight.value) || weight.value <= 0) return
    totals.set(weight.boneId, (totals.get(weight.boneId) ?? 0) + weight.value)
  })
  const values = [...totals].map(([boneId, value]) => ({ boneId, value }))
  const total = values.reduce((sum, weight) => sum + weight.value, 0)
  if (total <= EPSILON) return []
  return values.map((weight) => ({ ...weight, value: weight.value / total }))
}

function cleanWeights(
  weights: readonly VertexWeight[],
  deletedBoneIds: ReadonlySet<string>,
  fallbackBoneId: string | null
): VertexWeight[] {
  const lostInfluence = weights.some((weight) => deletedBoneIds.has(weight.boneId))
  const surviving = normalizeWeights(weights.filter((weight) => !deletedBoneIds.has(weight.boneId)))
  if (surviving.length > 0 || !lostInfluence || !fallbackBoneId) return surviving
  return [{ boneId: fallbackBoneId, value: 1 }]
}

function cleanKeyframes(
  keyframes: readonly EditorKeyframe[],
  removedTargetIds: ReadonlySet<string>,
  removedTrackIds: ReadonlySet<string>
): EditorKeyframe[] {
  return keyframes.filter(
    (keyframe) => !removedTargetIds.has(keyframe.targetId) && !removedTrackIds.has(keyframe.trackId)
  )
}

/**
 * Deletes a non-root bone and repairs every project-owned reference to the removed bones.
 * The returned project is the original object when the target is missing or protected.
 */
export function deleteBoneFromProject(
  project: EditorProject,
  targetId: string,
  mode: BoneDeletionMode
): BoneDeletionSummary {
  const target = project.bones.find((bone) => bone.id === targetId)
  if (!target || target.parentId === null || project.bones.length <= 1) {
    return {
      project,
      deletedBoneIds: new Set(),
      deletedConstraintIds: new Set(),
      removedTrackIds: new Set(),
      fallbackBoneId: null,
      reparentedBoneIds: new Set()
    }
  }

  const deletedBoneIds =
    mode === 'branch' ? collectBranchIds(project.bones, target.id) : new Set([target.id])
  const worldMatrices = resolveBoneWorldMatrices(project.bones)
  const survivingIds = new Set(
    project.bones.filter((bone) => !deletedBoneIds.has(bone.id)).map((bone) => bone.id)
  )
  const reparentParentId =
    target.parentId && survivingIds.has(target.parentId) ? target.parentId : null
  const reparentedBoneIds = new Set<string>()
  const parentMatrix = reparentParentId ? worldMatrices.get(reparentParentId) : undefined

  const bones = project.bones
    .filter((bone) => !deletedBoneIds.has(bone.id))
    .map((bone) => {
      if (mode !== 'reparent' || bone.parentId !== target.id) return bone
      reparentedBoneIds.add(bone.id)
      const worldMatrix = worldMatrices.get(bone.id)
      return {
        ...bone,
        parentId: reparentParentId,
        transform: worldMatrix
          ? localTransformForWorldMatrix(bone.transform, worldMatrix, parentMatrix)
          : { ...bone.transform }
      }
    })

  const fallbackBoneId =
    reparentParentId ?? bones.find((bone) => bone.parentId === null)?.id ?? bones[0]?.id ?? null
  const deletedConstraintIds = new Set(
    project.constraints
      .filter(
        (constraint) =>
          constraint.boneIds.some((boneId) => deletedBoneIds.has(boneId)) ||
          (constraint.targetId ? deletedBoneIds.has(constraint.targetId) : false)
      )
      .map((constraint) => constraint.id)
  )
  const constraints = project.constraints.filter(
    (constraint) => !deletedConstraintIds.has(constraint.id)
  )
  const removedTargetIds = new Set([...deletedBoneIds, ...deletedConstraintIds])
  const removedTrackIds = new Set(
    project.animations
      .flatMap((animation) => animation.tracks)
      .filter((track) => removedTargetIds.has(track.targetId))
      .map((track) => track.id)
  )
  const animations = project.animations.map((animation) => {
    const tracks = animation.tracks.filter((track) => !removedTrackIds.has(track.id))
    return {
      ...animation,
      tracks,
      keyframes: cleanKeyframes(animation.keyframes, removedTargetIds, removedTrackIds)
    }
  })

  const boneById = new Map(bones.map((bone) => [bone.id, bone]))
  const survivingWorldMatrices = resolveBoneWorldMatrices(bones)
  const artwork = project.artwork
    ? {
        ...project.artwork,
        layers: project.artwork.layers.map((layer) => {
          const cleanedLayer =
            layer.boneId && deletedBoneIds.has(layer.boneId)
              ? (() => {
                  const unboundLayer = { ...layer }
                  delete unboundLayer.boneId
                  delete unboundLayer.boneBindPose
                  return unboundLayer
                })()
              : layer
          if (!cleanedLayer.mesh) return cleanedLayer
          const vertices = cleanedLayer.mesh.vertices.map((vertex) => ({
            ...vertex,
            weights: cleanWeights(vertex.weights, deletedBoneIds, fallbackBoneId)
          }))
          if (!cleanedLayer.mesh.bindPose)
            return { ...cleanedLayer, mesh: { ...cleanedLayer.mesh, vertices } }

          const bindPose: Record<string, Matrix2D> = Object.fromEntries(
            Object.entries(cleanedLayer.mesh.bindPose).filter(
              ([boneId]) => !deletedBoneIds.has(boneId)
            )
          )
          const referencedBoneIds = new Set(
            vertices.flatMap((vertex) => vertex.weights.map((weight) => weight.boneId))
          )
          referencedBoneIds.forEach((boneId) => {
            const bone = boneById.get(boneId)
            if (bone && (!(boneId in bindPose) || reparentedBoneIds.has(boneId))) {
              bindPose[boneId] =
                survivingWorldMatrices.get(boneId) ?? matrixFromBoneTransform(bone.transform)
            }
          })
          return { ...cleanedLayer, mesh: { ...cleanedLayer.mesh, vertices, bindPose } }
        })
      }
    : null

  return {
    project: {
      ...project,
      bones,
      slots: project.slots.map((slot) =>
        deletedBoneIds.has(slot.boneId) && fallbackBoneId
          ? { ...slot, boneId: fallbackBoneId }
          : slot
      ),
      attachments: project.attachments.map((attachment) =>
        attachment.weights
          ? {
              ...attachment,
              weights: Object.fromEntries(
                Object.entries(attachment.weights).map(([index, weights]) => [
                  index,
                  cleanWeights(weights, deletedBoneIds, fallbackBoneId)
                ])
              )
            }
          : attachment
      ),
      constraints,
      animations,
      artwork,
      updatedAt: new Date().toISOString()
    },
    deletedBoneIds,
    deletedConstraintIds,
    removedTrackIds,
    fallbackBoneId,
    reparentedBoneIds
  }
}

const selectionWasRemoved = (
  selection: EditorSelection | null,
  deletedBoneIds: ReadonlySet<string>,
  deletedConstraintIds: ReadonlySet<string>
): boolean =>
  Boolean(
    selection &&
    ((selection.kind === 'bone' && deletedBoneIds.has(selection.id)) ||
      (selection.kind === 'constraint' && deletedConstraintIds.has(selection.id)))
  )

/** Deletes a bone and repairs editor-owned references such as selection and active keys. */
export function deleteBoneFromEditorState(
  state: EditorState,
  targetId: string,
  mode: BoneDeletionMode
): EditorState {
  const summary = deleteBoneFromProject(state.project, targetId, mode)
  if (summary.project === state.project) return state

  const removedTargetIds = new Set([...summary.deletedBoneIds, ...summary.deletedConstraintIds])
  let selections = state.selections.filter(
    (selection) =>
      !(
        (selection.kind === 'bone' && summary.deletedBoneIds.has(selection.id)) ||
        (selection.kind === 'constraint' && summary.deletedConstraintIds.has(selection.id))
      )
  )
  if (
    selections.length === 0 &&
    selectionWasRemoved(state.selection, summary.deletedBoneIds, summary.deletedConstraintIds) &&
    summary.fallbackBoneId
  ) {
    selections = [{ kind: 'bone', id: summary.fallbackBoneId }]
  }
  const selection = selections[selections.length - 1] ?? null
  const selectedBone =
    selection?.kind === 'bone'
      ? summary.project.bones.find((bone) => bone.id === selection.id)
      : undefined

  return {
    ...state,
    project: summary.project,
    selection,
    selections,
    transform: selectedBone ? { ...selectedBone.transform } : state.transform,
    weightBrush: summary.deletedBoneIds.has(state.weightBrush.boneId ?? '')
      ? { ...state.weightBrush, boneId: summary.fallbackBoneId }
      : state.weightBrush,
    keyframes: cleanKeyframes(state.keyframes, removedTargetIds, summary.removedTrackIds)
  }
}
