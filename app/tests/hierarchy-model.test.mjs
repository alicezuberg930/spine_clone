import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createConstraintTreeNodes,
  filterHierarchyRows,
  hierarchyRowHasChildren,
  visibleHierarchyRows
} from '../src/renderer/src/lib/hierarchy-model.ts'

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

const flatRows = [
  { id: 'root', depth: 0 },
  { id: 'left', depth: 1 },
  { id: 'left-child', depth: 2 },
  { id: 'left-grandchild', depth: 3 },
  { id: 'right', depth: 1 },
  { id: 'right-child', depth: 2 },
  { id: 'footer', depth: 0 }
]

test('collapsed ancestors hide every descendant without hiding sibling branches', () => {
  const visible = visibleHierarchyRows(flatRows, new Set(['left']))

  assert.deepEqual(
    visible.map((row) => row.id),
    ['root', 'left', 'right', 'right-child', 'footer']
  )
})

test('collapsing the root keeps only the root and later top-level rows visible', () => {
  const visible = visibleHierarchyRows(flatRows, new Set(['root']))

  assert.deepEqual(
    visible.map((row) => row.id),
    ['root', 'footer']
  )
})

test('expanded branches reveal descendants at every depth', () => {
  const visible = visibleHierarchyRows(flatRows, new Set())

  assert.deepEqual(visible, flatRows)
})

test('detects parents from the following row depth', () => {
  assert.equal(hierarchyRowHasChildren(flatRows, 0), true)
  assert.equal(hierarchyRowHasChildren(flatRows, 1), true)
  assert.equal(hierarchyRowHasChildren(flatRows, 3), false)
  assert.equal(hierarchyRowHasChildren(flatRows, 4), true)
  assert.equal(hierarchyRowHasChildren(flatRows, flatRows.length - 1), false)
})

test('filtering keeps matching rows and their ancestor chain', () => {
  const visible = filterHierarchyRows(flatRows, (row) => row.id === 'left-grandchild')

  assert.deepEqual(
    visible.map((row) => row.id),
    ['root', 'left', 'left-child', 'left-grandchild']
  )
})

test('filtering preserves independent matching branches in tree order', () => {
  const visible = filterHierarchyRows(
    flatRows,
    (row) => row.id === 'left-child' || row.id === 'right-child'
  )

  assert.deepEqual(
    visible.map((row) => row.id),
    ['root', 'left', 'left-child', 'right', 'right-child']
  )
})
