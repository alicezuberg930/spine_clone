import type { EditorProject, PhysicsParams, Transform } from '@/@types'

export const DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  shearX: 0,
  shearY: 0,
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

/**
 * Creates an editor-ready project with no authored rig or media content.
 *
 * A technical skin and animation keep the corresponding editor controls usable,
 * but neither contains attachments, tracks, keyframes, or other sample content.
 */
export function createEmptyProject(): EditorProject {
  return {
    id: 'project-untitled',
    name: 'Untitled rig',
    skeletonName: 'Untitled rig',
    canvas: { width: 800, height: 600 },
    boneSpace: 'canvas',
    bones: [],
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
        id: 'animation-default',
        name: 'Animation',
        duration: 120,
        fps: 30,
        loop: true,
        tracks: [],
        keyframes: []
      }
    ],
    artwork: null,
    audioTracks: [],
    updatedAt: new Date().toISOString()
  }
}
