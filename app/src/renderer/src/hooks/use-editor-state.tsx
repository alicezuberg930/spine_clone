/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  useContext,
  useMemo,
  useReducer
} from 'react'
import { createEmptyProject, DEFAULT_PHYSICS, DEFAULT_TRANSFORM } from '@/lib/editor-defaults'
import type {
  Animation,
  Attachment,
  ArtworkDocument,
  ArtworkLayer,
  ArtworkClipping,
  ArtworkMesh,
  AudioTrack,
  Bone,
  BoneDeletionMode,
  Constraint,
  EditorKeyframe,
  EditorMode,
  EditorProject,
  EditorSelection,
  EditorState,
  EditorTool,
  GeometrySelection,
  KeyframeValue,
  MeshDeformValue,
  Point,
  PhysicsParams,
  Skin,
  Slot,
  TimelineView,
  Transform,
  ViewFlag,
  WeightBrush
} from '@/@types'
import {
  createDefaultClipping,
  createGridMesh,
  interpolateDeformation,
  normalizeVertexWeights,
  paintMeshWeights
} from '@/lib/mesh-geometry'
import {
  artworkContentBounds,
  createBoneFromWorldSegment,
  fitBonesToBounds,
  resolveBoneWorldMatrices
} from '@/lib/skeleton-geometry'
import { deleteBoneFromEditorState } from '@/lib/bone-deletion'
import { boneNameValidationError, normalizeBoneName } from '@/lib/bone-naming'
import {
  activateAnimation,
  createAnimation,
  deleteAnimation,
  renameAnimation
} from '@/lib/animation-management'

function updateArtworkLayer(
  project: EditorProject,
  layerId: string,
  update: (layer: ArtworkLayer) => ArtworkLayer
): EditorProject {
  if (!project.artwork) return project
  let changed = false
  const layers = project.artwork.layers.map((layer) => {
    if (layer.id !== layerId) return layer
    changed = true
    return update(layer)
  })
  if (!changed) return project
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    artwork: { ...project.artwork, layers }
  }
}

function isMeshDeformValue(value: KeyframeValue): value is MeshDeformValue {
  return Boolean(
    typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'mesh-deform'
  )
}

export function evaluateLayerDeformation(
  keyframes: EditorKeyframe[],
  layerId: string,
  frame: number
): MeshDeformValue['offsets'] {
  const keys = keyframes
    .filter(
      (keyframe) =>
        keyframe.targetId === layerId &&
        keyframe.property === 'deform' &&
        isMeshDeformValue(keyframe.value)
    )
    .sort((left, right) => left.frame - right.frame)
  if (keys.length === 0) return {}

  const previous = [...keys].reverse().find((keyframe) => keyframe.frame <= frame)
  const next = keys.find((keyframe) => keyframe.frame >= frame)
  if (!previous) return {}
  if (!next || next.frame === previous.frame || previous.interpolation === 'stepped') {
    return structuredClone((previous.value as MeshDeformValue).offsets)
  }
  return interpolateDeformation(
    (previous.value as MeshDeformValue).offsets,
    (next.value as MeshDeformValue).offsets,
    (frame - previous.frame) / (next.frame - previous.frame)
  )
}

export const createInitialEditorState = (): EditorState => {
  const project = createEmptyProject()
  const animation = project.animations[0]

  return {
    project,
    mode: 'setup',
    tool: 'select',
    selection: null,
    selections: [],
    frame: 0,
    fps: animation.fps,
    duration: animation.duration,
    isPlaying: false,
    loop: animation.loop,
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
    activeSkin: project.skins[0].id,
    activeAnimation: animation.id,
    geometrySelection: null,
    weightBrush: { boneId: null, radius: 90, strength: 0.35, mode: 'add' },
    transform: { ...DEFAULT_TRANSFORM },
    physics: { ...DEFAULT_PHYSICS },
    keyframes: structuredClone(animation.keyframes)
  }
}

