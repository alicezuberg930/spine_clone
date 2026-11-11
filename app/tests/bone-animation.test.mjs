import assert from 'node:assert/strict'
import test from 'node:test'

import {
  evaluateBoneTransforms,
  evaluateTransformProperty
} from '../src/renderer/src/lib/bone-animation.ts'

const key = (frame, value, interpolation = 'linear', property = 'rotation') => ({
  id: `key-${property}-${frame}`,
  trackId: `track-bone-${property}`,
  targetId: 'bone',
  property,
  frame,
  value,
  interpolation
})

const bone = {
  id: 'bone',
  name: 'bone',
  parentId: null,
  length: 20,
  color: '#fff',
  transform: {
    x: 4,
    y: 8,
    rotation: 10,
    scaleX: 1,
    scaleY: 1,
    shearX: 0,
    shearY: 0,
    opacity: 1
  }
}

test('uses the setup value before the first transform key and holds the final key', () => {
  const keys = [key(5, 30), key(15, 70)]

  assert.equal(evaluateTransformProperty(keys, 'bone', 'rotation', 2, 10), 10)
  assert.equal(evaluateTransformProperty(keys, 'bone', 'rotation', 20, 10), 70)
})

test('evaluates linear, stepped, and bezier transform timelines', () => {
  assert.equal(evaluateTransformProperty([key(0, 0), key(10, 100)], 'bone', 'rotation', 5, 10), 50)
  assert.equal(
    evaluateTransformProperty([key(0, 20, 'stepped'), key(10, 100)], 'bone', 'rotation', 5, 10),
    20
  )
  assert.equal(
    evaluateTransformProperty([key(0, 0, 'bezier'), key(10, 100)], 'bone', 'rotation', 2.5, 10),
    15.625
  )
})

test('evaluates translate, rotate, scale, and shear without mutating setup bones', () => {
  const keys = [
    key(0, 4, 'linear', 'x'),
    key(10, 24, 'linear', 'x'),
    key(0, 10),
    key(10, 50),
    key(0, 1, 'linear', 'scaleX'),
    key(10, 2, 'linear', 'scaleX'),
    key(0, 0, 'linear', 'shearY'),
    key(10, 30, 'linear', 'shearY')
  ]

  const [evaluated] = evaluateBoneTransforms([bone], keys, 5)

  assert.equal(evaluated.transform.x, 14)
  assert.equal(evaluated.transform.rotation, 30)
  assert.equal(evaluated.transform.scaleX, 1.5)
  assert.equal(evaluated.transform.shearY, 15)
  assert.deepEqual(bone.transform, {
    x: 4,
    y: 8,
    rotation: 10,
    scaleX: 1,
    scaleY: 1,
    shearX: 0,
    shearY: 0,
    opacity: 1
  })
})
