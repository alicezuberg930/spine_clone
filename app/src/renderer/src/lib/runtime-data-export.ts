import type {
  Animation,
  AudioTrack,
  ArtworkDocument,
  ArtworkLayer,
  Attachment,
  Bone,
  Constraint,
  EditorState,
  Skin,
  Slot
} from '@/@types'

import { createProjectSnapshot } from './project-serialization'

export const RUNTIME_DATA_FORMAT = 'layerforge-runtime' as const
export const RUNTIME_DATA_VERSION = 1 as const

export type RuntimeArtworkLayer = Omit<ArtworkLayer, 'dataUrl'>
export type RuntimeAudioTrack = Omit<AudioTrack, 'dataUrl'>

export interface RuntimeArtworkManifest extends Omit<ArtworkDocument, 'layers'> {
  layers: RuntimeArtworkLayer[]
}

export interface LayerforgeRuntimeDataV1 {
  format: typeof RUNTIME_DATA_FORMAT
  version: typeof RUNTIME_DATA_VERSION
  exportedAt: string
  skeleton: {
    id: string
    name: string
    projectName: string
    width: number
    height: number
  }
  bones: Bone[]
  slots: Slot[]
  attachments: Attachment[]
  constraints: Constraint[]
  skins: Skin[]
  animations: Animation[]
  artwork: RuntimeArtworkManifest | null
  audioTracks: RuntimeAudioTrack[]
}

function currentTimestamp(exportedAt?: string): string {
  if (!exportedAt) return new Date().toISOString()
  const timestamp = new Date(exportedAt)
  if (Number.isNaN(timestamp.valueOf())) throw new Error('The data export timestamp is invalid.')
  return timestamp.toISOString()
}

function dimension(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback
}

function createArtworkManifest(artwork: ArtworkDocument | null): RuntimeArtworkManifest | null {
  if (!artwork) return null

  return {
    id: artwork.id,
    name: artwork.name,
    sourceType: artwork.sourceType,
    width: artwork.width,
    height: artwork.height,
    importedAt: artwork.importedAt,
    layers: artwork.layers.map((layer): RuntimeArtworkLayer => {
      const { dataUrl: omittedDataUrl, ...manifest } = layer
      void omittedDataUrl
      return structuredClone(manifest)
    })
  }
}

function createAudioManifest(track: AudioTrack): RuntimeAudioTrack {
  return {
    id: track.id,
    name: track.name,
    sourceFileName: track.sourceFileName,
    mimeType: track.mimeType,
    sizeBytes: track.sizeBytes,
    durationSeconds: track.durationSeconds,
    sampleRate: track.sampleRate,
    channels: track.channels,
    waveform: structuredClone(track.waveform),
    startFrame: track.startFrame,
    volume: track.volume,
    muted: track.muted
  }
}

export function createRuntimeData(
  state: EditorState,
  exportedAt?: string
): LayerforgeRuntimeDataV1 {
  const timestamp = currentTimestamp(exportedAt)
  const project = createProjectSnapshot(state, timestamp)
  const fallbackWidth = project.artwork?.width ?? 800
  const fallbackHeight = project.artwork?.height ?? 600

  return {
    format: RUNTIME_DATA_FORMAT,
    version: RUNTIME_DATA_VERSION,
    exportedAt: timestamp,
    skeleton: {
      id: project.id,
      name: project.skeletonName,
      projectName: project.name,
      width: dimension(project.canvas.width, fallbackWidth),
      height: dimension(project.canvas.height, fallbackHeight)
    },
    bones: structuredClone(project.bones),
    slots: structuredClone(project.slots),
    attachments: structuredClone(project.attachments),
    constraints: structuredClone(project.constraints),
    skins: structuredClone(project.skins),
    animations: structuredClone(project.animations),
    artwork: createArtworkManifest(project.artwork),
    audioTracks: project.audioTracks.map(createAudioManifest)
  }
}

export function serializeRuntimeData(state: EditorState, exportedAt?: string): string {
  return `${JSON.stringify(createRuntimeData(state, exportedAt), null, 2)}\n`
}
