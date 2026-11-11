import assert from 'node:assert/strict'
import test from 'node:test'

import { createBoneBindingOptions } from '../src/renderer/src/lib/bone-binding-options.ts'

test('the first user-created bone remains available after the full default rig', () => {
  const defaultBones = Array.from({ length: 19 }, (_, index) => ({
    id: `default-${index + 1}`,
    name: `default ${index + 1}`
  }))
  const createdBone = { id: 'bone-20', name: 'bone 20' }

  const options = createBoneBindingOptions([...defaultBones, createdBone])

  assert.equal(options.length, 21)
  assert.deepEqual(options[0], { value: null, label: 'Unbound' })
  assert.deepEqual(options[20], { value: 'bone-20', label: 'bone 20' })
})

test('bone binding options preserve every project bone in project order', () => {
  const bones = Array.from({ length: 52 }, (_, index) => ({
    id: `bone-${index + 1}`,
    name: `bone ${index + 1}`
  }))

  const options = createBoneBindingOptions(bones)

  assert.deepEqual(
    options.slice(1).map((option) => option.value),
    bones.map((bone) => bone.id)
  )
})
