import type {
  Animation,
  Attachment,
  Bone,
  Constraint,
  EditorKeyframe,
  EditorProject,
  PhysicsParams,
  Skin,
  Slot,
  Transform
} from '@/@types'

export const DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1
}

export const DEFAULT_PHYSICS: PhysicsParams = {
  inertia: 72,
  strength: 54,
  damping: 38,
  mass: 1.2,
  wind: 8,
  gravity: 24
}

const transform = (overrides: Partial<Transform> = {}): Transform => ({
  ...DEFAULT_TRANSFORM,
  ...overrides
})

const bones: Bone[] = [
  {
    id: 'bone-root',
    name: 'root',
    parentId: null,
    length: 54,
    color: '#89a7ff',
    transform: transform({ x: 0, y: 168 })
  },
  {
    id: 'bone-pelvis',
    name: 'pelvis',
    parentId: 'bone-root',
    length: 44,
    color: '#a58dff',
    transform: transform({ y: -10, rotation: 90 })
  },
  {
    id: 'bone-torso',
    name: 'torso',
    parentId: 'bone-pelvis',
    length: 84,
    color: '#73d8c8',
    transform: transform({ y: -42, rotation: -90 })
  },
  {
    id: 'bone-chest',
    name: 'chest',
    parentId: 'bone-torso',
    length: 64,
    color: '#73d8c8',
    transform: transform({ x: 84 })
  },
  {
    id: 'bone-neck',
    name: 'neck',
    parentId: 'bone-chest',
    length: 28,
    color: '#f6c56f',
    transform: transform({ x: 58, rotation: 2 })
  },
  {
    id: 'bone-head',
    name: 'head',
    parentId: 'bone-neck',
    length: 58,
    color: '#f6c56f',
    transform: transform({ x: 24, rotation: -2 })
  },
  {
    id: 'bone-arm-l',
    name: 'upper arm L',
    parentId: 'bone-chest',
    length: 66,
    color: '#ff8f9c',
    transform: transform({ x: 45, y: -38, rotation: -156 })
  },
  {
    id: 'bone-forearm-l',
    name: 'forearm L',
    parentId: 'bone-arm-l',
    length: 62,
    color: '#ff8f9c',
    transform: transform({ x: 62, rotation: -16 })
  },
  {
    id: 'bone-hand-l',
    name: 'hand L',
    parentId: 'bone-forearm-l',
    length: 26,
    color: '#ff8f9c',
    transform: transform({ x: 58, rotation: 8 })
  },
  {
    id: 'bone-arm-r',
    name: 'upper arm R',
    parentId: 'bone-chest',
    length: 66,
    color: '#f29b69',
    transform: transform({ x: 45, y: 38, rotation: 154 })
  },
  {
    id: 'bone-forearm-r',
    name: 'forearm R',
    parentId: 'bone-arm-r',
    length: 62,
    color: '#f29b69',
    transform: transform({ x: 62, rotation: 16 })
  },
  {
    id: 'bone-hand-r',
    name: 'hand R',
    parentId: 'bone-forearm-r',
    length: 26,
    color: '#f29b69',
    transform: transform({ x: 58, rotation: -8 })
  },
  {
    id: 'bone-thigh-l',
    name: 'thigh L',
    parentId: 'bone-pelvis',
    length: 86,
    color: '#7ab4ff',
    transform: transform({ y: -18, rotation: 98 })
  },
  {
    id: 'bone-shin-l',
    name: 'shin L',
    parentId: 'bone-thigh-l',
    length: 82,
    color: '#7ab4ff',
    transform: transform({ x: 82, rotation: -8 })
  },
  {
    id: 'bone-foot-l',
    name: 'foot L',
    parentId: 'bone-shin-l',
    length: 40,
    color: '#7ab4ff',
    transform: transform({ x: 78, rotation: -84 })
  },
  {
    id: 'bone-thigh-r',
    name: 'thigh R',
    parentId: 'bone-pelvis',
    length: 86,
    color: '#9a8bff',
    transform: transform({ y: 18, rotation: 82 })
  },
  {
    id: 'bone-shin-r',
    name: 'shin R',
    parentId: 'bone-thigh-r',
    length: 82,
    color: '#9a8bff',
    transform: transform({ x: 82, rotation: 8 })
  },
  {
    id: 'bone-foot-r',
    name: 'foot R',
    parentId: 'bone-shin-r',
    length: 40,
    color: '#9a8bff',
    transform: transform({ x: 78, rotation: -96 })
  },
  {
    id: 'bone-cape',
    name: 'cape control',
    parentId: 'bone-chest',
    length: 118,
    color: '#e374b7',
    transform: transform({ x: 20, y: 30, rotation: 100 })
  }
]

