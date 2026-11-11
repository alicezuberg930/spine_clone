/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  useContext,
  useMemo,
  useReducer
} from 'react'
import { createDemoProject, DEFAULT_PHYSICS, DEFAULT_TRANSFORM } from '../lib/demo-project'
import type {
  Animation,
  Attachment,
  ArtworkDocument,
  ArtworkLayer,
  ArtworkClipping,
  ArtworkMesh,
  AudioTrack,
  Bone,
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
  matrixFromTransform,
  normalizeVertexWeights,
  paintMeshWeights
} from '@/lib/mesh-geometry'

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

const getAnimation = (state: EditorState, id = state.activeAnimation): Animation | undefined =>
  state.project.animations.find((animation) => animation.id === id)

const createInitialEditorState = (): EditorState => {
  const project = createDemoProject()
  const animation = project.animations[0]

  return {
    project,
    mode: 'animate',
    tool: 'select',
    selection: { kind: 'bone', id: 'bone-head' },
    frame: 12,
    fps: animation.fps,
    duration: animation.duration,
    isPlaying: false,
    loop: animation.loop,
    autoKey: true,
    ghosting: true,
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
    weightBrush: { boneId: 'bone-root', radius: 90, strength: 0.35, mode: 'add' },
    transform: { ...DEFAULT_TRANSFORM, rotation: -2 },
    physics: { ...DEFAULT_PHYSICS },
    keyframes: structuredClone(animation.keyframes)
  }
}

type EditorAction =
  | { type: 'set-mode'; mode: EditorMode }
  | { type: 'set-tool'; tool: EditorTool }
  | { type: 'set-selection'; selection: EditorSelection | null }
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
  | { type: 'configure-project'; name: string; width: number; height: number; fps: number }
  | { type: 'set-artwork'; artwork: ArtworkDocument }
  | { type: 'toggle-artwork-layer'; id: string }
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
  | { type: 'reset-demo' }

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value))

const keyframeId = (targetId: string, property: string, frame: number): string =>
  `key-${targetId}-${property}-${frame}`

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

const editorReducer = (state: EditorState, action: EditorAction): EditorState => {
  switch (action.type) {
    case 'set-mode':
      return {
        ...state,
        mode: action.mode,
        tool:
          action.mode === 'setup' && ['pose', 'deform'].includes(state.tool)
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
      return {
        ...state,
        project,
        mode: action.tool === 'deform' ? 'animate' : isGeometryTool ? 'setup' : state.mode,
        isPlaying: isGeometryTool ? false : state.isPlaying,
        tool: action.tool,
        geometrySelection: isGeometryTool ? state.geometrySelection : null,
        showMesh: ['mesh', 'deform', 'weights'].includes(action.tool) || state.showMesh,
        showWeights: action.tool === 'weights' || state.showWeights,
        showClipping: action.tool === 'clipping' || state.showClipping
      }
    }
    case 'set-selection': {
      const bone = state.project.bones.find((item) => item.id === action.selection?.id)
      return {
        ...state,
        selection: action.selection,
        geometrySelection:
          action.selection?.kind === 'artwork-layer' &&
          state.geometrySelection?.layerId === action.selection.id
            ? state.geometrySelection
            : null,
        transform: bone ? { ...bone.transform } : state.transform
      }
    }
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
      const animation = getAnimation(state, action.id)
      if (!animation) return state

      return {
        ...state,
        activeAnimation: animation.id,
        frame: 0,
        fps: animation.fps,
        duration: animation.duration,
        loop: animation.loop,
        isPlaying: false,
        keyframes: structuredClone(animation.keyframes)
      }
    }
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

      return {
        ...state,
        project: {
          ...state.project,
          artwork: action.artwork,
          canvas: { width: action.artwork.width, height: action.artwork.height },
          updatedAt: new Date().toISOString()
        },
        mode: 'setup',
        tool: 'select',
        selection: selectedLayer ? { kind: 'artwork-layer', id: selectedLayer.id } : null,
        isPlaying: false,
        ghosting: false,
        showBones: false,
        geometrySelection: null
      }
    }
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
    case 'clear-artwork':
      return {
        ...state,
        project: { ...state.project, artwork: null },
        selection: state.selection?.kind === 'artwork-layer' ? null : state.selection
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
    case 'paint-artwork-weights':
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
              bone && !painted.bindPose?.[bone.id]
                ? {
                    ...painted,
                    bindPose: {
                      ...painted.bindPose,
                      [bone.id]: matrixFromTransform(bone.transform)
                    }
                  }
                : painted
          }
        })
      }
    case 'set-vertex-weight':
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
                bone && !layer.mesh.bindPose?.[bone.id]
                  ? {
                      ...layer.mesh.bindPose,
                      [bone.id]: matrixFromTransform(bone.transform)
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
        selection: { kind: 'audio', id: action.track.id }
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
      const selection =
        state.selection?.kind === 'audio' && state.selection.id === action.id
          ? audioTracks[0]
            ? { kind: 'audio' as const, id: audioTracks[0].id }
            : null
          : state.selection
      return {
        ...state,
        selection,
        project: {
          ...state.project,
          audioTracks,
          updatedAt: new Date().toISOString()
        }
      }
    }
    case 'update-transform': {
      const transform = { ...state.transform, ...action.changes }
      const project = state.project.bones.some((bone) => bone.id === state.selection?.id)
        ? {
            ...state.project,
            updatedAt: new Date().toISOString(),
            bones: state.project.bones.map((bone) =>
              bone.id === state.selection?.id ? { ...bone, transform: { ...transform } } : bone
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
    case 'reset-transform':
      return {
        ...state,
        project: {
          ...state.project,
          bones: state.project.bones.map((bone) =>
            bone.id === state.selection?.id
              ? { ...bone, transform: { ...DEFAULT_TRANSFORM } }
              : bone
          ),
          updatedAt: new Date().toISOString()
        },
        transform: { ...DEFAULT_TRANSFORM },
        keyframes: upsertTransformKeys(state, DEFAULT_TRANSFORM)
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
    case 'reset-demo':
      return createInitialEditorState()
  }
}

export interface EditorActions {
  setMode: (mode: EditorMode) => void
  setTool: (tool: EditorTool) => void
  select: (selection: EditorSelection) => void
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
  configureProject: (name: string, width: number, height: number, fps: number) => void
  setArtwork: (artwork: ArtworkDocument) => void
  toggleArtworkLayer: (id: string) => void
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
  resetDemo: () => void
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
      setMode: (mode) => dispatch({ type: 'set-mode', mode }),
      setTool: (tool) => dispatch({ type: 'set-tool', tool }),
      select: (selection) => dispatch({ type: 'set-selection', selection }),
      clearSelection: () => dispatch({ type: 'set-selection', selection: null }),
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
      configureProject: (name, width, height, fps) =>
        dispatch({ type: 'configure-project', name, width, height, fps }),
      setArtwork: (artwork) => dispatch({ type: 'set-artwork', artwork }),
      toggleArtworkLayer: (id) => dispatch({ type: 'toggle-artwork-layer', id }),
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
      removeKeyframe: (id) => dispatch({ type: 'remove-keyframe', id }),
      resetDemo: () => dispatch({ type: 'reset-demo' })
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
