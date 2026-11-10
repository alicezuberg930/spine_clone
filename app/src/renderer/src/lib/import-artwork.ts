import {
  getCompositeCanvas,
  getLayerCanvas,
  readPsd,
  type BlendMode,
  type Layer,
  type Psd
} from 'ag-psd'

import type { ArtworkDocument, ArtworkLayer } from '@/@types/artwork'

const MAX_FILE_BYTES = 100 * 1024 * 1024
const MAX_DIMENSION = 8192
const MAX_LAYERS = 250
const MAX_TOTAL_PIXELS = 150_000_000
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp'])

interface PsdLeaf {
  layer: Layer
  groupPath: string[]
  visible: boolean
  opacity: number
  x: number
  y: number
  width: number
  height: number
}

function createId(prefix: string): string {
  const suffix =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${suffix}`
}

function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : ''
}

function fileStem(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return (dot > 0 ? fileName.slice(0, dot) : fileName).trim() || 'Untitled artwork'
}

function assertFileSize(file: File): void {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`“${file.name}” is larger than the 100 MB import limit.`)
  }
}

function assertDimensions(width: number, height: number, label: string): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`${label} does not have valid image dimensions.`)
  }

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new Error(
      `${label} exceeds the maximum size of ${MAX_DIMENSION} × ${MAX_DIMENSION} pixels.`
    )
  }
}

function clampOpacity(value: number | undefined): number {
  return Math.max(0, Math.min(1, value ?? 1))
}

function cssBlendMode(blendMode: BlendMode | undefined): string {
  const modes: Partial<Record<BlendMode, string>> = {
    normal: 'normal',
    darken: 'darken',
    multiply: 'multiply',
    'color burn': 'color-burn',
    'darker color': 'darken',
    lighten: 'lighten',
    screen: 'screen',
    'color dodge': 'color-dodge',
    'linear dodge': 'plus-lighter',
    'lighter color': 'lighten',
    overlay: 'overlay',
    'soft light': 'soft-light',
    'hard light': 'hard-light',
    difference: 'difference',
    exclusion: 'exclusion',
    hue: 'hue',
    saturation: 'saturation',
    color: 'color',
    luminosity: 'luminosity'
  }

  return blendMode ? (modes[blendMode] ?? 'normal') : 'normal'
}

function canvasToDataUrl(canvas: HTMLCanvasElement, label: string): string {
  const dataUrl = canvas.toDataURL('image/png')
  if (!dataUrl || dataUrl === 'data:,') {
    throw new Error(`${label} could not be converted into a displayable image.`)
  }
  return dataUrl
}

function collectPsdLeaves(psd: Psd): PsdLeaf[] {
  const leaves: PsdLeaf[] = []
  let totalPixels = 0

  function visit(
    layers: Layer[],
    groupPath: string[],
    parentVisible: boolean,
    parentOpacity: number
  ): void {
    for (const layer of layers) {
      const name = layer.name?.trim() || `Layer ${leaves.length + 1}`
      const visible = parentVisible && !layer.hidden
      const opacity = parentOpacity * clampOpacity(layer.opacity)

      if (layer.children) {
        visit(layer.children, [...groupPath, name], visible, opacity)
        continue
      }

      if (leaves.length >= MAX_LAYERS) {
        throw new Error(`This PSD contains more than ${MAX_LAYERS} layers.`)
      }

      const x = layer.left ?? 0
      const y = layer.top ?? 0
      const right = layer.right ?? x
      const bottom = layer.bottom ?? y
      const width = right - x
      const height = bottom - y

      if (width < 0 || height < 0) {
        throw new Error(`Layer “${name}” has invalid bounds.`)
      }

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        throw new Error(
          `Layer “${name}” exceeds the maximum size of ${MAX_DIMENSION} × ${MAX_DIMENSION} pixels.`
        )
      }

      totalPixels += width * height
      if (totalPixels > MAX_TOTAL_PIXELS) {
        throw new Error('This PSD contains too much decoded image data to import safely.')
      }

      leaves.push({ layer, groupPath, visible, opacity, x, y, width, height })
    }
  }

  visit(psd.children ?? [], [], true, 1)
  return leaves
}

async function importPsd(file: File): Promise<ArtworkDocument> {
  const buffer = await file.arrayBuffer()
  let psd: Psd

  try {
    psd = readPsd(buffer, {
      useRawData: true,
      useRawThumbnail: true,
      skipLinkedFilesData: true,
      imageResourcesWhitelist: [],
      totalMemoryLimit: MAX_TOTAL_PIXELS * 4,
      logMissingFeatures: false
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'The file is not a readable PSD.'
    throw new Error(`Could not read “${file.name}”: ${reason}`, { cause: error })
  }

  assertDimensions(psd.width, psd.height, `PSD “${file.name}”`)
  const leaves = collectPsdLeaves(psd)
  const layers: ArtworkLayer[] = []

  for (const leaf of leaves) {
    if (leaf.width === 0 || leaf.height === 0) continue

    let canvas: HTMLCanvasElement | undefined
    try {
      canvas = getLayerCanvas(leaf.layer)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'The bitmap could not be decoded.'
      throw new Error(
        `Could not decode layer “${leaf.layer.name ?? 'Untitled layer'}”: ${reason}`,
        {
          cause: error
        }
      )
    }

    if (!canvas || canvas.width === 0 || canvas.height === 0) continue
    assertDimensions(canvas.width, canvas.height, `Layer “${leaf.layer.name ?? 'Untitled layer'}”`)

    layers.push({
      id: createId('artwork-layer'),
      name: leaf.layer.name?.trim() || `Layer ${layers.length + 1}`,
      groupPath: leaf.groupPath,
      dataUrl: canvasToDataUrl(canvas, `Layer “${leaf.layer.name ?? 'Untitled layer'}”`),
      x: leaf.x,
      y: leaf.y,
      width: canvas.width,
      height: canvas.height,
      opacity: leaf.opacity,
      visible: leaf.visible,
      blendMode: cssBlendMode(leaf.layer.blendMode),
      order: layers.length,
      sourceFileName: file.name
    })

    if (layers.length % 8 === 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    }
  }

  if (layers.length === 0) {
    let composite: HTMLCanvasElement | undefined
    try {
      composite = getCompositeCanvas(psd)
    } catch {
      composite = undefined
    }

    if (!composite || composite.width === 0 || composite.height === 0) {
      throw new Error(`“${file.name}” does not contain any displayable artwork layers.`)
    }

    assertDimensions(composite.width, composite.height, `PSD composite “${file.name}”`)
    layers.push({
      id: createId('artwork-layer'),
      name: `${fileStem(file.name)} composite`,
      groupPath: [],
      dataUrl: canvasToDataUrl(composite, `PSD composite “${file.name}”`),
      x: 0,
      y: 0,
      width: composite.width,
      height: composite.height,
      opacity: 1,
      visible: true,
      blendMode: 'normal',
      order: 0,
      sourceFileName: file.name
    })
  }

  return {
    id: createId('artwork-document'),
    name: fileStem(file.name),
    sourceType: 'psd',
    width: psd.width,
    height: psd.height,
    layers,
    importedAt: new Date().toISOString()
  }
}

async function importImages(files: File[]): Promise<ArtworkDocument> {
  if (files.length > MAX_LAYERS) {
    throw new Error(`Choose no more than ${MAX_LAYERS} image layers at once.`)
  }

  const layers: ArtworkLayer[] = []
  let documentWidth = 0
  let documentHeight = 0
  let totalPixels = 0

  for (const [index, file] of files.entries()) {
    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(file)
    } catch {
      throw new Error(`“${file.name}” is not a readable PNG, JPEG, or WebP image.`)
    }

    try {
      assertDimensions(bitmap.width, bitmap.height, `Image “${file.name}”`)
      totalPixels += bitmap.width * bitmap.height
      if (totalPixels > MAX_TOTAL_PIXELS) {
        throw new Error('The selected images contain too much decoded image data to import safely.')
      }

      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error(`Could not prepare “${file.name}” for display.`)
      context.drawImage(bitmap, 0, 0)

      layers.push({
        id: createId('artwork-layer'),
        name: fileStem(file.name),
        groupPath: [],
        dataUrl: canvasToDataUrl(canvas, `Image “${file.name}”`),
        x: 0,
        y: 0,
        width: bitmap.width,
        height: bitmap.height,
        opacity: 1,
        visible: true,
        blendMode: 'normal',
        order: index,
        sourceFileName: file.name
      })

      documentWidth = Math.max(documentWidth, bitmap.width)
      documentHeight = Math.max(documentHeight, bitmap.height)
    } finally {
      bitmap.close()
    }
  }

  return {
    id: createId('artwork-document'),
    name: files.length === 1 ? fileStem(files[0].name) : `${fileStem(files[0].name)} artwork`,
    sourceType: 'images',
    width: documentWidth,
    height: documentHeight,
    layers,
    importedAt: new Date().toISOString()
  }
}

export async function importArtworkFiles(files: File[]): Promise<ArtworkDocument> {
  if (files.length === 0) {
    throw new Error('Choose a PSD or at least one PNG, JPEG, or WebP image to import.')
  }

  for (const file of files) assertFileSize(file)

  const extensions = files.map((file) => fileExtension(file.name))
  const psdCount = extensions.filter((extension) => extension === 'psd').length

  if (psdCount > 0) {
    if (files.length !== 1 || psdCount !== 1) {
      throw new Error('Import one PSD at a time without mixing it with other image files.')
    }
    return importPsd(files[0])
  }

  const unsupportedFile = files.find((_, index) => !IMAGE_EXTENSIONS.has(extensions[index]))
  if (unsupportedFile) {
    throw new Error(
      `“${unsupportedFile.name}” is not supported. Choose PSD, PNG, JPEG, or WebP artwork.`
    )
  }

  return importImages(files)
}