const attachments: Attachment[] = [
  {
    id: 'attachment-head',
    name: 'head / scout',
    slotId: 'slot-head',
    type: 'region',
    color: '#f5c7aa',
    width: 112,
    height: 126
  },
  {
    id: 'attachment-head-night',
    name: 'head / night ops',
    slotId: 'slot-head',
    type: 'region',
    color: '#b7c4ea',
    width: 112,
    height: 126
  },
  {
    id: 'attachment-torso',
    name: 'jacket / ember',
    slotId: 'slot-torso',
    type: 'region',
    color: '#d76957',
    width: 148,
    height: 168
  },
  {
    id: 'attachment-torso-night',
    name: 'jacket / night ops',
    slotId: 'slot-torso',
    type: 'region',
    color: '#40537d',
    width: 148,
    height: 168
  },
  {
    id: 'attachment-arm-l',
    name: 'sleeve L',
    slotId: 'slot-arm-l',
    type: 'region',
    color: '#df715f',
    width: 42,
    height: 126
  },
  {
    id: 'attachment-arm-r',
    name: 'sleeve R',
    slotId: 'slot-arm-r',
    type: 'region',
    color: '#df715f',
    width: 42,
    height: 126
  },
  {
    id: 'attachment-leg-l',
    name: 'leg L',
    slotId: 'slot-leg-l',
    type: 'region',
    color: '#32405f',
    width: 54,
    height: 174
  },
  {
    id: 'attachment-leg-r',
    name: 'leg R',
    slotId: 'slot-leg-r',
    type: 'region',
    color: '#3f4d70',
    width: 54,
    height: 174
  },
  {
    id: 'attachment-cape',
    name: 'cape mesh',
    slotId: 'slot-cape',
    type: 'mesh',
    color: '#7f4d87',
    width: 144,
    height: 230,
    vertices: [
      { x: -60, y: -100 },
      { x: 58, y: -92 },
      { x: 70, y: 42 },
      { x: 28, y: 108 },
      { x: -36, y: 104 },
      { x: -72, y: 34 }
    ],
    weights: {
      0: [
        { boneId: 'bone-chest', value: 0.8 },
        { boneId: 'bone-cape', value: 0.2 }
      ],
      3: [{ boneId: 'bone-cape', value: 1 }],
      4: [{ boneId: 'bone-cape', value: 1 }]
    }
  },
  {
    id: 'attachment-eye-clip',
    name: 'visor clip',
    slotId: 'slot-head',
    type: 'clipping',
    color: '#66e0d5',
    width: 82,
    height: 28,
    vertices: [
      { x: -42, y: -15 },
      { x: 42, y: -15 },
      { x: 36, y: 15 },
      { x: -36, y: 15 }
    ]
  },
  {
    id: 'attachment-hurtbox',
    name: 'body hurtbox',
    slotId: 'slot-torso',
    type: 'bounding-box',
    color: '#f6bd60',
    width: 132,
    height: 318,
    vertices: [
      { x: -54, y: -150 },
      { x: 54, y: -150 },
      { x: 66, y: 72 },
      { x: 40, y: 154 },
      { x: -40, y: 154 },
      { x: -66, y: 72 }
    ]
  },
  {
    id: 'attachment-scarf-path',
    name: 'scarf motion path',
    slotId: 'slot-cape',
    type: 'path',
    color: '#54c4bd',
    width: 180,
    height: 80,
    vertices: [
      { x: 0, y: 0 },
      { x: 60, y: -42 },
      { x: 126, y: 38 },
      { x: 180, y: 4 }
    ]
  }
]

const slots: Slot[] = [
  {
    id: 'slot-cape',
    name: 'cape',
    boneId: 'bone-cape',
    attachmentIds: ['attachment-cape', 'attachment-scarf-path'],
    activeAttachmentId: 'attachment-cape',
    drawOrder: 0
  },
  {
    id: 'slot-leg-r',
    name: 'leg R',
    boneId: 'bone-thigh-r',
    attachmentIds: ['attachment-leg-r'],
    activeAttachmentId: 'attachment-leg-r',
    drawOrder: 1
  },
  {
    id: 'slot-leg-l',
    name: 'leg L',
    boneId: 'bone-thigh-l',
    attachmentIds: ['attachment-leg-l'],
    activeAttachmentId: 'attachment-leg-l',
    drawOrder: 2
  },
  {
    id: 'slot-torso',
    name: 'torso',
    boneId: 'bone-torso',
    attachmentIds: ['attachment-torso', 'attachment-torso-night', 'attachment-hurtbox'],
    activeAttachmentId: 'attachment-torso',
    drawOrder: 3
  },
  {
    id: 'slot-arm-r',
    name: 'arm R',
    boneId: 'bone-arm-r',
    attachmentIds: ['attachment-arm-r'],
    activeAttachmentId: 'attachment-arm-r',
    drawOrder: 4
  },
  {
    id: 'slot-arm-l',
    name: 'arm L',
    boneId: 'bone-arm-l',
    attachmentIds: ['attachment-arm-l'],
    activeAttachmentId: 'attachment-arm-l',
    drawOrder: 5
  },
  {
    id: 'slot-head',
    name: 'head',
    boneId: 'bone-head',
    attachmentIds: ['attachment-head', 'attachment-head-night', 'attachment-eye-clip'],
    activeAttachmentId: 'attachment-head',
    drawOrder: 6
  }
]

