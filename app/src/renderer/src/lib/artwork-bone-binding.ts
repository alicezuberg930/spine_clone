import type { ArtworkLayer, Matrix2D } from '@/@types'

const EPSILON = 1e-8

const multiplyMatrices = (left: Matrix2D, right: Matrix2D): Matrix2D => [
  left[0] * right[0] + left[2] * right[1],
  left[1] * right[0] + left[3] * right[1],
  left[0] * right[2] + left[2] * right[3],
  left[1] * right[2] + left[3] * right[3],
  left[0] * right[4] + left[2] * right[5] + left[4],
  left[1] * right[4] + left[3] * right[5] + left[5]
]

const invertMatrix = (matrix: Matrix2D): Matrix2D | null => {
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

const translationMatrix = (x: number, y: number): Matrix2D => [1, 0, 0, 1, x, y]

/**
 * Resolves the layer-local to artwork-document matrix for a rigid bone binding.
 * The captured bind pose makes the binding nondestructive: at bind time the
 * matrix is exactly the layer's original translation.
 */
export function artworkLayerMatrix(
  layer: Pick<ArtworkLayer, 'x' | 'y' | 'boneId' | 'boneBindPose'>,
  currentBoneWorld?: Matrix2D | null
): Matrix2D {
  const placement = translationMatrix(layer.x, layer.y)
  if (!layer.boneId || !layer.boneBindPose || !currentBoneWorld) return placement

  const inverseBind = invertMatrix(layer.boneBindPose)
  if (!inverseBind) return placement

  return multiplyMatrices(multiplyMatrices(currentBoneWorld, inverseBind), placement)
}
