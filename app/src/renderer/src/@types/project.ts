import type { Animation } from './animation'
import type { ArtworkDocument } from './artwork'
import type { Attachment, Bone, Constraint, Skin, Slot } from './rig'

export interface EditorProject {
  id: string
  name: string
  skeletonName: string
  bones: Bone[]
  slots: Slot[]
  attachments: Attachment[]
  constraints: Constraint[]
  skins: Skin[]
  animations: Animation[]
  artwork: ArtworkDocument | null
  updatedAt: string
}