type EditorAction =
  | { type: 'load-project'; state: EditorState }
  | { type: 'set-mode'; mode: EditorMode }
  | { type: 'set-tool'; tool: EditorTool }
  | { type: 'set-selection'; selection: EditorSelection | null }
  | { type: 'set-selections'; selections: EditorSelection[] }
  | { type: 'set-frame'; frame: number }
  | { type: 'set-fps'; fps: number }
  | { type: 'set-duration'; duration: number }
  | { type: 'set-playing'; isPlaying: boolean }
  | { type: 'set-loop'; loop: boolean }
  | { type: 'set-auto-key'; autoKey: boolean }
  | { type: 'set-ghosting'; ghosting: boolean }
  | { type: 'toggle-view-flag'; flag: ViewFlag }
  | { type: 'set-physics-enabled'; enabled: boolean }
  | { type: 'set-zoom'; zoom: number }
  | { type: 'set-timeline-view'; view: TimelineView }
  | { type: 'set-active-skin'; id: string }
  | { type: 'set-active-animation'; id: string }
  | { type: 'create-animation'; name: string }
  | { type: 'rename-animation'; id: string; name: string }
  | { type: 'delete-animation'; id: string }
  | { type: 'configure-project'; name: string; width: number; height: number; fps: number }
  | { type: 'set-artwork'; artwork: ArtworkDocument }
  | { type: 'create-bone'; parentId: string | null; start: Point; end: Point }
  | { type: 'rename-bone'; id: string; name: string }
  | { type: 'delete-bone'; id: string; mode: BoneDeletionMode }
  | { type: 'toggle-artwork-layer'; id: string }
  | { type: 'bind-artwork-layer'; layerId: string; boneId: string | null }
  | { type: 'clear-artwork' }
  | { type: 'set-geometry-selection'; selection: GeometrySelection | null }
  | { type: 'set-weight-brush'; changes: Partial<WeightBrush> }
  | { type: 'set-artwork-mesh'; layerId: string; mesh: ArtworkMesh }
  | {
      type: 'move-artwork-mesh-vertices'
      layerId: string
      changes: Array<{ id: string; position: Point }>
    }
  | {
      type: 'set-artwork-deformation'
      layerId: string
      offsets: MeshDeformValue['offsets']
    }
  | { type: 'reset-artwork-deformation'; layerId: string }
  | { type: 'set-artwork-clipping'; layerId: string; clipping: ArtworkClipping }
  | {
      type: 'move-artwork-clipping-vertices'
      layerId: string
      changes: Array<{ id: string; position: Point }>
    }
  | { type: 'update-artwork-clipping'; layerId: string; changes: Partial<ArtworkClipping> }
  | { type: 'paint-artwork-weights'; layerId: string; point: Point }
  | { type: 'set-vertex-weight'; layerId: string; vertexId: string; boneId: string; value: number }
  | { type: 'add-clip-vertex'; layerId: string; afterVertexId: string; point: Point }
  | { type: 'remove-geometry-vertices'; layerId: string; kind: 'mesh' | 'clip'; ids: string[] }
  | { type: 'add-audio-track'; track: AudioTrack }
  | { type: 'update-audio-track'; id: string; changes: Partial<AudioTrack> }
  | { type: 'remove-audio-track'; id: string }
  | { type: 'update-transform'; changes: Partial<Transform> }
  | { type: 'reset-transform' }
  | { type: 'update-physics'; changes: Partial<PhysicsParams> }
  | { type: 'update-constraint'; id: string; changes: Partial<Constraint> }
  | {
      type: 'upsert-keyframe'
      keyframe: Omit<EditorKeyframe, 'id'> & { id?: string }
    }
  | { type: 'move-keyframe'; id: string; frame: number }
  | { type: 'remove-keyframe'; id: string }

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value))

const keyframeId = (targetId: string, property: string, frame: number): string =>
  `key-${targetId}-${property}-${frame}`

const createdBoneColors = ['#67e8d0', '#89a7ff', '#f6c56f', '#ff8f9c', '#a58dff']

function nextBoneIdentity(bones: readonly Bone[]): { id: string; name: string; color: string } {
  let number = bones.length + 1
  while (bones.some((bone) => bone.id === `bone-${number}` || bone.name === `bone ${number}`)) {
    number += 1
  }
  return {
    id: `bone-${number}`,
    name: `bone ${number}`,
    color: createdBoneColors[(number - 1) % createdBoneColors.length]
  }
}

const upsertTransformKeys = (state: EditorState, changes: Partial<Transform>): EditorKeyframe[] => {
  if (state.mode !== 'animate' || !state.autoKey || !state.selection) return state.keyframes

  const keyframes = [...state.keyframes]
  const targetId = state.selection.id

  Object.entries(changes).forEach(([property, value]) => {
    if (typeof value !== 'number') return

    const trackId = `track-${targetId}-${property}`
    const index = keyframes.findIndex(
      (keyframe) =>
        keyframe.targetId === targetId &&
        keyframe.property === property &&
        keyframe.frame === state.frame
    )
    const next: EditorKeyframe = {
      id: index >= 0 ? keyframes[index].id : keyframeId(targetId, property, state.frame),
      trackId,
      targetId,
      property,
      frame: state.frame,
      value,
      interpolation: index >= 0 ? keyframes[index].interpolation : 'bezier'
    }

    if (index >= 0) keyframes[index] = next
    else keyframes.push(next)
  })

  return keyframes.sort((a, b) => a.frame - b.frame)
}

const withSelections = (
  state: EditorState,
  requestedSelections: EditorSelection[]
): EditorState => {
  const selections = [...requestedSelections]
  const selection = selections[selections.length - 1] ?? null
  const bone = state.project.bones.find((item) => item.id === selection?.id)

  return {
    ...state,
    selection,
    selections,
    geometrySelection:
      selection?.kind === 'artwork-layer' && state.geometrySelection?.layerId === selection.id
        ? state.geometrySelection
        : null,
    transform: bone ? { ...bone.transform } : state.transform
  }
}

