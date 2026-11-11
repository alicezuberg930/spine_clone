import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createProjectFile,
  deserializeProject,
  serializeProject
} from '../src/renderer/src/lib/project-serialization.ts'

const savedAt = '2026-11-11T10:00:00.000Z'

const transform = {
  x: 12,
  y: 34,
  rotation: 15,
  scaleX: 1.25,
  scaleY: 0.8,
  shearX: 6,
  shearY: -4,
  opacity: 0.9
}

const keyframe = {
  id: 'key-root-rotation-10',
  trackId: 'track-root-rotation',
  targetId: 'bone-root',
  property: 'rotation',
  frame: 10,
  value: 45,
  interpolation: 'bezier'
}

const project = {
  id: 'project-open-test',
  name: 'Open test',
  skeletonName: 'open_test_rig',
  canvas: { width: 640, height: 480 },
  boneSpace: 'canvas',
  bones: [
    {
      id: 'bone-root',
      name: 'root',
      parentId: null,
      length: 90,
      color: '#55ddcc',
      transform
    }
  ],
  slots: [],
  attachments: [],
  constraints: [
    {
      id: 'constraint-physics',
      name: 'physics',
      type: 'physics',
      boneIds: ['bone-root'],
      mix: 1,
      enabled: true,
      physics: {
        inertia: 11,
        strength: 22,
        damping: 33,
        mass: 1.4,
        wind: 5,
        gravity: 18
      }
    }
  ],
  skins: [
    { id: 'skin-a', name: 'Skin A', accent: '#fff', attachmentIds: [] },
    { id: 'skin-b', name: 'Skin B', accent: '#000', attachmentIds: [] }
  ],
  animations: [
    {
      id: 'animation-a',
      name: 'Animation A',
      duration: 30,
      fps: 30,
      loop: true,
      tracks: [],
      keyframes: []
    },
    {
      id: 'animation-b',
      name: 'Animation B',
      duration: 20,
      fps: 24,
      loop: false,
      tracks: [
        {
          id: 'track-root-rotation',
          name: 'root rotation',
          targetId: 'bone-root',
          property: 'rotation',
          color: '#fff'
        }
      ],
      keyframes: [keyframe]
    }
  ],
  artwork: {
    id: 'artwork-test',
    name: 'test.psd',
    sourceType: 'psd',
    width: 640,
    height: 480,
    importedAt: savedAt,
    layers: [
      {
        id: 'artwork-layer-body',
        name: 'body',
        groupPath: ['character'],
        dataUrl: 'data:image/png;base64,cG5n',
        x: 10,
        y: 20,
        width: 100,
        height: 120,
        opacity: 1,
        visible: true,
        blendMode: 'normal',
        order: 0,
        sourceFileName: 'body.png',
        boneId: 'bone-root',
        boneBindPose: [1, 0, 0, 1, 12, 34]
      }
    ]
  },
  audioTracks: [
    {
      id: 'audio-test',
      name: 'test.wav',
      sourceFileName: 'test.wav',
      mimeType: 'audio/wav',
      sizeBytes: 4,
      dataUrl: 'data:audio/wav;base64,UklGRg==',
      durationSeconds: 1,
      sampleRate: 44100,
      channels: 2,
      waveform: [0, 0.5, -0.5],
      startFrame: 3,
      volume: 0.75,
      muted: false
    }
  ],
  updatedAt: savedAt
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const createState = () => ({
  project: structuredClone(project),
  mode: 'animate',
  tool: 'shear',
  selection: { kind: 'bone', id: 'bone-root' },
  selections: [
    { kind: 'bone', id: 'bone-root' },
    { kind: 'artwork-layer', id: 'artwork-layer-body' }
  ],
  frame: 18,
  fps: 24,
  duration: 20,
  isPlaying: true,
  loop: false,
  autoKey: true,
  ghosting: true,
  showBones: true,
  showMesh: true,
  showWeights: false,
  showClipping: true,
  showBounds: false,
  showGrid: false,
  snap: true,
  physicsEnabled: true,
  zoom: 1.1,
  timelineView: 'graph',
  activeSkin: 'skin-b',
  activeAnimation: 'animation-b',
  geometrySelection: null,
  weightBrush: { boneId: 'bone-root', radius: 90, strength: 0.35, mode: 'add' },
  transform: structuredClone(transform),
  physics: structuredClone(project.constraints[0].physics),
  keyframes: [structuredClone(keyframe)]
})

test('round-trips a complete project and restores durable workspace state', () => {
  const restored = deserializeProject(serializeProject(createState(), savedAt))

  assert.equal(restored.project.id, 'project-open-test')
  assert.equal(restored.project.artwork.layers[0].dataUrl, 'data:image/png;base64,cG5n')
  assert.equal(restored.project.audioTracks[0].dataUrl, 'data:audio/wav;base64,UklGRg==')
  assert.deepEqual(restored.project.bones[0].transform, transform)
  assert.equal(restored.activeAnimation, 'animation-b')
  assert.equal(restored.activeSkin, 'skin-b')
  assert.equal(restored.fps, 24)
  assert.equal(restored.duration, 20)
  assert.equal(restored.loop, false)
  assert.deepEqual(restored.keyframes, [keyframe])
  assert.equal(restored.frame, 18)
  assert.equal(restored.zoom, 1.1)
  assert.equal(restored.mode, 'animate')
  assert.equal(restored.tool, 'shear')
  assert.equal(restored.timelineView, 'graph')
  assert.equal(restored.isPlaying, false)
  assert.equal(restored.geometrySelection, null)
  assert.deepEqual(restored.transform, transform)
  assert.deepEqual(restored.physics, project.constraints[0].physics)
  assert.deepEqual(restored.selections, [
    { kind: 'bone', id: 'bone-root' },
    { kind: 'artwork-layer', id: 'artwork-layer-body' }
  ])
})

test('round-trips a project with no bones without inventing a binding or selection', () => {
  const state = createState()
  state.project.bones = []
  state.project.slots = []
  state.project.attachments = []
  state.project.constraints = []
  state.project.artwork = null
  state.project.skins = [structuredClone(project.skins[0])]
  state.project.animations = [structuredClone(project.animations[0])]
  state.selection = null
  state.selections = []
  state.frame = 0
  state.fps = state.project.animations[0].fps
  state.duration = state.project.animations[0].duration
  state.activeSkin = state.project.skins[0].id
  state.activeAnimation = state.project.animations[0].id
  state.weightBrush.boneId = null
  state.keyframes = []

  const restored = deserializeProject(serializeProject(state, savedAt))

  assert.deepEqual(restored.project.bones, [])
  assert.equal(restored.selection, null)
  assert.deepEqual(restored.selections, [])
  assert.equal(restored.weightBrush.boneId, null)
  assert.equal(restored.activeAnimation, 'animation-a')
  assert.equal(restored.activeSkin, 'skin-a')
})

test('rejects malformed JSON, the wrong format, and unsupported versions', () => {
  assert.throws(() => deserializeProject('{ nope'), /not valid JSON/)

  const file = createProjectFile(createState(), savedAt)
  assert.throws(
    () => deserializeProject(JSON.stringify({ ...file, format: 'some-other-format' })),
    /not a Layerforge project/
  )
  assert.throws(
    () => deserializeProject(JSON.stringify({ ...file, version: 99 })),
    /version 99 is not supported/
  )
})

test('rejects missing or structurally invalid essential project data', () => {
  const file = createProjectFile(createState(), savedAt)
  assert.throws(
    () =>
      deserializeProject(
        JSON.stringify({ ...file, project: { ...file.project, bones: 'not-an-array' } })
      ),
    /project\.bones is missing or invalid/
  )
  assert.throws(
    () =>
      deserializeProject(JSON.stringify({ ...file, workspace: { ...file.workspace, view: null } })),
    /workspace\.view is missing or invalid/
  )
})

test('falls back from stale workspace ids and clamps viewport values', () => {
  const file = createProjectFile(createState(), savedAt)
  file.workspace.activeAnimation = 'animation-missing'
  file.workspace.activeSkin = 'skin-missing'
  file.workspace.selection = { kind: 'bone', id: 'bone-missing' }
  file.workspace.selections = [{ kind: 'bone', id: 'bone-missing' }]
  file.workspace.frame = 999
  file.workspace.zoom = 999

  const restored = deserializeProject(JSON.stringify(file))

  assert.equal(restored.activeAnimation, 'animation-a')
  assert.equal(restored.activeSkin, 'skin-a')
  assert.deepEqual(restored.selection, { kind: 'bone', id: 'bone-root' })
  assert.deepEqual(restored.selections, [{ kind: 'bone', id: 'bone-root' }])
  assert.equal(restored.frame, 30)
  assert.equal(restored.zoom, 4)
  assert.equal(restored.isPlaying, false)
})

test('hydrates older version-one snapshots without selections or bone-space fields', () => {
  const file = createProjectFile(createState(), savedAt)
  delete file.project.boneSpace
  delete file.workspace.selections

  const restored = deserializeProject(JSON.stringify(file))

  assert.equal(restored.project.boneSpace, 'legacy')
  assert.deepEqual(restored.selection, { kind: 'bone', id: 'bone-root' })
  assert.deepEqual(restored.selections, [{ kind: 'bone', id: 'bone-root' }])
})

test('deserialization does not mutate a parsed project object', () => {
  const file = createProjectFile(createState(), savedAt)
  const before = structuredClone(file)

  deserializeProject(JSON.stringify(file))

  assert.deepEqual(file, before)
})
