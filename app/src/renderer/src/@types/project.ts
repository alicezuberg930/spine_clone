import type { Animation } from './animation'
import type { ArtworkDocument } from './artwork'
import type { AudioTrack } from './audio'
import type { Attachment, Bone, Constraint, Skin, Slot } from './rig'

export interface ProjectCanvas {
  width: number
  height: number
}

export interface EditorProject {
  id: string
  name: string
  skeletonName: string
  canvas: ProjectCanvas
  /** Coordinate space used by bone transforms. Legacy rigs are aligned once on artwork import. */
  boneSpace: 'legacy' | 'canvas'
  bones: Bone[]
  slots: Slot[]
  attachments: Attachment[]
  constraints: Constraint[]
  skins: Skin[]
  animations: Animation[]
  artwork: ArtworkDocument | null
  audioTracks: AudioTrack[]
  updatedAt: string
}
