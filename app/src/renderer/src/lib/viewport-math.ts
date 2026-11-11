import type { Point } from '../@types/geometry'

export const MIN_VIEWPORT_ZOOM_PERCENT = 25
export const MAX_VIEWPORT_ZOOM_PERCENT = 400
export const DEFAULT_VIEWPORT_ZOOM_PERCENT = 100
export const DEFAULT_DRAG_THRESHOLD = 4
export const DEFAULT_VIEWPORT_CENTER: Point = { x: 400, y: 300 }

export interface ViewportRect extends Point {
  width: number
  height: number
}

export type SelectionMergeMode = 'replace' | 'add' | 'toggle'

export function normalizeViewportRect(start: Point, end: Point): ViewportRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  }
}

function rectBounds(rect: ViewportRect): {
  left: number
  top: number
  right: number
  bottom: number
} {
  const oppositeX = rect.x + rect.width
  const oppositeY = rect.y + rect.height
  return {
    left: Math.min(rect.x, oppositeX),
    top: Math.min(rect.y, oppositeY),
    right: Math.max(rect.x, oppositeX),
    bottom: Math.max(rect.y, oppositeY)
  }
}

/** Touching edges and corners count as an intersection. */
export function rectangleIntersects(first: ViewportRect, second: ViewportRect): boolean {
  const a = rectBounds(first)
  const b = rectBounds(second)
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top
}

export function exceedsDragThreshold(
  start: Point,
  end: Point,
  threshold = DEFAULT_DRAG_THRESHOLD
): boolean {
  const safeThreshold = Number.isFinite(threshold) ? Math.max(0, threshold) : DEFAULT_DRAG_THRESHOLD
  return Math.hypot(end.x - start.x, end.y - start.y) > safeThreshold
}

export function clampViewportZoom(zoomPercent: number): number {
  if (Number.isNaN(zoomPercent)) return DEFAULT_VIEWPORT_ZOOM_PERCENT
  return Math.min(MAX_VIEWPORT_ZOOM_PERCENT, Math.max(MIN_VIEWPORT_ZOOM_PERCENT, zoomPercent))
}

/**
 * Returns a new screen-space pan offset that keeps the document point below
 * `cursor` stationary while zoom changes around `center`.
 *
 * The matching transform is:
 * `translate(center + pan) scale(zoom) translate(-center)`.
 */
export function zoomPanAtPoint(
  pan: Point,
  cursor: Point,
  currentZoomPercent: number,
  nextZoomPercent: number,
  center: Point = DEFAULT_VIEWPORT_CENTER
): Point {
  const currentScale = clampViewportZoom(currentZoomPercent) / 100
  const nextScale = clampViewportZoom(nextZoomPercent) / 100
  const scaleRatio = nextScale / currentScale

  return {
    x: cursor.x - center.x - scaleRatio * (cursor.x - center.x - pan.x),
    y: cursor.y - center.y - scaleRatio * (cursor.y - center.y - pan.y)
  }
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

export function mergeSelectionIds(
  current: readonly string[],
  hits: readonly string[],
  mode: SelectionMergeMode
): string[] {
  const uniqueCurrent = uniqueIds(current)
  const uniqueHits = uniqueIds(hits)

  if (mode === 'replace') return uniqueHits

  const merged = new Set(uniqueCurrent)
  if (mode === 'add') {
    uniqueHits.forEach((id) => merged.add(id))
    return [...merged]
  }

  uniqueHits.forEach((id) => {
    if (merged.has(id)) merged.delete(id)
    else merged.add(id)
  })
  return [...merged]
}
