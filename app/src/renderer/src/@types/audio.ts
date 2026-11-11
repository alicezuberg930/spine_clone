export interface AudioClip {
  id: string
  name: string
  sourceFileName: string
  mimeType: string
  sizeBytes: number
  dataUrl: string
  durationSeconds: number
  sampleRate: number
  channels: number
  waveform: number[]
  startFrame: number
  volume: number
  muted: boolean
}

export type AudioTrack = AudioClip
