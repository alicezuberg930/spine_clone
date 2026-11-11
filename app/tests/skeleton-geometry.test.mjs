import assert from 'node:assert/strict'
import test from 'node:test'

import {
  artworkContentBounds,
  createBoneFromWorldSegment,
  fitBonesToBounds,
  fitBoneSegmentsToBounds,
  matrixFromBoneTransform,
  multiplyAffineMatrices,
  resolveBoneWorldMatrices,
  resolveBoneSegments
} from '../src/renderer/src/lib/skeleton-geometry.ts'

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

const assertPointAlmostEqual = (actual, expected, epsilon = 1e-9) => {
  assert.ok(
    Math.abs(actual.x - expected.x) <= epsilon,
    `expected x=${expected.x}, received x=${actual.x}`
  )
  assert.ok(
    Math.abs(actual.y - expected.y) <= epsilon,
    `expected y=${expected.y}, received y=${actual.y}`
  )
}

test('resolves parented bone positions and rotations in world space', () => {
  const segments = resolveBoneSegments([
    {
      id: 'root',
      name: 'root',
      parentId: null,
      length: 10,
      color: '#fff',
      transform: transform({ x: 5, y: 7, rotation: 90 })
    },
    {
      id: 'child',
      name: 'child',
      parentId: 'root',
      length: 4,
      color: '#fff',
      transform: transform({ x: 10, rotation: -90 })
    }
  ])

  assert.deepEqual(segments[0].start, { x: 5, y: 7 })
  assert.ok(Math.abs(segments[0].end.x - 5) < 1e-9)
  assert.ok(Math.abs(segments[0].end.y - 17) < 1e-9)
  assert.ok(Math.abs(segments[1].start.x - 5) < 1e-9)
  assert.ok(Math.abs(segments[1].start.y - 17) < 1e-9)
  assert.ok(Math.abs(segments[1].end.x - 9) < 1e-9)
  assert.ok(Math.abs(segments[1].end.y - 17) < 1e-9)
})

test('resolves children even when they appear before their parent', () => {
  const child = {
    id: 'child',
    name: 'child',
    parentId: 'root',
    length: 5,
    color: '#fff',
    transform: transform({ x: 10 })
  }
  const root = {
    id: 'root',
    name: 'root',
    parentId: null,
    length: 10,
    color: '#fff',
    transform: transform({ x: 3, y: 4 })
  }

  const [resolvedChild] = resolveBoneSegments([child, root])
  assert.deepEqual(resolvedChild.start, { x: 13, y: 4 })
  assert.deepEqual(resolvedChild.end, { x: 18, y: 4 })
})

test('uses Spine axis-angle semantics for shear and composes full affine parent transforms', () => {
  const root = {
    id: 'root',
    name: 'root',
    parentId: null,
    length: 20,
    color: '#fff',
    transform: transform({ x: 12, y: 8, rotation: 20, scaleX: 1.2, scaleY: 0.8, shearY: 25 })
  }
  const child = {
    id: 'child',
    name: 'child',
    parentId: 'root',
    length: 14,
    color: '#fff',
    transform: transform({
      x: 18,
      y: -3,
      rotation: -15,
      scaleX: 0.7,
      scaleY: 1.4,
      shearX: 12,
      shearY: -9
    })
  }
  const localRoot = matrixFromBoneTransform(root.transform)
  const localChild = matrixFromBoneTransform(child.transform)
  const expectedChildWorld = multiplyAffineMatrices(localRoot, localChild)
  const matrices = resolveBoneWorldMatrices([child, root])
  const childWorld = matrices.get('child')
  const childSegment = resolveBoneSegments([child, root])[0]

  assert.ok(childWorld)
  childWorld.forEach((value, index) =>
    assert.ok(Math.abs(value - expectedChildWorld[index]) < 1e-9)
  )
  assertPointAlmostEqual(childSegment.start, {
    x: expectedChildWorld[4],
    y: expectedChildWorld[5]
  })
  assertPointAlmostEqual(childSegment.end, {
    x: expectedChildWorld[0] * child.length + expectedChildWorld[4],
    y: expectedChildWorld[1] * child.length + expectedChildWorld[5]
  })
})

test('uses visible layer extents for artwork content bounds', () => {
  const bounds = artworkContentBounds(
    [
      { x: 30, y: 50, width: 40, height: 60, visible: true },
      { x: 10, y: 20, width: 15, height: 20, visible: true },
      { x: -100, y: -100, width: 500, height: 500, visible: false }
    ],
    { x: 0, y: 0, width: 100, height: 100 }
  )

  assert.deepEqual(bounds, { x: 10, y: 20, width: 60, height: 90 })
})

test('uniformly fits bone geometry within padded artwork bounds', () => {
  const [fitted] = fitBoneSegmentsToBounds(
    [
      {
        id: 'root',
        name: 'root',
        parentId: null,
        color: '#fff',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 50 }
      }
    ],
    { x: 100, y: 200, width: 200, height: 200 },
    0.1
  )

  assert.deepEqual(fitted.start, { x: 120, y: 260 })
  assert.deepEqual(fitted.end, { x: 280, y: 340 })
})

