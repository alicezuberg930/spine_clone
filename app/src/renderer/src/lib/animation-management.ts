import type { Animation, EditorProject, EditorState } from '@/@types'

export function normalizeAnimationName(value: string): string {
  return value.trim()
}

export function animationNameValidationError(
  animations: readonly Pick<Animation, 'id' | 'name'>[],
  animationId: string | null,
  value: string
): string | null {
  const name = normalizeAnimationName(value)
  if (!name) return 'Animation name is required.'

  const normalizedName = name.toLocaleLowerCase()
  const duplicate = animations.some(
    (animation) =>
      animation.id !== animationId && animation.name.trim().toLocaleLowerCase() === normalizedName
  )
  return duplicate ? `An animation named “${name}” already exists.` : null
}

export function nextAnimationName(animations: readonly Pick<Animation, 'name'>[]): string {
  const existingNames = new Set(
    animations.map((animation) => animation.name.trim().toLocaleLowerCase())
  )
  let number = Math.max(2, animations.length + 1)
  let candidate = `Animation ${number}`
  while (existingNames.has(candidate.toLocaleLowerCase())) {
    number += 1
    candidate = `Animation ${number}`
  }
  return candidate
}

function updatedProject(project: EditorProject, animations: Animation[]): EditorProject {
  return {
    ...project,
    animations,
    updatedAt: new Date().toISOString()
  }
}

function nextAnimationId(animations: readonly Animation[]): string {
  const numericIds = animations
    .map((animation) => /^animation-(\d+)$/.exec(animation.id)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number)
  let number = Math.max(animations.length + 1, ...numericIds.map((value) => value + 1), 2)
  let id = `animation-${number}`
  while (animations.some((animation) => animation.id === id)) {
    number += 1
    id = `animation-${number}`
  }
  return id
}

function loadAnimation(
  state: EditorState,
  project: EditorProject,
  animation: Animation
): EditorState {
  return {
    ...state,
    project,
    activeAnimation: animation.id,
    frame: 0,
    fps: animation.fps,
    duration: animation.duration,
    loop: animation.loop,
    isPlaying: false,
    keyframes: structuredClone(animation.keyframes)
  }
}

/** Copies the live timeline buffer into its animation before leaving it. */
export function commitActiveAnimation(state: EditorState): EditorProject {
  let found = false
  const animations = state.project.animations.map((animation) => {
    if (animation.id !== state.activeAnimation) return animation
    found = true
    return {
      ...animation,
      fps: state.fps,
      duration: state.duration,
      loop: state.loop,
      keyframes: structuredClone(state.keyframes)
    }
  })
  return found ? updatedProject(state.project, animations) : state.project
}

export function activateAnimation(state: EditorState, id: string): EditorState {
  if (id === state.activeAnimation) return state
  if (!state.project.animations.some((animation) => animation.id === id)) return state

  const project = commitActiveAnimation(state)
  const animation = project.animations.find((candidate) => candidate.id === id)
  return animation ? loadAnimation(state, project, animation) : state
}

export function createAnimation(state: EditorState, requestedName: string): EditorState {
  const name = normalizeAnimationName(requestedName)
  if (animationNameValidationError(state.project.animations, null, name)) return state

  const project = commitActiveAnimation(state)
  const animation: Animation = {
    id: nextAnimationId(project.animations),
    name,
    duration: state.duration,
    fps: state.fps,
    loop: true,
    tracks: [],
    keyframes: []
  }
  const nextProject = updatedProject(project, [...project.animations, animation])
  return loadAnimation(state, nextProject, animation)
}

export function renameAnimation(
  state: EditorState,
  id: string,
  requestedName: string
): EditorState {
  const name = normalizeAnimationName(requestedName)
  if (animationNameValidationError(state.project.animations, id, name)) return state
  const current = state.project.animations.find((animation) => animation.id === id)
  if (!current || current.name === name) return state

  const project = commitActiveAnimation(state)
  return {
    ...state,
    project: updatedProject(
      project,
      project.animations.map((animation) =>
        animation.id === id ? { ...animation, name } : animation
      )
    )
  }
}

export function deleteAnimation(state: EditorState, id: string): EditorState {
  if (state.project.animations.length <= 1) return state
  const deletedIndex = state.project.animations.findIndex((animation) => animation.id === id)
  if (deletedIndex < 0) return state

  const project = commitActiveAnimation(state)
  const animations = project.animations.filter((animation) => animation.id !== id)
  const nextProject = updatedProject(project, animations)
  const selections = state.selections.filter(
    (selection) => !(selection.kind === 'animation' && selection.id === id)
  )
  const selection =
    state.selection?.kind === 'animation' && state.selection.id === id
      ? (selections[selections.length - 1] ?? null)
      : state.selection

  if (id !== state.activeAnimation) {
    return { ...state, project: nextProject, selection, selections }
  }

  const animation = animations[Math.min(deletedIndex, animations.length - 1)]
  return loadAnimation({ ...state, selection, selections }, nextProject, animation)
}