const editorReducer = (state: EditorState, action: EditorAction): EditorState => {
  switch (action.type) {
    case 'load-project':
      return {
        ...action.state,
        isPlaying: false,
        geometrySelection: null
      }
    case 'set-mode':
      return {
        ...state,
        mode: action.mode,
        tool:
          (action.mode === 'setup' && ['pose', 'deform'].includes(state.tool)) ||
          (action.mode === 'animate' && state.tool === 'create-bone')
            ? 'select'
            : state.tool,
        isPlaying: action.mode === 'setup' ? false : state.isPlaying
      }
    case 'set-tool': {
      const layerId = state.selection?.kind === 'artwork-layer' ? state.selection.id : null
      let project = state.project
      if (layerId && ['mesh', 'deform', 'weights'].includes(action.tool)) {
        project = updateArtworkLayer(project, layerId, (layer) =>
          layer.mesh ? layer : { ...layer, mesh: createGridMesh(layer.width, layer.height) }
        )
      }
      if (layerId && action.tool === 'clipping') {
        project = updateArtworkLayer(project, layerId, (layer) =>
          layer.clipping
            ? { ...layer, clipping: { ...layer.clipping, enabled: true } }
            : { ...layer, clipping: createDefaultClipping(layer.width, layer.height) }
        )
      }
      const isGeometryTool = ['mesh', 'deform', 'weights', 'clipping'].includes(action.tool)
      const isBoneCreateTool = action.tool === 'create-bone'
      const isBoneTransformTool = ['translate', 'rotate', 'scale', 'shear'].includes(action.tool)
      const nextState: EditorState = {
        ...state,
        project,
        mode:
          action.tool === 'deform'
            ? 'animate'
            : isGeometryTool || isBoneCreateTool
              ? 'setup'
              : state.mode,
        isPlaying: isGeometryTool || isBoneCreateTool ? false : state.isPlaying,
        tool: action.tool,
        geometrySelection: isGeometryTool ? state.geometrySelection : null,
        showBones: isBoneCreateTool || isBoneTransformTool || state.showBones,
        showMesh: ['mesh', 'deform', 'weights'].includes(action.tool) || state.showMesh,
        showWeights: action.tool === 'weights' || state.showWeights,
        showClipping: action.tool === 'clipping' || state.showClipping
      }
      if (!isBoneCreateTool) return nextState

      const selectedBone = state.project.bones.find((bone) => bone.id === state.selection?.id)
      const parent = selectedBone ?? state.project.bones.find((bone) => bone.parentId === null)
      return parent
        ? withSelections(nextState, [{ kind: 'bone', id: parent.id }])
        : withSelections(nextState, [])
    }
    case 'set-selection':
      return withSelections(state, action.selection ? [action.selection] : [])
    case 'set-selections':
      return withSelections(state, action.selections)
    case 'set-frame':
      return { ...state, frame: clamp(Math.round(action.frame), 0, state.duration) }
    case 'set-fps':
      return { ...state, fps: clamp(Math.round(action.fps), 1, 120) }
    case 'set-duration': {
      const duration = clamp(Math.round(action.duration), 1, 10000)
      return { ...state, duration, frame: Math.min(state.frame, duration) }
    }
    case 'set-playing':
      return { ...state, isPlaying: state.mode === 'animate' ? action.isPlaying : false }
    case 'set-loop':
      return { ...state, loop: action.loop }
    case 'set-auto-key':
      return { ...state, autoKey: action.autoKey }
    case 'set-ghosting':
      return { ...state, ghosting: action.ghosting }
    case 'toggle-view-flag':
      return { ...state, [action.flag]: !state[action.flag] }
    case 'set-physics-enabled':
      return { ...state, physicsEnabled: action.enabled }
    case 'set-zoom':
      return { ...state, zoom: clamp(action.zoom, 0.25, 4) }
    case 'set-timeline-view':
      return { ...state, timelineView: action.view }
    case 'set-active-skin':
      return state.project.skins.some((skin) => skin.id === action.id)
        ? { ...state, activeSkin: action.id }
        : state
    case 'set-active-animation': {
      return activateAnimation(state, action.id)
    }
    case 'create-animation':
      return createAnimation(state, action.name)
    case 'rename-animation':
      return renameAnimation(state, action.id, action.name)
    case 'delete-animation':
      return deleteAnimation(state, action.id)
    case 'configure-project': {
      const next = createInitialEditorState()
      const id = `project-${Date.now().toString(36)}`
      const animation = next.project.animations[0]
      animation.fps = clamp(Math.round(action.fps), 1, 120)
      return {
        ...next,
        fps: animation.fps,
        project: {
          ...next.project,
          id,
          name: action.name,
          skeletonName: action.name,
          canvas: {
            width: clamp(Math.round(action.width), 64, 16384),
            height: clamp(Math.round(action.height), 64, 16384)
          },
          artwork: null,
          audioTracks: [],
          updatedAt: new Date().toISOString()
        }
      }
    }
    case 'set-artwork': {
      const selectedLayer =
        action.artwork.layers.find((layer) => layer.visible) ?? action.artwork.layers[0]
      const selection: EditorSelection | null = selectedLayer
        ? { kind: 'artwork-layer', id: selectedLayer.id }
        : null

      const artworkBounds = artworkContentBounds(action.artwork.layers, {
        x: 0,
        y: 0,
        width: action.artwork.width,
        height: action.artwork.height
      })
      const bones =
        state.project.boneSpace === 'canvas'
          ? state.project.bones
          : fitBonesToBounds(state.project.bones, artworkBounds)

      return {
        ...state,
        project: {
          ...state.project,
          artwork: action.artwork,
          canvas: { width: action.artwork.width, height: action.artwork.height },
          boneSpace: 'canvas',
          bones,
          updatedAt: new Date().toISOString()
        },
        mode: 'setup',
        tool: 'select',
        zoom: 1,
        selection,
        selections: selection ? [selection] : [],
        isPlaying: false,
        ghosting: false,
        showBones: false,
        geometrySelection: null
      }
    }
    case 'create-bone': {
      const bone = createBoneFromWorldSegment(
        state.project.bones,
        action.parentId,
        action.start,
        action.end,
        nextBoneIdentity(state.project.bones)
      )
      return withSelections(
        {
          ...state,
          mode: 'setup',
          tool: 'create-bone',
          isPlaying: false,
          showBones: true,
          project: {
            ...state.project,
            boneSpace: 'canvas',
            bones: [...state.project.bones, bone],
            updatedAt: new Date().toISOString()
          }
        },
        [{ kind: 'bone', id: bone.id }]
      )
    }
    case 'rename-bone': {
      const bone = state.project.bones.find((candidate) => candidate.id === action.id)
      if (!bone || boneNameValidationError(state.project.bones, bone.id, action.name)) return state

      const name = normalizeBoneName(action.name)
      if (name === bone.name) return state

      return {
        ...state,
        project: {
          ...state.project,
          bones: state.project.bones.map((candidate) =>
            candidate.id === bone.id ? { ...candidate, name } : candidate
          ),
          updatedAt: new Date().toISOString()
        }
      }
    }
    case 'delete-bone':
      return deleteBoneFromEditorState(state, action.id, action.mode)
    case 'toggle-artwork-layer': {
      if (!state.project.artwork) return state

      return {
        ...state,
        project: {
          ...state.project,
          artwork: {
            ...state.project.artwork,
            layers: state.project.artwork.layers.map((layer) =>
              layer.id === action.id ? { ...layer, visible: !layer.visible } : layer
            )
          }
        }
      }
    }
    case 'bind-artwork-layer': {
      const boneWorldMatrix = action.boneId
        ? resolveBoneWorldMatrices(state.project.bones).get(action.boneId)
        : null
      if (action.boneId && !boneWorldMatrix) return state

      return {
        ...state,
        project: updateArtworkLayer(state.project, action.layerId, (layer) => {
          if (!action.boneId || !boneWorldMatrix) {
            return { ...layer, boneId: undefined, boneBindPose: undefined }
          }
          return {
            ...layer,
            boneId: action.boneId,
            boneBindPose: [...boneWorldMatrix]
          }
        })
      }
    }
    case 'clear-artwork': {
      const selections = state.selections.filter((selection) => selection.kind !== 'artwork-layer')
      return withSelections(
        {
          ...state,
          project: { ...state.project, artwork: null },
          geometrySelection: null
        },
        selections
      )
    }
    case 'set-geometry-selection':
      return { ...state, geometrySelection: action.selection }
    case 'set-weight-brush':
      return { ...state, weightBrush: { ...state.weightBrush, ...action.changes } }
    case 'set-artwork-mesh':
      return {
        ...state,
        geometrySelection: null,
        keyframes: state.keyframes.filter(
          (keyframe) => !(keyframe.targetId === action.layerId && keyframe.property === 'deform')
        ),
        project: updateArtworkLayer(state.project, action.layerId, (layer) => ({
          ...layer,
          mesh: action.mesh
        }))
      }
    case 'move-artwork-mesh-vertices':
      return {
        ...state,
        project: updateArtworkLayer(state.project, action.layerId, (layer) => {
          if (!layer.mesh) return layer
          const changes = new Map(action.changes.map((change) => [change.id, change.position]))
          return {
            ...layer,
            mesh: {
              ...layer.mesh,
              vertices: layer.mesh.vertices.map((vertex) => {
                const position = changes.get(vertex.id)
                return position ? { ...vertex, position: { ...position } } : vertex
              })
            }
          }
        })
      }
    case 'set-artwork-deformation': {
      const offsets = {
        ...evaluateLayerDeformation(state.keyframes, action.layerId, state.frame),
        ...action.offsets
      }
      const nextKeyframe: EditorKeyframe = {
        id: keyframeId(action.layerId, 'deform', state.frame),
        trackId: `track-${action.layerId}-deform`,
        targetId: action.layerId,
        property: 'deform',
        frame: state.frame,
        value: { kind: 'mesh-deform', offsets },
        interpolation: 'linear'
      }
      const index = state.keyframes.findIndex(
        (keyframe) =>
          keyframe.targetId === action.layerId &&
          keyframe.property === 'deform' &&
          keyframe.frame === state.frame
      )
      const keyframes = [...state.keyframes]
      if (index >= 0) keyframes[index] = { ...nextKeyframe, id: keyframes[index].id }
      else keyframes.push(nextKeyframe)
      return { ...state, keyframes: keyframes.sort((left, right) => left.frame - right.frame) }
    }
    case 'reset-artwork-deformation':
      return {
        ...state,
        keyframes: state.keyframes.filter(
          (keyframe) => !(keyframe.targetId === action.layerId && keyframe.property === 'deform')
        )
      }
    case 'set-artwork-clipping':
      return {
        ...state,
        project: updateArtworkLayer(state.project, action.layerId, (layer) => ({
          ...layer,
          clipping: action.clipping
        }))
      }
    case 'move-artwork-clipping-vertices':
      return {
        ...state,
        project: updateArtworkLayer(state.project, action.layerId, (layer) => {
          if (!layer.clipping) return layer
          const changes = new Map(action.changes.map((change) => [change.id, change.position]))
          return {
            ...layer,
            clipping: {
              ...layer.clipping,
              vertices: layer.clipping.vertices.map((vertex) => {
                const position = changes.get(vertex.id)
                return position ? { ...vertex, ...position } : vertex
              })
            }
          }
        })
      }
    case 'update-artwork-clipping':
      return {
        ...state,
        project: updateArtworkLayer(state.project, action.layerId, (layer) =>
          layer.clipping ? { ...layer, clipping: { ...layer.clipping, ...action.changes } } : layer
        )
      }
    case 'paint-artwork-weights': {
      const boneWorldMatrix = state.weightBrush.boneId
        ? resolveBoneWorldMatrices(state.project.bones).get(state.weightBrush.boneId)
        : undefined
      return {
        ...state,
        project: updateArtworkLayer(state.project, action.layerId, (layer) => {
          if (!layer.mesh) return layer
          const bone = state.project.bones.find((item) => item.id === state.weightBrush.boneId)
          const painted = paintMeshWeights(
            layer.mesh,
            action.point,
            state.weightBrush,
            evaluateLayerDeformation(state.keyframes, action.layerId, state.frame)
          ).mesh
          return {
            ...layer,
            mesh:
              bone && boneWorldMatrix && !painted.bindPose?.[bone.id]
                ? {
                    ...painted,
                    bindPose: {
                      ...painted.bindPose,
                      [bone.id]: boneWorldMatrix
                    }
                  }
                : painted
          }
        })
      }
    }
    case 'set-vertex-weight': {
      const boneWorldMatrix = resolveBoneWorldMatrices(state.project.bones).get(action.boneId)
      return {
        ...state,
        project: updateArtworkLayer(state.project, action.layerId, (layer) => {
          if (!layer.mesh) return layer
          const desired = clamp(action.value, 0, 1)
          const bone = state.project.bones.find((item) => item.id === action.boneId)
          return {
            ...layer,
            mesh: {
              ...layer.mesh,
              bindPose:
                bone && boneWorldMatrix && !layer.mesh.bindPose?.[bone.id]
                  ? {
                      ...layer.mesh.bindPose,
                      [bone.id]: boneWorldMatrix
                    }
                  : layer.mesh.bindPose,
              vertices: layer.mesh.vertices.map((vertex) => {
                if (vertex.id !== action.vertexId) return vertex
                const others = vertex.weights.filter((weight) => weight.boneId !== action.boneId)
                const otherTotal = others.reduce((sum, weight) => sum + weight.value, 0)
                const weights = [
                  ...(desired > 0 ? [{ boneId: action.boneId, value: desired }] : []),
                  ...others.map((weight) => ({
                    ...weight,
                    value:
                      otherTotal > 0 ? (weight.value / otherTotal) * (1 - desired) : 1 - desired
                  }))
                ]
                return { ...vertex, weights: normalizeVertexWeights(weights) }
              })
            }
          }
        })
      }
    }
    case 'add-clip-vertex':
      return {
        ...state,
        project: updateArtworkLayer(state.project, action.layerId, (layer) => {
          if (!layer.clipping) return layer
          const index = layer.clipping.vertices.findIndex(
            (vertex) => vertex.id === action.afterVertexId
          )
          if (index < 0) return layer
          const vertices = [...layer.clipping.vertices]
          vertices.splice(index + 1, 0, {
            id: `${layer.clipping.id}-v-${Date.now().toString(36)}`,
            ...action.point
          })
          return { ...layer, clipping: { ...layer.clipping, vertices } }
        })
      }
    case 'remove-geometry-vertices':
      return {
        ...state,
        geometrySelection: null,
        project: updateArtworkLayer(state.project, action.layerId, (layer) => {
          const ids = new Set(action.ids)
          if (action.kind === 'clip' && layer.clipping) {
            const vertices = layer.clipping.vertices.filter((vertex) => !ids.has(vertex.id))
            return vertices.length >= 3
              ? { ...layer, clipping: { ...layer.clipping, vertices } }
              : layer
          }
          if (action.kind === 'mesh' && layer.mesh) {
            const vertices = layer.mesh.vertices.filter((vertex) => !ids.has(vertex.id))
            if (vertices.length < 3) return layer
            return {
              ...layer,
              mesh: {
                ...layer.mesh,
                vertices,
                triangles: layer.mesh.triangles.filter((triangle) =>
                  triangle.vertexIds.every((id) => !ids.has(id))
                )
              }
            }
          }
          return layer
        })
      }
    case 'add-audio-track': {
      const duration = Math.max(
        state.duration,
        action.track.startFrame + Math.ceil(action.track.durationSeconds * state.fps)
      )
      const selection: EditorSelection = { kind: 'audio', id: action.track.id }
      return {
        ...state,
        project: {
          ...state.project,
          audioTracks: [
            ...state.project.audioTracks.filter((track) => track.id !== action.track.id),
            action.track
          ],
          animations: state.project.animations.map((animation) =>
            animation.id === state.activeAnimation ? { ...animation, duration } : animation
          ),
          updatedAt: new Date().toISOString()
        },
        duration,
        timelineView: 'audio',
        selection,
        selections: [selection]
      }
    }
    case 'update-audio-track':
      return {
        ...state,
        project: {
          ...state.project,
          audioTracks: state.project.audioTracks.map((track) =>
            track.id === action.id ? { ...track, ...action.changes } : track
          ),
          updatedAt: new Date().toISOString()
        }
      }
    case 'remove-audio-track': {
      const audioTracks = state.project.audioTracks.filter((track) => track.id !== action.id)
      let selections = state.selections.filter(
        (selection) => !(selection.kind === 'audio' && selection.id === action.id)
      )
      if (
        selections.length === 0 &&
        state.selection?.kind === 'audio' &&
        state.selection.id === action.id &&
        audioTracks[0]
      ) {
        selections = [{ kind: 'audio', id: audioTracks[0].id }]
      }
      return withSelections(
        {
          ...state,
          project: {
            ...state.project,
            audioTracks,
            updatedAt: new Date().toISOString()
          }
        },
        selections
      )
    }
    case 'update-transform': {
      const transform = { ...state.transform, ...action.changes }
      const writesSetupPose = state.mode === 'setup' || !state.autoKey
      const project =
        writesSetupPose && state.project.bones.some((bone) => bone.id === state.selection?.id)
          ? {
              ...state.project,
              updatedAt: new Date().toISOString(),
              bones: state.project.bones.map((bone) =>
                bone.id === state.selection?.id
                  ? { ...bone, transform: { ...bone.transform, ...action.changes } }
                  : bone
              )
            }
          : state.project

      return {
        ...state,
        project,
        transform,
        keyframes: upsertTransformKeys(state, action.changes)
      }
    }
    case 'reset-transform': {
      const writesSetupPose = state.mode === 'setup' || !state.autoKey
      return {
        ...state,
        project: writesSetupPose
          ? {
              ...state.project,
              bones: state.project.bones.map((bone) =>
                bone.id === state.selection?.id
                  ? { ...bone, transform: { ...DEFAULT_TRANSFORM } }
                  : bone
              ),
              updatedAt: new Date().toISOString()
            }
          : state.project,
        transform: { ...DEFAULT_TRANSFORM },
        keyframes: upsertTransformKeys(state, DEFAULT_TRANSFORM)
      }
    }
    case 'update-physics': {
      const physics = { ...state.physics, ...action.changes }
      const project = {
        ...state.project,
        updatedAt: new Date().toISOString(),
        constraints: state.project.constraints.map((constraint) =>
          constraint.type === 'physics' ? { ...constraint, physics: { ...physics } } : constraint
        )
      }
      return { ...state, project, physics }
    }
    case 'update-constraint':
      return {
        ...state,
        project: {
          ...state.project,
          updatedAt: new Date().toISOString(),
          constraints: state.project.constraints.map((constraint) =>
            constraint.id === action.id ? { ...constraint, ...action.changes } : constraint
          )
        }
      }
    case 'upsert-keyframe': {
      const index = state.keyframes.findIndex(
        (keyframe) =>
          keyframe.id === action.keyframe.id ||
          (keyframe.trackId === action.keyframe.trackId && keyframe.frame === action.keyframe.frame)
      )
      const nextKeyframe: EditorKeyframe = {
        ...action.keyframe,
        id:
          action.keyframe.id ??
          keyframeId(action.keyframe.targetId, action.keyframe.property, action.keyframe.frame)
      }
      const keyframes = [...state.keyframes]
      if (index >= 0) keyframes[index] = nextKeyframe
      else keyframes.push(nextKeyframe)
      return { ...state, keyframes: keyframes.sort((a, b) => a.frame - b.frame) }
    }
    case 'move-keyframe':
      return {
        ...state,
        keyframes: state.keyframes
          .map((keyframe) =>
            keyframe.id === action.id
              ? { ...keyframe, frame: clamp(Math.round(action.frame), 0, state.duration) }
              : keyframe
          )
          .sort((a, b) => a.frame - b.frame)
      }
    case 'remove-keyframe':
      return {
        ...state,
        keyframes: state.keyframes.filter((keyframe) => keyframe.id !== action.id)
      }
  }
}

