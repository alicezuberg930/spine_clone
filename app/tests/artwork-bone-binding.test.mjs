import assert from 'node:assert/strict'
import test from 'node:test'

import { artworkLayerMatrix } from '../src/renderer/src/lib/artwork-bone-binding.ts'
import {
  invertAffineMatrix,
  matrixFromBoneTransform,
  multiplyAffineMatrices,
  transformPointByMatrix
} from '../src/renderer/src/lib/skeleton-geometry.ts'

const layer = (overrides = {}) => ({
  x: 120,
  y: 80,
  boneId: 'arm',
  boneBindPose: matrixFromBoneTransform({
    x: 40,
    y: 25,
    rotation: 30,
    scaleX: 1,
    scaleY: 1,
    shearX: 0,
    shearY: 0,
    opacity: 1
  }),
  ...overrides
})

const assertPointAlmostEqual = (actual, expected, epsilon = 1e-8) => {
  assert.ok(Math.abs(actual.x - expected.x) <= epsilon, `${actual.x} != ${expected.x}`)
  assert.ok(Math.abs(actual.y - expected.y) <= epsilon, `${actual.y} != ${expected.y}`)
}

test('binding is visually neutral at the captured pose', () => {
  const bound = layer()
  const matrix = artworkLayerMatrix(bound, bound.boneBindPose)

  assertPointAlmostEqual(transformPointByMatrix(matrix, { x: 0, y: 0 }), {
    x: bound.x,
    y: bound.y
  })
  assertPointAlmostEqual(transformPointByMatrix(matrix, { x: 20, y: 10 }), {
    x: bound.x + 20,
    y: bound.y + 10
  })
})

test('a rigid layer inherits the full current world affine transform', () => {
  const bound = layer()
  const parent = matrixFromBoneTransform({
    x: 30,
    y: -12,
    rotation: -20,
    scaleX: 1.2,
    scaleY: 0.75,
    shearX: 8,
    shearY: -11,
    opacity: 1
  })
  const local = matrixFromBoneTransform({
    x: 40,
    y: 25,
    rotation: 52,
    scaleX: 1.4,
    scaleY: 0.8,
    shearX: 6,
    shearY: 13,
    opacity: 1
  })
  const currentWorld = multiplyAffineMatrices(parent, local)
  const matrix = artworkLayerMatrix(bound, currentWorld)

  // Expected document-space motion is currentWorld * inverse(bindWorld),
  // evaluated here through two known points on the layer.
  const bindOriginInBone = { x: 120, y: 80 }
  const bindCornerInBone = { x: 145, y: 95 }
  const inverseBind = invertAffineMatrix(bound.boneBindPose)
  assert.ok(inverseBind)
  const expectedOriginLocal = transformPointByMatrix(inverseBind, bindOriginInBone)
  const expectedCornerLocal = transformPointByMatrix(inverseBind, bindCornerInBone)
  assertPointAlmostEqual(
    transformPointByMatrix(matrix, { x: 0, y: 0 }),
    transformPointByMatrix(currentWorld, expectedOriginLocal)
  )
  assertPointAlmostEqual(
    transformPointByMatrix(matrix, { x: 25, y: 15 }),
    transformPointByMatrix(currentWorld, expectedCornerLocal)
  )
})

test('unbound or invalid bindings render at the original layer placement', () => {
  assert.deepEqual(artworkLayerMatrix({ x: 9, y: 14 }), [1, 0, 0, 1, 9, 14])
  assert.deepEqual(
    artworkLayerMatrix(layer({ boneBindPose: [0, 0, 0, 0, 10, 10] }), [1, 0, 0, 1, 50, 60]),
    [1, 0, 0, 1, 120, 80]
  )
})
