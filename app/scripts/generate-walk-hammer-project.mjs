import { readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const appDirectory = resolve(scriptDirectory, '..')
const manifestPath = resolve(
  process.argv[2] ?? resolve(appDirectory, 'test-fixtures/layers/test.layers.json')
)
const outputArgument =
  process.argv[3] ?? resolve(appDirectory, 'test-fixtures/layers/test-walk-hammer.lfproj')
const outputPath = isAbsolute(outputArgument) ? outputArgument : resolve(appDirectory, outputArgument)
const manifestDirectory = dirname(manifestPath)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

function pngDimensions(buffer, fileName) {
  const pngSignature = '89504e470d0a1a0a'
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error(`${fileName} is not a readable PNG file.`)
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  }
}

function fileStem(fileName) {
  return basename(fileName).replace(/\.[^.]+$/u, '')
}

function slug(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
}

const ROOT_BONE_ID = 'bone-character-root'
const LEFT_LEG_BONE_ID = 'bone-left-leg'
const RIGHT_LEG_BONE_ID = 'bone-right-leg'
const HAMMER_BONE_ID = 'bone-hammer-arm'

const rootSetup = { x: 2150, y: 1650 }
const leftLegSetup = { x: -285, y: 250, rotation: 90 }
const rightLegSetup = { x: 150, y: 250, rotation: 90 }
const hammerSetup = { x: -620, y: -200, rotation: 166 }

const identityTransform = (x, y, rotation = 0) => ({
  x,
  y,
  rotation,
  scaleX: 1,
  scaleY: 1,
  shearX: 0,
  shearY: 0,
  opacity: 1
})

function matrixFromTransform(transform) {
  const radians = (transform.rotation * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return [cosine, sine, -sine, cosine, transform.x, transform.y]
}

function multiplyMatrices(left, right) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5]
  ]
}

const rootBindPose = matrixFromTransform(identityTransform(rootSetup.x, rootSetup.y))
const leftLegBindPose = multiplyMatrices(
  rootBindPose,
  matrixFromTransform(identityTransform(leftLegSetup.x, leftLegSetup.y, leftLegSetup.rotation))
)
const rightLegBindPose = multiplyMatrices(
  rootBindPose,
  matrixFromTransform(identityTransform(rightLegSetup.x, rightLegSetup.y, rightLegSetup.rotation))
)
const hammerBindPose = multiplyMatrices(
  rootBindPose,
  matrixFromTransform(identityTransform(hammerSetup.x, hammerSetup.y, hammerSetup.rotation))
)

const leftLegLayers = new Set(['chan trai', 'ban chan trai'])
const rightLegLayers = new Set(['chan phai', 'ban chan phai'])
const hammerLayers = new Set(['bua_front', 'ban tay', 'ngon tay', 'Layer 78'])

function bindingForLayer(name) {
  if (leftLegLayers.has(name)) {
    return { boneId: LEFT_LEG_BONE_ID, boneBindPose: leftLegBindPose }
  }
  if (rightLegLayers.has(name)) {
    return { boneId: RIGHT_LEG_BONE_ID, boneBindPose: rightLegBindPose }
  }
  if (hammerLayers.has(name)) {
    return { boneId: HAMMER_BONE_ID, boneBindPose: hammerBindPose }
  }
  return { boneId: ROOT_BONE_ID, boneBindPose: rootBindPose }
}

const layers = manifest.layers.map((layer, index) => {
  const sourcePath = resolve(manifestDirectory, layer.file)
  const bytes = readFileSync(sourcePath)
  const source = pngDimensions(bytes, layer.file)
  const scale = Number.isFinite(layer.scale) ? layer.scale : 1
  const name = layer.name ?? fileStem(layer.file)

  return {
    id: `artwork-layer-${slug(name)}`,
    name,
    groupPath: [manifest.groupName ?? manifest.name ?? 'Artwork'],
    dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
    x: layer.x,
    y: layer.y,
    width: layer.width ?? Math.round(source.width * scale),
    height: layer.height ?? Math.round(source.height * scale),
    opacity: layer.opacity ?? 1,
    visible: layer.visible !== false,
    blendMode: layer.blendMode ?? 'normal',
    order: index,
    sourceFileName: 'test.psd',
    ...bindingForLayer(name)
  }
})

const bones = [
  {
    id: ROOT_BONE_ID,
    name: 'Character root',
    parentId: null,
    length: 360,
    color: '#45d6bd',
    transform: identityTransform(rootSetup.x, rootSetup.y)
  },
  {
    id: LEFT_LEG_BONE_ID,
    name: 'Left leg',
    parentId: ROOT_BONE_ID,
    length: 650,
    color: '#86a9ff',
    transform: identityTransform(leftLegSetup.x, leftLegSetup.y, leftLegSetup.rotation)
  },
  {
    id: RIGHT_LEG_BONE_ID,
    name: 'Right leg',
    parentId: ROOT_BONE_ID,
    length: 650,
    color: '#de84ef',
    transform: identityTransform(rightLegSetup.x, rightLegSetup.y, rightLegSetup.rotation)
  },
  {
    id: HAMMER_BONE_ID,
    name: 'Hammer arm',
    parentId: ROOT_BONE_ID,
    length: 760,
    color: '#f4b85a',
    transform: identityTransform(hammerSetup.x, hammerSetup.y, hammerSetup.rotation)
  }
]

