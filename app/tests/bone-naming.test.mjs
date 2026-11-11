import assert from 'node:assert/strict'
import test from 'node:test'

import { boneNameValidationError, normalizeBoneName } from '../src/renderer/src/lib/bone-naming.ts'

const bones = [
  { id: 'bone-1', name: 'root' },
  { id: 'bone-2', name: 'arm L' }
]

test('normalizes surrounding whitespace without changing the authored name', () => {
  assert.equal(normalizeBoneName('  upper arm L  '), 'upper arm L')
})

test('rejects blank and duplicate bone names', () => {
  assert.equal(boneNameValidationError(bones, 'bone-2', '   '), 'Bone name is required.')
  assert.equal(
    boneNameValidationError(bones, 'bone-2', ' ROOT '),
    'A bone named “ROOT” already exists.'
  )
})

test('allows the current bone name and a unique replacement', () => {
  assert.equal(boneNameValidationError(bones, 'bone-2', 'arm L'), null)
  assert.equal(boneNameValidationError(bones, 'bone-2', 'forearm L'), null)
})