test('fits bones while preserving every resolved segment at its corresponding fitted position', () => {
  const bones = [
    {
      id: 'root',
      name: 'root',
      parentId: null,
      length: 30,
      color: '#f7c860',
      transform: transform({ x: 8, y: 14, rotation: 25, scaleX: 1.2, scaleY: 0.8 })
    },
    {
      id: 'child',
      name: 'child',
      parentId: 'root',
      length: 18,
      color: '#7dd3fc',
      transform: transform({ x: 30, y: 6, rotation: -70, scaleX: 0.75 })
    },
    {
      id: 'grandchild',
      name: 'grandchild',
      parentId: 'child',
      length: 12,
      color: '#fda4af',
      transform: transform({ x: 18, y: -4, rotation: 38 })
    }
  ]
  const target = { x: 100, y: 200, width: 320, height: 180 }
  const padding = 0.15
  const expectedById = new Map(
    fitBoneSegmentsToBounds(resolveBoneSegments(bones), target, padding).map((segment) => [
      segment.id,
      segment
    ])
  )

  const fittedBones = fitBonesToBounds(bones, target, padding)
  const actualSegments = resolveBoneSegments(fittedBones)

  assert.equal(actualSegments.length, bones.length)
  for (const segment of actualSegments) {
    const expected = expectedById.get(segment.id)
    assert.ok(expected, `missing expected segment for ${segment.id}`)
    assertPointAlmostEqual(segment.start, expected.start)
    assertPointAlmostEqual(segment.end, expected.end)
  }
})

test('creates a root bone whose resolved segment matches the world-space drag', () => {
  const start = { x: 10, y: 20 }
  const end = { x: 40, y: 60 }
  const bone = createBoneFromWorldSegment([], null, start, end, {
    id: 'created-root',
    name: 'created root',
    color: '#34d399'
  })
  const [segment] = resolveBoneSegments([bone])

  assert.equal(bone.id, 'created-root')
  assert.equal(bone.name, 'created root')
  assert.equal(bone.color, '#34d399')
  assert.equal(bone.parentId, null)
  assertPointAlmostEqual(segment.start, start)
  assertPointAlmostEqual(segment.end, end)
})

test('creates a child that round-trips a world segment through a rotated and scaled parent', () => {
  const parent = {
    id: 'parent',
    name: 'parent',
    parentId: null,
    length: 25,
    color: '#fff',
    transform: transform({ x: 15, y: -8, rotation: 67, scaleX: 1.75, scaleY: 0.6 })
  }
  const start = { x: 61, y: 34 }
  const end = { x: 18, y: 79 }
  const child = createBoneFromWorldSegment([parent], parent.id, start, end, {
    id: 'child',
    name: 'child',
    color: '#60a5fa'
  })
  const childSegment = resolveBoneSegments([parent, child]).find(
    (segment) => segment.id === child.id
  )

  assert.ok(childSegment)
  assert.equal(child.parentId, parent.id)
  assertPointAlmostEqual(childSegment.start, start)
  assertPointAlmostEqual(childSegment.end, end)
})

test('creates a child that round-trips through a sheared parent', () => {
  const parent = {
    id: 'parent',
    name: 'parent',
    parentId: null,
    length: 25,
    color: '#fff',
    transform: transform({
      x: 15,
      y: -8,
      rotation: 37,
      scaleX: 1.35,
      scaleY: 0.72,
      shearX: 11,
      shearY: -23
    })
  }
  const start = { x: 61, y: 34 }
  const end = { x: 18, y: 79 }
  const child = createBoneFromWorldSegment([parent], parent.id, start, end, {
    id: 'child',
    name: 'child',
    color: '#60a5fa'
  })
  const childSegment = resolveBoneSegments([parent, child]).find(
    (segment) => segment.id === child.id
  )

  assert.ok(childSegment)
  assertPointAlmostEqual(childSegment.start, start)
  assertPointAlmostEqual(childSegment.end, end)
})

test('creates a bone for a reverse-direction drag without reversing its endpoints', () => {
  const start = { x: 12, y: -4 }
  const end = { x: -28, y: -34 }
  const bone = createBoneFromWorldSegment([], null, start, end, {
    id: 'reverse',
    name: 'reverse',
    color: '#fb7185'
  })
  const [segment] = resolveBoneSegments([bone])

  assert.equal(bone.length, 50)
  assert.ok(Number.isFinite(bone.transform.rotation))
  assertPointAlmostEqual(segment.start, start)
  assertPointAlmostEqual(segment.end, end)
})

test('creates a finite zero-length bone for a point click', () => {
  const point = { x: 22, y: 31 }
  const bone = createBoneFromWorldSegment([], null, point, point, {
    id: 'point',
    name: 'point',
    color: '#facc15'
  })
  const [segment] = resolveBoneSegments([bone])

  assert.equal(bone.length, 0)
  assert.ok(Number.isFinite(bone.length))
  for (const [property, value] of Object.entries(bone.transform)) {
    assert.ok(Number.isFinite(value), `${property} must be finite`)
  }
  assertPointAlmostEqual(segment.start, point)
  assertPointAlmostEqual(segment.end, point)
})
