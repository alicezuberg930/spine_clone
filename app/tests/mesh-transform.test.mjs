import assert from 'node:assert/strict'
import test from 'node:test'

import {
  matrixFromTransform,
  weightedMeshDeformation
} from '../src/renderer/src/lib/mesh-geometry.ts'

const transform = (overrides = {}) => ({
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  shearX: 0,
  shearY: 0,
  opacity: 1,
  ...overrides
})

test('mesh matrices use Spine-style independent shear axes', () => {
  const matrix = matrixFromTransform(transform({ x: 4, y: 6, scaleX: 2, scaleY: 3, shearY: 45 }))
  const diagonal = Math.sqrt(0.5) * 3

  assert.ok(Math.abs(matrix[0] - 2) < 1e-9)
  assert.ok(Math.abs(matrix[1]) < 1e-9)
  assert.ok(Math.abs(matrix[2] + diagonal) < 1e-9)
  assert.ok(Math.abs(matrix[3] - diagonal) < 1e-9)
  assert.deepEqual(matrix.slice(4), [4, 6])
})

test('weighted mesh deformation responds to bone shear', () => {
  const mesh = {
    vertices: [
      {
        id: 'vertex',
        source: { x: 0, y: 10 },
        position: { x: 0, y: 10 },
        weights: [{ boneId: 'bone', value: 1 }]
      }
    ],
    triangles: [],
    bindPose: { bone: [1, 0, 0, 1, 0, 0] }
  }
  const offsets = weightedMeshDeformation(mesh, [
    {
      id: 'bone',
      name: 'bone',
      parentId: null,
      length: 10,
      color: '#fff',
      transform: transform({ shearY: 45 })
    }
  ])
  const diagonal = Math.sqrt(0.5) * 10

  assert.ok(Math.abs(offsets.vertex.x + diagonal) < 1e-9)
  assert.ok(Math.abs(offsets.vertex.y - (diagonal - 10)) < 1e-9)
})

test('weighted deformation uses hierarchical world matrices and the layer document origin', () => {
  const mesh = {
    vertices: [
      {
        id: 'vertex',
        source: { x: 0, y: 0 },
        position: { x: 0, y: 0 },
        weights: [{ boneId: 'child', value: 1 }]
      }
    ],
    triangles: [],
    bindPose: { child: [1, 0, 0, 1, 0, 0] }
  }
  const offsets = weightedMeshDeformation(
    mesh,
    [
      {
        id: 'root',
        name: 'root',
        parentId: null,
        length: 10,
        color: '#fff',
        transform: transform({ rotation: 90 })
      },
      {
        id: 'child',
        name: 'child',
        parentId: 'root',
        length: 10,
        color: '#fff',
        transform: transform()
      }
    ],
    { x: 10, y: 0 }
  )

  assert.ok(Math.abs(offsets.vertex.x + 10) < 1e-9)
  assert.ok(Math.abs(offsets.vertex.y - 10) < 1e-9)
})