const constraints: Constraint[] = [
  {
    id: 'constraint-hand-ik',
    name: 'hand aim IK',
    type: 'ik',
    boneIds: ['bone-arm-l', 'bone-forearm-l'],
    targetId: 'bone-hand-l',
    mix: 1
  },
  {
    id: 'constraint-foot-ik',
    name: 'ground foot IK',
    type: 'ik',
    boneIds: ['bone-thigh-r', 'bone-shin-r'],
    targetId: 'bone-foot-r',
    mix: 1
  },
  {
    id: 'constraint-cape-physics',
    name: 'cape follow-through',
    type: 'physics',
    boneIds: ['bone-cape'],
    mix: 0.82,
    physics: { ...DEFAULT_PHYSICS }
  },
  {
    id: 'constraint-gaze',
    name: 'gaze driver',
    type: 'transform',
    boneIds: ['bone-head'],
    targetId: 'bone-chest',
    mix: 0.35
  },
  {
    id: 'constraint-scarf-path',
    name: 'scarf path',
    type: 'path',
    boneIds: ['bone-cape'],
    targetId: 'attachment-scarf-path',
    mix: 0.7
  }
]

const skins: Skin[] = [
  {
    id: 'skin-ember',
    name: 'Ember Scout',
    accent: '#e4785d',
    attachmentIds: [
      'attachment-head',
      'attachment-torso',
      'attachment-arm-l',
      'attachment-arm-r',
      'attachment-leg-l',
      'attachment-leg-r',
      'attachment-cape'
    ]
  },
  {
    id: 'skin-night',
    name: 'Night Ops',
    accent: '#7185c9',
    attachmentIds: [
      'attachment-head-night',
      'attachment-torso-night',
      'attachment-arm-l',
      'attachment-arm-r',
      'attachment-leg-l',
      'attachment-leg-r',
      'attachment-cape'
    ]
  },
  {
    id: 'skin-rig',
    name: 'Rig diagnostics',
    accent: '#61d4c5',
    attachmentIds: ['attachment-eye-clip', 'attachment-hurtbox', 'attachment-scarf-path']
  }
]

const keyframe = (
  id: string,
  trackId: string,
  targetId: string,
  property: string,
  frame: number,
  value: EditorKeyframe['value'],
  interpolation: EditorKeyframe['interpolation'] = 'bezier'
): EditorKeyframe => ({ id, trackId, targetId, property, frame, value, interpolation })

const idleKeyframes: EditorKeyframe[] = [
  keyframe('idle-chest-0', 'track-chest-y', 'bone-chest', 'y', 0, 0),
  keyframe('idle-chest-15', 'track-chest-y', 'bone-chest', 'y', 15, -4),
  keyframe('idle-chest-30', 'track-chest-y', 'bone-chest', 'y', 30, 0),
  keyframe('idle-head-0', 'track-head-rotation', 'bone-head', 'rotation', 0, -2),
  keyframe('idle-head-15', 'track-head-rotation', 'bone-head', 'rotation', 15, 3),
  keyframe('idle-head-30', 'track-head-rotation', 'bone-head', 'rotation', 30, -2),
  keyframe('idle-cape-0', 'track-cape-rotation', 'bone-cape', 'rotation', 0, 100),
  keyframe('idle-cape-10', 'track-cape-rotation', 'bone-cape', 'rotation', 10, 106),
  keyframe('idle-cape-22', 'track-cape-rotation', 'bone-cape', 'rotation', 22, 96),
  keyframe('idle-cape-30', 'track-cape-rotation', 'bone-cape', 'rotation', 30, 100)
]

