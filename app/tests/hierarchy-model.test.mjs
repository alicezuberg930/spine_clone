import assert from 'node:assert/strict'
import test from 'node:test'

import { createConstraintTreeNodes } from '../src/renderer/src/lib/hierarchy-model.ts'

test('exposes every IK constraint as its own selectable hierarchy row', () => {
  const rows = createConstraintTreeNodes([
    { id: 'constraint-hand-ik', name: 'hand aim IK', type: 'ik' },
    { id: 'constraint-foot-ik', name: 'ground foot IK', type: 'ik' }
  ])

  assert.deepEqual(
    rows.map(({ id, name }) => ({ id, name })),
    [
      { id: 'constraint-hand-ik', name: 'IK · hand aim' },
      { id: 'constraint-foot-ik', name: 'IK · grounded foot' }
    ]
  )
})

test('keeps constraint groups in the editor hierarchy order', () => {
  const rows = createConstraintTreeNodes([
    { id: 'physics', name: 'follow through', type: 'physics' },
    { id: 'path', name: 'scarf flow', type: 'path' },
    { id: 'ik', name: 'arm', type: 'ik' },
    { id: 'transform', name: 'gaze', type: 'transform' }
  ])

  assert.deepEqual(
    rows.map((row) => row.id),
    ['transform', 'ik', 'path', 'physics']
  )
})