export interface EditorActions {
  loadProject: (state: EditorState) => void
  setMode: (mode: EditorMode) => void
  setTool: (tool: EditorTool) => void
  select: (selection: EditorSelection) => void
  selectMany: (selections: EditorSelection[]) => void
  clearSelection: () => void
  setFrame: (frame: number) => void
  setFps: (fps: number) => void
  setDuration: (duration: number) => void
  setPlaying: (isPlaying: boolean) => void
  togglePlayback: () => void
  setLoop: (loop: boolean) => void
  toggleLoop: () => void
  setAutoKey: (autoKey: boolean) => void
  toggleAutoKey: () => void
  setGhosting: (ghosting: boolean) => void
  toggleGhosting: () => void
  toggleViewFlag: (flag: ViewFlag) => void
  setPhysicsEnabled: (enabled: boolean) => void
  togglePhysics: () => void
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  setTimelineView: (view: TimelineView) => void
  setActiveSkin: (id: string) => void
  setActiveAnimation: (id: string) => void
  createAnimation: (name: string) => void
  renameAnimation: (id: string, name: string) => void
  deleteAnimation: (id: string) => void
  configureProject: (name: string, width: number, height: number, fps: number) => void
  setArtwork: (artwork: ArtworkDocument) => void
  createBone: (parentId: string | null, start: Point, end: Point) => void
  renameBone: (id: string, name: string) => void
  deleteBone: (id: string, mode: BoneDeletionMode) => void
  toggleArtworkLayer: (id: string) => void
  bindArtworkLayer: (layerId: string, boneId: string | null) => void
  clearArtwork: () => void
  setGeometrySelection: (selection: GeometrySelection | null) => void
  setWeightBrush: (changes: Partial<WeightBrush>) => void
  setArtworkMesh: (layerId: string, mesh: ArtworkMesh) => void
  moveArtworkMeshVertices: (
    layerId: string,
    changes: Array<{ id: string; position: Point }>
  ) => void
  setArtworkDeformation: (layerId: string, offsets: MeshDeformValue['offsets']) => void
  resetArtworkDeformation: (layerId: string) => void
  setArtworkClipping: (layerId: string, clipping: ArtworkClipping) => void
  moveArtworkClippingVertices: (
    layerId: string,
    changes: Array<{ id: string; position: Point }>
  ) => void
  updateArtworkClipping: (layerId: string, changes: Partial<ArtworkClipping>) => void
  paintArtworkWeights: (layerId: string, point: Point) => void
  setVertexWeight: (layerId: string, vertexId: string, boneId: string, value: number) => void
  addClipVertex: (layerId: string, afterVertexId: string, point: Point) => void
  removeGeometryVertices: (layerId: string, kind: 'mesh' | 'clip', ids: string[]) => void
  addAudioTrack: (track: AudioTrack) => void
  updateAudioTrack: (id: string, changes: Partial<AudioTrack>) => void
  removeAudioTrack: (id: string) => void
  updateTransform: (changes: Partial<Transform>) => void
  resetTransform: () => void
  updatePhysics: (changes: Partial<PhysicsParams>) => void
  updateConstraint: (id: string, changes: Partial<Constraint>) => void
  upsertKeyframe: (
    trackId: string,
    targetId: string,
    property: string,
    frame: number,
    value: KeyframeValue,
    interpolation?: EditorKeyframe['interpolation']
  ) => void
  moveKeyframe: (id: string, frame: number) => void
  removeKeyframe: (id: string) => void
}

