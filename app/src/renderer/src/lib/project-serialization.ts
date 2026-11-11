import type {
  EditorMode,
  EditorProject,
  EditorSelection,
  EditorState,
  EditorTool,
  TimelineView
} from '@/@types'

export const PROJECT_FILE_FORMAT = 'layerforge-project' as const
export const PROJECT_FILE_VERSION = 1 as const

export interface ProjectWorkspaceSnapshot {
  mode: EditorMode
  tool: EditorTool
  selection: EditorSelection | null
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