const trackDefinitions = [
  ['track-root-x', 'Forward movement', ROOT_BONE_ID, 'x', '#45d6bd'],
  ['track-root-y', 'Body bounce', ROOT_BONE_ID, 'y', '#56e4cd'],
  ['track-root-rotation', 'Body lean', ROOT_BONE_ID, 'rotation', '#68ead6'],
  ['track-left-leg-rotation', 'Left leg stride', LEFT_LEG_BONE_ID, 'rotation', '#86a9ff'],
  ['track-right-leg-rotation', 'Right leg stride', RIGHT_LEG_BONE_ID, 'rotation', '#de84ef'],
  ['track-hammer-rotation', 'Hammer swing', HAMMER_BONE_ID, 'rotation', '#f4b85a']
]

const tracks = trackDefinitions.map(([id, name, targetId, property, color]) => ({
  id,
  name,
  targetId,
  property,
  color
}))

const keyframes = []
function addKeys(trackId, targetId, property, values, interpolation = 'bezier') {
  values.forEach(([frame, value], index) => {
    keyframes.push({
      id: `key-${slug(trackId)}-${index}`,
      trackId,
      targetId,
      property,
      frame,
      value,
      interpolation
    })
  })
}

addKeys(
  'track-root-x',
  ROOT_BONE_ID,
  'x',
  [
    [0, 2150],
    [24, 2070],
    [48, 1990],
    [72, 1910],
    [96, 1830]
  ],
  'linear'
)
addKeys(
  'track-root-y',
  ROOT_BONE_ID,
  'y',
  Array.from({ length: 17 }, (_, index) => [index * 6, index % 2 === 0 ? 1650 : 1626])
)
addKeys('track-root-rotation', ROOT_BONE_ID, 'rotation', [
  [0, -2],
  [24, 2],
  [48, -2],
  [72, 2],
  [96, -2]
])
addKeys('track-left-leg-rotation', LEFT_LEG_BONE_ID, 'rotation', [
  [0, 72],
  [12, 90],
  [24, 108],
  [36, 90],
  [48, 72],
  [60, 90],
  [72, 108],
  [84, 90],
  [96, 72]
])
addKeys('track-right-leg-rotation', RIGHT_LEG_BONE_ID, 'rotation', [
  [0, 108],
  [12, 90],
  [24, 72],
  [36, 90],
  [48, 108],
  [60, 90],
  [72, 72],
  [84, 90],
  [96, 108]
])
addKeys('track-hammer-rotation', HAMMER_BONE_ID, 'rotation', [
  [0, 166],
  [18, 148],
  [36, 178],
  [54, 152],
  [72, 176],
  [96, 166]
])

const timestamp = new Date().toISOString()
const projectFile = {
  format: 'layerforge-project',
  version: 1,
  savedAt: timestamp,
  project: {
    id: 'project-test-walk-hammer',
    name: 'Test Character - Walk and Hammer',
    skeletonName: 'Test character rig',
    canvas: { width: manifest.width, height: manifest.height },
    boneSpace: 'canvas',
    bones,
    slots: [],
    attachments: [],
    constraints: [],
    skins: [
      {
        id: 'skin-default',
        name: 'Default',
        accent: '#45d6bd',
        attachmentIds: []
      }
    ],
    animations: [
      {
        id: 'animation-walk-hammer',
        name: 'Walk and hammer',
        duration: 96,
        fps: 24,
        loop: false,
        tracks,
        keyframes
      }
    ],
    artwork: {
      id: 'artwork-document-test-psd',
      name: manifest.name ?? 'test',
      sourceType: 'psd',
      width: manifest.width,
      height: manifest.height,
      layers,
      importedAt: timestamp
    },
    audioTracks: [],
    updatedAt: timestamp
  },
  workspace: {
    mode: 'animate',
    tool: 'select',
    selection: { kind: 'bone', id: ROOT_BONE_ID },
    selections: [{ kind: 'bone', id: ROOT_BONE_ID }],
    frame: 0,
    activeSkin: 'skin-default',
    activeAnimation: 'animation-walk-hammer',
    timelineView: 'dopesheet',
    zoom: 1,
    autoKey: false,
    ghosting: true,
    physicsEnabled: false,
    view: {
      showBones: true,
      showMesh: false,
      showWeights: false,
      showClipping: false,
      showBounds: false,
      showGrid: true,
      snap: false
    }
  }
}

writeFileSync(outputPath, `${JSON.stringify(projectFile, null, 2)}\n`)
process.stdout.write(
  `${outputPath}\n${layers.length} layers, ${bones.length} bones, ${keyframes.length} keyframes\n`
)