const runKeyframes: EditorKeyframe[] = [
  keyframe('run-root-0', 'track-root-y', 'bone-root', 'y', 0, 168),
  keyframe('run-root-6', 'track-root-y', 'bone-root', 'y', 6, 158),
  keyframe('run-root-12', 'track-root-y', 'bone-root', 'y', 12, 168),
  keyframe('run-thigh-l-0', 'track-thigh-l-rotation', 'bone-thigh-l', 'rotation', 0, 58),
  keyframe('run-thigh-l-6', 'track-thigh-l-rotation', 'bone-thigh-l', 'rotation', 6, 126),
  keyframe('run-thigh-l-12', 'track-thigh-l-rotation', 'bone-thigh-l', 'rotation', 12, 58),
  keyframe('run-thigh-r-0', 'track-thigh-r-rotation', 'bone-thigh-r', 'rotation', 0, 122),
  keyframe('run-thigh-r-6', 'track-thigh-r-rotation', 'bone-thigh-r', 'rotation', 6, 54),
  keyframe('run-thigh-r-12', 'track-thigh-r-rotation', 'bone-thigh-r', 'rotation', 12, 122)
]

const waveKeyframes: EditorKeyframe[] = [
  keyframe('wave-arm-0', 'track-arm-l-rotation', 'bone-arm-l', 'rotation', 0, -156),
  keyframe('wave-arm-8', 'track-arm-l-rotation', 'bone-arm-l', 'rotation', 8, -84),
  keyframe('wave-arm-24', 'track-arm-l-rotation', 'bone-arm-l', 'rotation', 24, -84),
  keyframe('wave-arm-36', 'track-arm-l-rotation', 'bone-arm-l', 'rotation', 36, -156),
  keyframe('wave-forearm-0', 'track-forearm-l-rotation', 'bone-forearm-l', 'rotation', 0, -16),
  keyframe('wave-forearm-12', 'track-forearm-l-rotation', 'bone-forearm-l', 'rotation', 12, -48),
  keyframe('wave-forearm-18', 'track-forearm-l-rotation', 'bone-forearm-l', 'rotation', 18, 12),
  keyframe('wave-forearm-24', 'track-forearm-l-rotation', 'bone-forearm-l', 'rotation', 24, -48),
  keyframe('wave-forearm-36', 'track-forearm-l-rotation', 'bone-forearm-l', 'rotation', 36, -16)
]

const animations: Animation[] = [
  {
    id: 'animation-idle',
    name: 'Idle / breathing',
    duration: 30,
    fps: 30,
    loop: true,
    tracks: [
      {
        id: 'track-chest-y',
        name: 'chest · translate Y',
        targetId: 'bone-chest',
        property: 'y',
        color: '#61d4c5'
      },
      {
        id: 'track-head-rotation',
        name: 'head · rotation',
        targetId: 'bone-head',
        property: 'rotation',
        color: '#f6bd60'
      },
      {
        id: 'track-cape-rotation',
        name: 'cape · rotation',
        targetId: 'bone-cape',
        property: 'rotation',
        color: '#d478b3'
      }
    ],
    keyframes: idleKeyframes
  },
  {
    id: 'animation-run',
    name: 'Run cycle',
    duration: 12,
    fps: 24,
    loop: true,
    tracks: [
      {
        id: 'track-root-y',
        name: 'root · translate Y',
        targetId: 'bone-root',
        property: 'y',
        color: '#89a7ff'
      },
      {
        id: 'track-thigh-l-rotation',
        name: 'thigh L · rotation',
        targetId: 'bone-thigh-l',
        property: 'rotation',
        color: '#7ab4ff'
      },
      {
        id: 'track-thigh-r-rotation',
        name: 'thigh R · rotation',
        targetId: 'bone-thigh-r',
        property: 'rotation',
        color: '#9a8bff'
      }
    ],
    keyframes: runKeyframes
  },
  {
    id: 'animation-wave',
    name: 'Wave',
    duration: 36,
    fps: 30,
    loop: false,
    tracks: [
      {
        id: 'track-arm-l-rotation',
        name: 'upper arm L · rotation',
        targetId: 'bone-arm-l',
        property: 'rotation',
        color: '#ff8f9c'
      },
      {
        id: 'track-forearm-l-rotation',
        name: 'forearm L · rotation',
        targetId: 'bone-forearm-l',
        property: 'rotation',
        color: '#f29b69'
      }
    ],
    keyframes: waveKeyframes
  }
]

export const demoProject: EditorProject = {
  id: 'project-ember-scout',
  name: 'Ember Scout',
  skeletonName: 'scout_rig_v07',
  bones,
  slots,
  attachments,
  constraints,
  skins,
  animations,
  artwork: null,
  updatedAt: '2026-11-10T09:40:00.000Z'
}

export const createDemoProject = (): EditorProject => structuredClone(demoProject)
