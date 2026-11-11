import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deleteBoneFromEditorState,
  deleteBoneFromProject
} from '../src/renderer/src/lib/bone-deletion.ts'
import {
  resolveBoneSegments,
  resolveBoneWorldMatrices
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

const bone = (id, parentId, overrides = {}) => ({
  id,
  name: id,
  parentId,
  length: 20,
  color: '#fff',
  transform: transform(overrides)
})

const key = (id, trackId, targetId) => ({
  id,
  trackId,
  targetId,
  property: 'rotation',
  frame: 0,
  value: 0,
  interpolation: 'linear'
})

const createProject = () => ({
  id: 'project',
  name: 'project',
  skeletonName: 'rig',
  canvas: { width: 500, height: 500 },
  boneSpace: 'canvas',
  bones: [
    bone('root', null, {
      x: 25,
      y: 40,
      rotation: 28,
      scaleX: 1.2,
      scaleY: 0.8,
      shearY: 13
    }),
    bone('middle', 'root', {
      x: 42,
      y: -7,
      rotation: 17,
      scaleX: 0.9,
      scaleY: 1.1,
      shearX: 6,
      shearY: -11
    }),
    bone('child', 'middle', {
      x: 31,
      y: 6,
      rotation: -52,
      scaleX: 1.4,
      scaleY: 0.7,
      shearX: -8,
      shearY: 19
    }),
    bone('grandchild', 'child', { x: 18, y: 3, rotation: 21 }),
    bone('sibling', 'root', { x: -20, y: 10, rotation: 8 })
  ],
  slots: [
    {
      id: 'slot-middle',
      name: 'middle',
      boneId: 'middle',
      attachmentIds: ['attachment'],
      activeAttachmentId: 'attachment',
      drawOrder: 0
    },
    {
      id: 'slot-sibling',
      name: 'sibling',
      boneId: 'sibling',
      attachmentIds: [],
      activeAttachmentId: '',
      drawOrder: 1
    }
  ],
  attachments: [
    {
      id: 'attachment',
      name: 'mesh',
      slotId: 'slot-middle',
      type: 'mesh',
      color: '#fff',
      width: 10,
      height: 10,
      weights: {
        0: [{ boneId: 'middle', value: 1 }],
        1: [
          { boneId: 'middle', value: 0.75 },
          { boneId: 'sibling', value: 0.25 }
        ]
      }
    }
  ],
  constraints: [
    {
      id: 'constraint-removed',
      name: 'removed',
      type: 'ik',
      boneIds: ['child'],
      targetId: 'middle',
      mix: 1
    },
    {
      id: 'constraint-survives',
      name: 'survives',
      type: 'transform',
      boneIds: ['sibling'],
      targetId: 'root',
      mix: 1
    }
  ],
  skins: [],
  animations: [
    {
      id: 'animation',
      name: 'animation',
      duration: 10,
      fps: 30,
      loop: true,
      tracks: [
        {
          id: 'track-middle',
          name: 'middle',
          targetId: 'middle',
          property: 'rotation',
          color: '#fff'
        },
        {
          id: 'track-constraint',
          name: 'constraint',
          targetId: 'constraint-removed',
          property: 'mix',
          color: '#fff'
        },
        {
          id: 'track-sibling',
          name: 'sibling',
          targetId: 'sibling',
          property: 'rotation',
          color: '#fff'
        }
      ],
      keyframes: [
        key('key-middle', 'track-middle', 'middle'),
        key('key-constraint', 'track-constraint', 'constraint-removed'),
        key('key-sibling', 'track-sibling', 'sibling')
      ]
    }
  ],
  artwork: {
    id: 'artwork',
    name: 'artwork',
    sourceType: 'images',
    width: 10,
    height: 10,
    importedAt: '2026-01-01T00:00:00.000Z',
    layers: [
      {
        id: 'layer',
        name: 'layer',
        groupPath: [],
        dataUrl: '',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        opacity: 1,
        visible: true,
        blendMode: 'normal',
        order: 0,
        sourceFileName: 'layer.png',
        boneId: 'middle',
        boneBindPose: [1, 0, 0, 1, 0, 0],
        mesh: {
          vertices: [
            {
              id: 'vertex-fallback',
              source: { x: 0, y: 0 },
              position: { x: 0, y: 0 },
              weights: [{ boneId: 'child', value: 1 }]
            },
            {
              id: 'vertex-survivor',
              source: { x: 1, y: 1 },
              position: { x: 1, y: 1 },
              weights: [
                { boneId: 'middle', value: 0.8 },
                { boneId: 'sibling', value: 0.2 }
              ]
            }
          ],
          triangles: [],
          bindPose: {
            middle: [1, 0, 0, 1, 0, 0],
            child: [1, 0, 0, 1, 0, 0],
            sibling: [1, 0, 0, 1, 0, 0]
          }
        }
      }
    ]
  },
  audioTracks: [],
  updatedAt: '2026-01-01T00:00:00.000Z'
})

const createState = (project) => ({
  project,
  mode: 'setup',
  tool: 'select',
  selection: { kind: 'bone', id: 'child' },
  selections: [{ kind: 'bone', id: 'child' }],
  frame: 0,
  fps: 30,
  duration: 10,
  isPlaying: false,
  loop: true,
  autoKey: false,
  ghosting: false,
  showBones: true,
  showMesh: false,
  showWeights: false,
  showClipping: false,
  showBounds: false,
  showGrid: true,
  snap: false,
  physicsEnabled: true,
  zoom: 1,
  timelineView: 'dopesheet',
  activeSkin: '',
  activeAnimation: 'animation',
  geometrySelection: null,
  weightBrush: { boneId: 'child', radius: 10, strength: 0.5, mode: 'add' },
  transform: { ...project.bones.find((item) => item.id === 'child').transform },
  physics: { inertia: 0, strength: 0, damping: 0, mass: 1, wind: 0, gravity: 0 },
  keyframes: [
    key('state-middle', 'track-middle', 'middle'),
    key('state-constraint', 'track-constraint', 'constraint-removed'),
    key('state-sibling', 'track-sibling', 'sibling')
  ]
})

const assertPointAlmostEqual = (actual, expected, epsilon = 1e-8) => {
  assert.ok(Math.abs(actual.x - expected.x) <= epsilon, `x: ${actual.x} != ${expected.x}`)
  assert.ok(Math.abs(actual.y - expected.y) <= epsilon, `y: ${actual.y} != ${expected.y}`)
}

test('protects root bones and invalid targets with a strict no-op', () => {
  const project = createProject()
  const state = createState(project)

  assert.equal(deleteBoneFromProject(project, 'root', 'branch').project, project)
  assert.equal(deleteBoneFromEditorState(state, 'root', 'reparent'), state)
  assert.equal(deleteBoneFromEditorState(state, 'missing', 'branch'), state)
})

test('branch deletion removes descendants and cleans every dependent reference', () => {
  const state = deleteBoneFromEditorState(createState(createProject()), 'middle', 'branch')

  assert.deepEqual(
    state.project.bones.map((item) => item.id),
    ['root', 'sibling']
  )
  assert.equal(state.project.slots[0].boneId, 'root')
  assert.deepEqual(state.project.attachments[0].weights[0], [{ boneId: 'root', value: 1 }])
  assert.deepEqual(state.project.attachments[0].weights[1], [{ boneId: 'sibling', value: 1 }])
  assert.deepEqual(
    state.project.constraints.map((constraint) => constraint.id),
    ['constraint-survives']
  )
  assert.deepEqual(
    state.project.animations[0].tracks.map((track) => track.id),
    ['track-sibling']
  )
  assert.deepEqual(
    state.project.animations[0].keyframes.map((item) => item.id),
    ['key-sibling']
  )

  const mesh = state.project.artwork.layers[0].mesh
  assert.deepEqual(mesh.vertices[0].weights, [{ boneId: 'root', value: 1 }])
  assert.deepEqual(mesh.vertices[1].weights, [{ boneId: 'sibling', value: 1 }])
  assert.deepEqual(Object.keys(mesh.bindPose).sort(), ['root', 'sibling'])
  assert.equal('boneId' in state.project.artwork.layers[0], false)
  assert.equal('boneBindPose' in state.project.artwork.layers[0], false)
  assert.deepEqual(state.selection, { kind: 'bone', id: 'root' })
  assert.equal(state.weightBrush.boneId, 'root')
  assert.deepEqual(
    state.keyframes.map((item) => item.id),
    ['state-sibling']
  )
})

test('reparent deletion preserves the world pose of children and deeper descendants', () => {
  const project = createProject()
  const beforeMatrices = resolveBoneWorldMatrices(project.bones)
  const before = new Map(
    resolveBoneSegments(project.bones)
      .filter((segment) => segment.id === 'child' || segment.id === 'grandchild')
      .map((segment) => [segment.id, segment])
  )
  const result = deleteBoneFromProject(project, 'middle', 'reparent')
  const afterMatrices = resolveBoneWorldMatrices(result.project.bones)
  const after = new Map(
    resolveBoneSegments(result.project.bones)
      .filter((segment) => segment.id === 'child' || segment.id === 'grandchild')
      .map((segment) => [segment.id, segment])
  )

  assert.equal(result.project.bones.find((item) => item.id === 'child').parentId, 'root')
  assert.equal(result.project.bones.find((item) => item.id === 'grandchild').parentId, 'child')
  for (const id of ['child', 'grandchild']) {
    assertPointAlmostEqual(after.get(id).start, before.get(id).start)
    assertPointAlmostEqual(after.get(id).end, before.get(id).end)
    beforeMatrices
      .get(id)
      .forEach((value, index) => assert.ok(Math.abs(afterMatrices.get(id)[index] - value) <= 1e-8))
  }
  assert.deepEqual([...result.reparentedBoneIds], ['child'])
  assert.equal('boneId' in result.project.artwork.layers[0], false)
  assert.equal('boneBindPose' in result.project.artwork.layers[0], false)
})
