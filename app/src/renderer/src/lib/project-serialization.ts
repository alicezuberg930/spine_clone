import type {
  Animation,
  Bone,
  EditorMode,
  EditorProject,
  EditorSelection,
  EditorState,
  EditorTool,
  PhysicsParams,
  TimelineView,
  Transform
} from '@/@types'

export const PROJECT_FILE_FORMAT = 'layerforge-project' as const
export const PROJECT_FILE_VERSION = 1 as const

export interface ProjectWorkspaceSnapshot {
  mode: EditorMode
  tool: EditorTool
  selection: EditorSelection | null
  selections: EditorSelection[]
  frame: number
  activeSkin: string
  activeAnimation: string
  timelineView: TimelineView
  zoom: number
  autoKey: boolean
  ghosting: boolean
  physicsEnabled: boolean
  view: {
    showBones: boolean
    showMesh: boolean
    showWeights: boolean
    showClipping: boolean
    showBounds: boolean
    showGrid: boolean
    snap: boolean
  }
}

export interface LayerforgeProjectFileV1 {
  format: typeof PROJECT_FILE_FORMAT
  version: typeof PROJECT_FILE_VERSION
  savedAt: string
  project: EditorProject
  workspace: ProjectWorkspaceSnapshot
}

const DEFAULT_RESTORED_TRANSFORM = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  shearX: 0,
  shearY: 0,
  opacity: 1
} as const

const DEFAULT_RESTORED_PHYSICS: PhysicsParams = {
  inertia: 72,
  strength: 54,
  damping: 38,
  mass: 1.2,
  wind: 8,
  gravity: 24
}

const EDITOR_MODES = new Set<EditorMode>(['setup', 'animate'])
const EDITOR_TOOLS = new Set<EditorTool>([
  'select',
  'translate',
  'rotate',
  'scale',
  'shear',
  'pose',
  'create-bone',
  'mesh',
  'deform',
  'weights',
  'clipping',
  'bounds'
])
const TIMELINE_VIEWS = new Set<TimelineView>(['dopesheet', 'graph', 'audio'])
const SELECTION_KINDS = new Set<EditorSelection['kind']>([
  'skeleton',
  'bone',
  'slot',
  'attachment',
  'constraint',
  'bounding-box',
  'animation',
  'skin',
  'artwork-layer',
  'audio'
])

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertRecord(value: unknown, label: string): asserts value is UnknownRecord {
  if (!isRecord(value)) throw new Error(`${label} is missing or invalid.`)
}

function assertString(value: unknown, label: string, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    throw new Error(`${label} is missing or invalid.`)
  }
}

function assertFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} is missing or invalid.`)
  }
}

function assertBoolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} is missing or invalid.`)
}

function assertArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} is missing or invalid.`)
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  assertArray(value, label)
  value.forEach((item, index) => assertString(item, `${label}[${index}]`))
}

function assertPoint(value: unknown, label: string): void {
  assertRecord(value, label)
  assertFiniteNumber(value.x, `${label}.x`)
  assertFiniteNumber(value.y, `${label}.y`)
}

function assertPhysics(value: unknown, label: string): void {
  assertRecord(value, label)
  ;(['inertia', 'strength', 'damping', 'mass', 'wind', 'gravity'] as const).forEach((property) =>
    assertFiniteNumber(value[property], `${label}.${property}`)
  )
}

function assertTransform(value: unknown, label: string): void {
  assertRecord(value, label)
  ;(['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity'] as const).forEach((property) =>
    assertFiniteNumber(value[property], `${label}.${property}`)
  )
  if (value.shearX !== undefined) assertFiniteNumber(value.shearX, `${label}.shearX`)
  if (value.shearY !== undefined) assertFiniteNumber(value.shearY, `${label}.shearY`)
}

function assertEntityHeader(value: unknown, label: string): asserts value is UnknownRecord {
  assertRecord(value, label)
  assertString(value.id, `${label}.id`)
  assertString(value.name, `${label}.name`)
}

function assertBones(value: unknown): void {
  assertArray(value, 'project.bones')
  value.forEach((bone, index) => {
    const label = `project.bones[${index}]`
    assertEntityHeader(bone, label)
    if (bone.parentId !== null) assertString(bone.parentId, `${label}.parentId`)
    assertFiniteNumber(bone.length, `${label}.length`)
    assertString(bone.color, `${label}.color`)
    assertTransform(bone.transform, `${label}.transform`)
  })
}

function assertSlots(value: unknown): void {
  assertArray(value, 'project.slots')
  value.forEach((slot, index) => {
    const label = `project.slots[${index}]`
    assertEntityHeader(slot, label)
    assertString(slot.boneId, `${label}.boneId`)
    assertStringArray(slot.attachmentIds, `${label}.attachmentIds`)
    assertString(slot.activeAttachmentId, `${label}.activeAttachmentId`, true)
    assertFiniteNumber(slot.drawOrder, `${label}.drawOrder`)
  })
}

function assertAttachments(value: unknown): void {
  assertArray(value, 'project.attachments')
  value.forEach((attachment, index) => {
    const label = `project.attachments[${index}]`
    assertEntityHeader(attachment, label)
    assertString(attachment.slotId, `${label}.slotId`)
    if (!['region', 'mesh', 'clipping', 'bounding-box', 'path'].includes(String(attachment.type))) {
      throw new Error(`${label}.type is invalid.`)
    }
    assertString(attachment.color, `${label}.color`)
    assertFiniteNumber(attachment.width, `${label}.width`)
    assertFiniteNumber(attachment.height, `${label}.height`)
    if (attachment.vertices !== undefined) {
      assertArray(attachment.vertices, `${label}.vertices`)
      attachment.vertices.forEach((point, pointIndex) =>
        assertPoint(point, `${label}.vertices[${pointIndex}]`)
      )
    }
  })
}

function assertConstraints(value: unknown): void {
  assertArray(value, 'project.constraints')
  value.forEach((constraint, index) => {
    const label = `project.constraints[${index}]`
    assertEntityHeader(constraint, label)
    if (!['physics', 'ik', 'transform', 'path', 'slider'].includes(String(constraint.type))) {
      throw new Error(`${label}.type is invalid.`)
    }
    assertStringArray(constraint.boneIds, `${label}.boneIds`)
    assertFiniteNumber(constraint.mix, `${label}.mix`)
    if (constraint.physics !== undefined) assertPhysics(constraint.physics, `${label}.physics`)
    if (constraint.targetPosition !== undefined)
      assertPoint(constraint.targetPosition, `${label}.targetPosition`)
  })
}

function assertSkins(value: unknown): void {
  assertArray(value, 'project.skins')
  if (value.length === 0) throw new Error('project.skins must contain at least one skin.')
  value.forEach((skin, index) => {
    const label = `project.skins[${index}]`
    assertEntityHeader(skin, label)
    assertString(skin.accent, `${label}.accent`)
    assertStringArray(skin.attachmentIds, `${label}.attachmentIds`)
  })
}

function assertKeyframes(value: unknown, label: string): void {
  assertArray(value, label)
  value.forEach((keyframe, index) => {
    const keyLabel = `${label}[${index}]`
    assertRecord(keyframe, keyLabel)
    assertString(keyframe.id, `${keyLabel}.id`)
    assertString(keyframe.trackId, `${keyLabel}.trackId`)
    assertString(keyframe.targetId, `${keyLabel}.targetId`)
    assertString(keyframe.property, `${keyLabel}.property`)
    assertFiniteNumber(keyframe.frame, `${keyLabel}.frame`)
    if (!['linear', 'stepped', 'bezier'].includes(String(keyframe.interpolation))) {
      throw new Error(`${keyLabel}.interpolation is invalid.`)
    }
    if (keyframe.value === undefined) throw new Error(`${keyLabel}.value is missing or invalid.`)
  })
}

function assertAnimations(value: unknown): void {
  assertArray(value, 'project.animations')
  if (value.length === 0) throw new Error('project.animations must contain at least one animation.')
  value.forEach((animation, index) => {
    const label = `project.animations[${index}]`
    assertEntityHeader(animation, label)
    assertFiniteNumber(animation.duration, `${label}.duration`)
    assertFiniteNumber(animation.fps, `${label}.fps`)
    if (animation.duration < 0 || animation.fps <= 0) throw new Error(`${label} timing is invalid.`)
    assertBoolean(animation.loop, `${label}.loop`)
    assertArray(animation.tracks, `${label}.tracks`)
    animation.tracks.forEach((track, trackIndex) => {
      const trackLabel = `${label}.tracks[${trackIndex}]`
      assertEntityHeader(track, trackLabel)
      assertString(track.targetId, `${trackLabel}.targetId`)
      assertString(track.property, `${trackLabel}.property`)
      assertString(track.color, `${trackLabel}.color`)
    })
    assertKeyframes(animation.keyframes, `${label}.keyframes`)
  })
}

function assertArtwork(value: unknown): void {
  if (value === null) return
  assertRecord(value, 'project.artwork')
  assertString(value.id, 'project.artwork.id')
  assertString(value.name, 'project.artwork.name')
  if (value.sourceType !== 'psd' && value.sourceType !== 'images') {
    throw new Error('project.artwork.sourceType is invalid.')
  }
  assertFiniteNumber(value.width, 'project.artwork.width')
  assertFiniteNumber(value.height, 'project.artwork.height')
  assertString(value.importedAt, 'project.artwork.importedAt')
  assertArray(value.layers, 'project.artwork.layers')
  value.layers.forEach((layer, index) => {
    const label = `project.artwork.layers[${index}]`
    assertEntityHeader(layer, label)
    assertStringArray(layer.groupPath, `${label}.groupPath`)
    assertString(layer.dataUrl, `${label}.dataUrl`, true)
    ;(['x', 'y', 'width', 'height', 'opacity', 'order'] as const).forEach((property) =>
      assertFiniteNumber(layer[property], `${label}.${property}`)
    )
    assertBoolean(layer.visible, `${label}.visible`)
    assertString(layer.blendMode, `${label}.blendMode`)
    assertString(layer.sourceFileName, `${label}.sourceFileName`)
    if (layer.boneId !== undefined) assertString(layer.boneId, `${label}.boneId`)
    if (layer.boneBindPose !== undefined) {
      assertArray(layer.boneBindPose, `${label}.boneBindPose`)
      if (layer.boneBindPose.length !== 6)
        throw new Error(`${label}.boneBindPose is missing or invalid.`)
      layer.boneBindPose.forEach((entry, matrixIndex) =>
        assertFiniteNumber(entry, `${label}.boneBindPose[${matrixIndex}]`)
      )
    }
    if (layer.mesh !== undefined) {
      assertRecord(layer.mesh, `${label}.mesh`)
      assertArray(layer.mesh.vertices, `${label}.mesh.vertices`)
      assertArray(layer.mesh.triangles, `${label}.mesh.triangles`)
    }
    if (layer.clipping !== undefined) {
      assertRecord(layer.clipping, `${label}.clipping`)
      assertArray(layer.clipping.vertices, `${label}.clipping.vertices`)
    }
  })
}

function assertAudioTracks(value: unknown): void {
  assertArray(value, 'project.audioTracks')
  value.forEach((track, index) => {
    const label = `project.audioTracks[${index}]`
    assertEntityHeader(track, label)
    ;(['sourceFileName', 'mimeType', 'dataUrl'] as const).forEach((property) =>
      assertString(track[property], `${label}.${property}`)
    )
    ;(
      ['sizeBytes', 'durationSeconds', 'sampleRate', 'channels', 'startFrame', 'volume'] as const
    ).forEach((property) => assertFiniteNumber(track[property], `${label}.${property}`))
    assertBoolean(track.muted, `${label}.muted`)
    assertArray(track.waveform, `${label}.waveform`)
    track.waveform.forEach((entry, waveformIndex) =>
      assertFiniteNumber(entry, `${label}.waveform[${waveformIndex}]`)
    )
  })
}

function validatedProject(value: unknown): EditorProject {
  assertRecord(value, 'project')
  assertString(value.id, 'project.id')
  assertString(value.name, 'project.name')
  assertString(value.skeletonName, 'project.skeletonName')
  assertRecord(value.canvas, 'project.canvas')
  assertFiniteNumber(value.canvas.width, 'project.canvas.width')
  assertFiniteNumber(value.canvas.height, 'project.canvas.height')
  if (value.canvas.width <= 0 || value.canvas.height <= 0)
    throw new Error('project.canvas dimensions are invalid.')
  if (
    value.boneSpace !== undefined &&
    value.boneSpace !== 'legacy' &&
    value.boneSpace !== 'canvas'
  ) {
    throw new Error('project.boneSpace is missing or invalid.')
  }
  assertBones(value.bones)
  assertSlots(value.slots)
  assertAttachments(value.attachments)
  assertConstraints(value.constraints)
  assertSkins(value.skins)
  assertAnimations(value.animations)
  assertArtwork(value.artwork)
  assertAudioTracks(value.audioTracks)
  assertString(value.updatedAt, 'project.updatedAt')

  const project = structuredClone(value) as unknown as EditorProject
  project.boneSpace = value.boneSpace === 'canvas' ? 'canvas' : 'legacy'
  project.bones = project.bones.map((bone) => ({
    ...bone,
    transform: {
      ...DEFAULT_RESTORED_TRANSFORM,
      ...bone.transform,
      shearX: bone.transform.shearX ?? 0,
      shearY: bone.transform.shearY ?? 0
    }
  }))
  return project
}

function validatedSelection(value: unknown): EditorSelection | null {
  if (!isRecord(value) || !SELECTION_KINDS.has(value.kind as EditorSelection['kind'])) return null
  if (typeof value.id !== 'string' || value.id.length === 0) return null
  return { kind: value.kind as EditorSelection['kind'], id: value.id }
}

function selectionExists(selection: EditorSelection, project: EditorProject): boolean {
  switch (selection.kind) {
    case 'bone':
      return project.bones.some((bone) => bone.id === selection.id)
    case 'slot':
      return project.slots.some((slot) => slot.id === selection.id)
    case 'attachment':
      return project.attachments.some((attachment) => attachment.id === selection.id)
    case 'bounding-box':
      return project.attachments.some(
        (attachment) => attachment.id === selection.id && attachment.type === 'bounding-box'
      )
    case 'constraint':
      return project.constraints.some((constraint) => constraint.id === selection.id)
    case 'animation':
      return project.animations.some((animation) => animation.id === selection.id)
    case 'skin':
      return project.skins.some((skin) => skin.id === selection.id)
    case 'artwork-layer':
      return project.artwork?.layers.some((layer) => layer.id === selection.id) ?? false
    case 'audio':
      return project.audioTracks.some((track) => track.id === selection.id)
    case 'skeleton':
      return true
  }
}

function validatedWorkspace(value: unknown): UnknownRecord {
  assertRecord(value, 'workspace')
  assertRecord(value.view, 'workspace.view')
  return value
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function physicsForProject(project: EditorProject): PhysicsParams {
  const physics = project.constraints.find(
    (constraint) => constraint.type === 'physics' && constraint.physics
  )?.physics
  return physics ? structuredClone(physics) : { ...DEFAULT_RESTORED_PHYSICS }
}

function selectedTransform(project: EditorProject, selection: EditorSelection | null): Transform {
  const bone =
    selection?.kind === 'bone'
      ? project.bones.find((candidate) => candidate.id === selection.id)
      : undefined
  return bone ? structuredClone(bone.transform) : { ...DEFAULT_RESTORED_TRANSFORM }
}

function currentTimestamp(savedAt?: string): string {
  if (!savedAt) return new Date().toISOString()
  const timestamp = new Date(savedAt)
  if (Number.isNaN(timestamp.valueOf())) throw new Error('The project save timestamp is invalid.')
  return timestamp.toISOString()
}

export function createProjectSnapshot(state: EditorState, savedAt?: string): EditorProject {
  const timestamp = currentTimestamp(savedAt)
  const project = structuredClone(state.project)
  const activeAnimation = project.animations.find(
    (animation) => animation.id === state.activeAnimation
  )

  if (activeAnimation) {
    activeAnimation.fps = state.fps
    activeAnimation.duration = state.duration
    activeAnimation.loop = state.loop
    activeAnimation.keyframes = structuredClone(state.keyframes)
  }

  project.updatedAt = timestamp
  return project
}

export function createProjectFile(state: EditorState, savedAt?: string): LayerforgeProjectFileV1 {
  const timestamp = currentTimestamp(savedAt)

  return {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION,
    savedAt: timestamp,
    project: createProjectSnapshot(state, timestamp),
    workspace: {
      mode: state.mode,
      tool: state.tool,
      selection: state.selection ? structuredClone(state.selection) : null,
      selections: structuredClone(state.selections),
      frame: state.frame,
      activeSkin: state.activeSkin,
      activeAnimation: state.activeAnimation,
      timelineView: state.timelineView,
      zoom: state.zoom,
      autoKey: state.autoKey,
      ghosting: state.ghosting,
      physicsEnabled: state.physicsEnabled,
      view: {
        showBones: state.showBones,
        showMesh: state.showMesh,
        showWeights: state.showWeights,
        showClipping: state.showClipping,
        showBounds: state.showBounds,
        showGrid: state.showGrid,
        snap: state.snap
      }
    }
  }
}

export function serializeProject(state: EditorState, savedAt?: string): string {
  return `${JSON.stringify(createProjectFile(state, savedAt), null, 2)}\n`
}

/**
 * Parses and validates a self-contained Layerforge project, then restores the
 * durable editor workspace. Transient interaction state is intentionally reset
 * so opening a file can never resume playback or a half-finished geometry edit.
 */
export function deserializeProject(contents: string): EditorState {
  if (typeof contents !== 'string' || contents.trim().length === 0) {
    throw new Error('The project file is empty.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(contents) as unknown
  } catch {
    throw new Error('The project file is not valid JSON.')
  }

  assertRecord(parsed, 'project file')
  if (parsed.format !== PROJECT_FILE_FORMAT) {
    throw new Error('The selected file is not a Layerforge project.')
  }
  if (parsed.version !== PROJECT_FILE_VERSION) {
    throw new Error(`Project version ${String(parsed.version)} is not supported.`)
  }
  assertString(parsed.savedAt, 'savedAt')
  if (Number.isNaN(new Date(parsed.savedAt).valueOf())) {
    throw new Error('The project save timestamp is invalid.')
  }

  const project = validatedProject(parsed.project)
  const workspace = validatedWorkspace(parsed.workspace)
  if (workspace.selections !== undefined) {
    assertArray(workspace.selections, 'workspace.selections')
  }

  const requestedAnimation =
    typeof workspace.activeAnimation === 'string' ? workspace.activeAnimation : ''
  const animation: Animation =
    project.animations.find((candidate) => candidate.id === requestedAnimation) ??
    project.animations[0]
  const requestedSkin = typeof workspace.activeSkin === 'string' ? workspace.activeSkin : ''
  const activeSkin =
    project.skins.find((candidate) => candidate.id === requestedSkin)?.id ?? project.skins[0].id

  const savedSelections = (workspace.selections ?? [])
    .map(validatedSelection)
    .filter((selection): selection is EditorSelection => Boolean(selection))
    .filter((selection) => selectionExists(selection, project))
  const requestedSelection = validatedSelection(workspace.selection)
  const validRequestedSelection =
    requestedSelection && selectionExists(requestedSelection, project) ? requestedSelection : null
  const fallbackSelection: EditorSelection | null = project.bones[0]
    ? { kind: 'bone', id: project.bones[0].id }
    : null
  const selection = validRequestedSelection ?? savedSelections[0] ?? fallbackSelection
  const uniqueSelections = new Map<string, EditorSelection>()
  if (selection) uniqueSelections.set(`${selection.kind}:${selection.id}`, selection)
  savedSelections.forEach((candidate) =>
    uniqueSelections.set(`${candidate.kind}:${candidate.id}`, candidate)
  )
  const selections = [...uniqueSelections.values()]
  const frame = clamp(Math.round(numberOr(workspace.frame, 0)), 0, animation.duration)
  const view = workspace.view as UnknownRecord
  const rootBone = project.bones.find((bone: Bone) => bone.parentId === null) ?? project.bones[0]

  return {
    project,
    mode: EDITOR_MODES.has(workspace.mode as EditorMode) ? (workspace.mode as EditorMode) : 'setup',
    tool: EDITOR_TOOLS.has(workspace.tool as EditorTool)
      ? (workspace.tool as EditorTool)
      : 'select',
    selection,
    selections,
    frame,
    fps: animation.fps,
    duration: animation.duration,
    isPlaying: false,
    loop: animation.loop,
    autoKey: booleanOr(workspace.autoKey, false),
    ghosting: booleanOr(workspace.ghosting, false),
    showBones: booleanOr(view.showBones, true),
    showMesh: booleanOr(view.showMesh, false),
    showWeights: booleanOr(view.showWeights, false),
    showClipping: booleanOr(view.showClipping, false),
    showBounds: booleanOr(view.showBounds, false),
    showGrid: booleanOr(view.showGrid, true),
    snap: booleanOr(view.snap, false),
    physicsEnabled: booleanOr(workspace.physicsEnabled, true),
    zoom: clamp(numberOr(workspace.zoom, 1), 0.25, 4),
    timelineView: TIMELINE_VIEWS.has(workspace.timelineView as TimelineView)
      ? (workspace.timelineView as TimelineView)
      : 'dopesheet',
    activeSkin,
    activeAnimation: animation.id,
    geometrySelection: null,
    weightBrush: {
      boneId: rootBone?.id ?? null,
      radius: 90,
      strength: 0.35,
      mode: 'add'
    },
    transform: selectedTransform(project, selection),
    physics: physicsForProject(project),
    keyframes: structuredClone(animation.keyframes)
  }
}
