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
  Bone,
  Constraint,
  EditorKeyframe,
  EditorMode,
  EditorProject,
  EditorSelection,
  EditorState,
  EditorTool,
  KeyframeValue,
  PhysicsParams,
  Skin,
  Slot,
  TimelineView,
  Transform,
  ViewFlag
} from '@/@types'

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
  | { type: 'set-artwork'; artwork: ArtworkDocument }
  | { type: 'toggle-artwork-layer'; id: string }
  | { type: 'clear-artwork' }
  | { type: 'update-transform'; changes: Partial<Transform> }
  | { type: 'reset-transform' }
  | { type: 'update-physics'; changes: Partial<PhysicsParams> }
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
        tool: action.mode === 'setup' && state.tool === 'pose' ? 'select' : state.tool,
        isPlaying: action.mode === 'setup' ? false : state.isPlaying
      }
    case 'set-tool':
      return { ...state, tool: action.tool }
    case 'set-selection': {
      const bone = state.project.bones.find((item) => item.id === action.selection?.id)
      return {
        ...state,
        selection: action.selection,
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
    case 'set-artwork': {
      const selectedLayer =
        action.artwork.layers.find((layer) => layer.visible) ?? action.artwork.layers[0]

      return {
        ...state,
        project: { ...state.project, artwork: action.artwork },
        mode: 'setup',
        tool: 'select',
        selection: selectedLayer ? { kind: 'artwork-layer', id: selectedLayer.id } : null,
        isPlaying: false,
        ghosting: false,
        showBones: false
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
    case 'update-transform': {
      const transform = { ...state.transform, ...action.changes }
      const project = structuredClone(state.project)
      const selectedBone = project.bones.find((bone) => bone.id === state.selection?.id)
      if (selectedBone) selectedBone.transform = { ...transform }

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
        transform: { ...DEFAULT_TRANSFORM },
        keyframes: upsertTransformKeys(state, DEFAULT_TRANSFORM)
      }
    case 'update-physics': {
      const physics = { ...state.physics, ...action.changes }
      const project = structuredClone(state.project)
      const constraint = project.constraints.find((item) => item.type === 'physics')
      if (constraint) constraint.physics = { ...physics }
      return { ...state, project, physics }
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
  setArtwork: (artwork: ArtworkDocument) => void
  toggleArtworkLayer: (id: string) => void
  clearArtwork: () => void
  updateTransform: (changes: Partial<Transform>) => void
  resetTransform: () => void
  updatePhysics: (changes: Partial<PhysicsParams>) => void
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
      setArtwork: (artwork) => dispatch({ type: 'set-artwork', artwork }),
      toggleArtworkLayer: (id) => dispatch({ type: 'toggle-artwork-layer', id }),
      clearArtwork: () => dispatch({ type: 'clear-artwork' }),
      updateTransform: (changes) => dispatch({ type: 'update-transform', changes }),
      resetTransform: () => dispatch({ type: 'reset-transform' }),
      updatePhysics: (changes) => dispatch({ type: 'update-physics', changes }),
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
    return state.project
  }, [state.project, state.selection])
}
