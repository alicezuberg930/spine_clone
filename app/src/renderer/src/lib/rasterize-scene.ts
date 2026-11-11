const MAX_OUTPUT_DIMENSION = 16_384
const MAX_OUTPUT_PIXELS = 100_000_000

export interface SceneRasterOptions {
  width: number
  height: number
  backgroundColor?: string | null
}

function outputDimension(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`)
  }

  const rounded = Math.round(value)
  if (rounded > MAX_OUTPUT_DIMENSION) {
    throw new Error(`${label} cannot exceed ${MAX_OUTPUT_DIMENSION.toLocaleString()} pixels.`)
  }
  return rounded
}

function validateOutputSize(options: SceneRasterOptions): { width: number; height: number } {
  const width = outputDimension(options.width, 'Export width')
  const height = outputDimension(options.height, 'Export height')
  if (width * height > MAX_OUTPUT_PIXELS) {
    throw new Error('The requested image contains too many pixels to render safely.')
  }
  return { width, height }
}

function cloneSceneSvg(source: SVGSVGElement, width: number, height: number): SVGSVGElement {
  const clone = source.cloneNode(true) as SVGSVGElement
  clone.querySelectorAll('[data-editor-only], [data-export-exclude]').forEach((element) => {
    element.remove()
  })
  clone.querySelectorAll('[data-selection-stroke]').forEach((element) => {
    element.setAttribute('stroke', '#071013')
    element.setAttribute('stroke-width', '5')
    element.removeAttribute('data-selection-stroke')
  })
  clone.querySelectorAll('[data-export-transform]').forEach((element) => {
    const transform = element.getAttribute('data-export-transform')
    if (transform) element.setAttribute('transform', transform)
    element.removeAttribute('data-export-transform')
  })

  const exportViewBox = clone.getAttribute('data-export-view-box')
  if (exportViewBox) clone.setAttribute('viewBox', exportViewBox)
  clone.removeAttribute('data-export-view-box')

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))

  if (!clone.hasAttribute('viewBox')) {
    const sourceWidth = source.viewBox.baseVal.width || source.clientWidth || width
    const sourceHeight = source.viewBox.baseVal.height || source.clientHeight || height
    clone.setAttribute('viewBox', `0 0 ${sourceWidth} ${sourceHeight}`)
  }

  return clone
}

async function loadSvgImage(svg: SVGSVGElement): Promise<{
  image: HTMLImageElement
  objectUrl: string
}> {
  const serialized = new XMLSerializer().serializeToString(svg)
  const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  const image = new Image()
  image.decoding = 'sync'

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('The scene could not be decoded for export.'))
      image.src = objectUrl
    })
    return { image, objectUrl }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

export async function drawSceneToCanvas(
  source: SVGSVGElement,
  canvas: HTMLCanvasElement,
  options: SceneRasterOptions
): Promise<void> {
  const { width, height } = validateOutputSize(options)
  const svg = cloneSceneSvg(source, width, height)
  const { image, objectUrl } = await loadSvgImage(svg)

  try {
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: true })
    if (!context) throw new Error('The image renderer is not available.')

    context.clearRect(0, 0, width, height)
    if (options.backgroundColor) {
      context.fillStyle = options.backgroundColor
      context.fillRect(0, 0, width, height)
    }
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, width, height)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob && blob.size > 0) resolve(blob)
        else reject(new Error('The image encoder produced no PNG data.'))
      }, 'image/png')
    } catch (error) {
      reject(
        error instanceof DOMException && error.name === 'SecurityError'
          ? new Error('The scene contains an image that is not safe to export.', { cause: error })
          : error
      )
    }
  })
}

export async function rasterizeSceneToPng(
  source: SVGSVGElement,
  options: SceneRasterOptions
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  await drawSceneToCanvas(source, canvas, options)
  const blob = await canvasToPng(canvas)
  return new Uint8Array(await blob.arrayBuffer())
}