export interface EditorContextValue {
  state: EditorState
  actions: EditorActions
  dispatch: Dispatch<EditorAction>
}

const EditorContext = createContext<EditorContextValue | null>(null)

export const EditorProvider = ({ children }: PropsWithChildren): React.JSX.Element => {
  const [state, dispatch] = useReducer(editorReducer, undefined, createInitialEditorState)

  const actions = useMemo<EditorActions>(
    () => ({
      loadProject: (state) => dispatch({ type: 'load-project', state }),
      setMode: (mode) => dispatch({ type: 'set-mode', mode }),
      setTool: (tool) => dispatch({ type: 'set-tool', tool }),
      select: (selection) => dispatch({ type: 'set-selection', selection }),
      selectMany: (selections) => dispatch({ type: 'set-selections', selections }),
      clearSelection: () => dispatch({ type: 'set-selections', selections: [] }),
      setFrame: (frame) => dispatch({ type: 'set-frame', frame }),
      setFps: (fps) => dispatch({ type: 'set-fps', fps }),
      setDuration: (duration) => dispatch({ type: 'set-duration', duration }),
      setPlaying: (isPlaying) => dispatch({ type: 'set-playing', isPlaying }),
      togglePlayback: () => dispatch({ type: 'set-playing', isPlaying: !state.isPlaying }),
      setLoop: (loop) => dispatch({ type: 'set-loop', loop }),
      toggleLoop: () => dispatch({ type: 'set-loop', loop: !state.loop }),
      setAutoKey: (autoKey) => dispatch({ type: 'set-auto-key', autoKey }),
      toggleAutoKey: () => dispatch({ type: 'set-auto-key', autoKey: !state.autoKey }),
      setGhosting: (ghosting) => dispatch({ type: 'set-ghosting', ghosting }),
      toggleGhosting: () => dispatch({ type: 'set-ghosting', ghosting: !state.ghosting }),
      toggleViewFlag: (flag) => dispatch({ type: 'toggle-view-flag', flag }),
      setPhysicsEnabled: (enabled) => dispatch({ type: 'set-physics-enabled', enabled }),
      togglePhysics: () =>
        dispatch({ type: 'set-physics-enabled', enabled: !state.physicsEnabled }),
      setZoom: (zoom) => dispatch({ type: 'set-zoom', zoom }),
      zoomIn: () => dispatch({ type: 'set-zoom', zoom: state.zoom + 0.1 }),
      zoomOut: () => dispatch({ type: 'set-zoom', zoom: state.zoom - 0.1 }),
      resetZoom: () => dispatch({ type: 'set-zoom', zoom: 1 }),
      setTimelineView: (view) => dispatch({ type: 'set-timeline-view', view }),
      setActiveSkin: (id) => dispatch({ type: 'set-active-skin', id }),
      setActiveAnimation: (id) => dispatch({ type: 'set-active-animation', id }),
      createAnimation: (name) => dispatch({ type: 'create-animation', name }),
      renameAnimation: (id, name) => dispatch({ type: 'rename-animation', id, name }),
      deleteAnimation: (id) => dispatch({ type: 'delete-animation', id }),
      configureProject: (name, width, height, fps) =>
        dispatch({ type: 'configure-project', name, width, height, fps }),
      setArtwork: (artwork) => dispatch({ type: 'set-artwork', artwork }),
      createBone: (parentId, start, end) => dispatch({ type: 'create-bone', parentId, start, end }),
      renameBone: (id, name) => dispatch({ type: 'rename-bone', id, name }),
      deleteBone: (id, mode) => dispatch({ type: 'delete-bone', id, mode }),
      toggleArtworkLayer: (id) => dispatch({ type: 'toggle-artwork-layer', id }),
      bindArtworkLayer: (layerId, boneId) =>
        dispatch({ type: 'bind-artwork-layer', layerId, boneId }),
      clearArtwork: () => dispatch({ type: 'clear-artwork' }),
      setGeometrySelection: (selection) => dispatch({ type: 'set-geometry-selection', selection }),
      setWeightBrush: (changes) => dispatch({ type: 'set-weight-brush', changes }),
      setArtworkMesh: (layerId, mesh) => dispatch({ type: 'set-artwork-mesh', layerId, mesh }),
      moveArtworkMeshVertices: (layerId, changes) =>
        dispatch({ type: 'move-artwork-mesh-vertices', layerId, changes }),
      setArtworkDeformation: (layerId, offsets) =>
        dispatch({ type: 'set-artwork-deformation', layerId, offsets }),
      resetArtworkDeformation: (layerId) =>
        dispatch({ type: 'reset-artwork-deformation', layerId }),
      setArtworkClipping: (layerId, clipping) =>
        dispatch({ type: 'set-artwork-clipping', layerId, clipping }),
      moveArtworkClippingVertices: (layerId, changes) =>
        dispatch({ type: 'move-artwork-clipping-vertices', layerId, changes }),
      updateArtworkClipping: (layerId, changes) =>
        dispatch({ type: 'update-artwork-clipping', layerId, changes }),
      paintArtworkWeights: (layerId, point) =>
        dispatch({ type: 'paint-artwork-weights', layerId, point }),
      setVertexWeight: (layerId, vertexId, boneId, value) =>
        dispatch({ type: 'set-vertex-weight', layerId, vertexId, boneId, value }),
      addClipVertex: (layerId, afterVertexId, point) =>
        dispatch({ type: 'add-clip-vertex', layerId, afterVertexId, point }),
      removeGeometryVertices: (layerId, kind, ids) =>
        dispatch({ type: 'remove-geometry-vertices', layerId, kind, ids }),
      addAudioTrack: (track) => dispatch({ type: 'add-audio-track', track }),
      updateAudioTrack: (id, changes) => dispatch({ type: 'update-audio-track', id, changes }),
      removeAudioTrack: (id) => dispatch({ type: 'remove-audio-track', id }),
      updateTransform: (changes) => dispatch({ type: 'update-transform', changes }),
      resetTransform: () => dispatch({ type: 'reset-transform' }),
      updatePhysics: (changes) => dispatch({ type: 'update-physics', changes }),
      updateConstraint: (id, changes) => dispatch({ type: 'update-constraint', id, changes }),
      upsertKeyframe: (trackId, targetId, property, frame, value, interpolation = 'bezier') =>
        dispatch({
          type: 'upsert-keyframe',
          keyframe: { trackId, targetId, property, frame, value, interpolation }
        }),
      moveKeyframe: (id, frame) => dispatch({ type: 'move-keyframe', id, frame }),
      removeKeyframe: (id) => dispatch({ type: 'remove-keyframe', id })
    }),
    [state.autoKey, state.ghosting, state.isPlaying, state.loop, state.physicsEnabled, state.zoom]
  )

  const value = useMemo(() => ({ state, actions, dispatch }), [state, actions])

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
}

