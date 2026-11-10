export type ArtworkSourceType = 'psd' | 'images'

export interface ArtworkLayer {
  id: string
  name: string
  groupPath: string[]
  dataUrl: string
  x: number
  y: number
  width: number
  height: number
  opacity: number
  visible: boolean
  blendMode: string
  order: number
  sourceFileName: string
}

export interface ArtworkDocument {
  id: string
  name: string
  sourceType: ArtworkSourceType
  width: number
  height: number
  layers: ArtworkLayer[]
  importedAt: string
}