export const useEditorState = (): EditorContextValue => {
  const context = useContext(EditorContext)
  if (!context) throw new Error('useEditorState must be used inside an EditorProvider')
  return context
}

export const useActiveAnimation = (): Animation | undefined => {
  const { state } = useEditorState()
  return useMemo(
    () => state.project.animations.find((animation) => animation.id === state.activeAnimation),
    [state.activeAnimation, state.project.animations]
  )
}

export const useSelectedEntity = ():
  | Bone
  | Slot
  | Attachment
  | Constraint
  | Animation
  | Skin
  | ArtworkLayer
  | AudioTrack
  | EditorProject
  | null => {
  const { state } = useEditorState()

  return useMemo(() => {
    if (!state.selection) return null
    const { id, kind } = state.selection
    if (kind === 'bone') return state.project.bones.find((item) => item.id === id) ?? null
    if (kind === 'slot') return state.project.slots.find((item) => item.id === id) ?? null
    if (kind === 'attachment' || kind === 'bounding-box')
      return state.project.attachments.find((item) => item.id === id) ?? null
    if (kind === 'constraint')
      return state.project.constraints.find((item) => item.id === id) ?? null
    if (kind === 'animation') return state.project.animations.find((item) => item.id === id) ?? null
    if (kind === 'skin') return state.project.skins.find((item) => item.id === id) ?? null
    if (kind === 'artwork-layer')
      return state.project.artwork?.layers.find((item) => item.id === id) ?? null
    if (kind === 'audio') return state.project.audioTracks.find((item) => item.id === id) ?? null
    return state.project
  }, [state.project, state.selection])
}
