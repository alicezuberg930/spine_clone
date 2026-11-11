import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'

import type { Point } from '@/@types'
import { exceedsDragThreshold } from '@/lib/viewport-math'

export interface ArtworkBoneCreateOverlayProps {
  canvas: { width: number; height: number }
  parentBoneId: string | null
  viewportScale: number
  snap: boolean
  onCreate: (parentId: string | null, start: Point, end: Point) => void
}

interface BoneDraft {
  pointerId: number
  parentBoneId: string | null
  start: Point
  current: Point
  startClient: Point
}

const SNAP_GRID_SIZE = 10

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function snapCoordinate(value: number, maximum: number, snap: boolean): number {
  const resolved = snap ? Math.round(value / SNAP_GRID_SIZE) * SNAP_GRID_SIZE : value
  return clamp(resolved, 0, maximum)
}

function localArtworkPoint(
  surface: SVGRectElement,
  client: Point,
  canvas: { width: number; height: number },
  snap: boolean
): Point | null {
  const svg = surface.ownerSVGElement
  const matrix = surface.getScreenCTM()
  if (!svg || !matrix) return null

  const point = svg.createSVGPoint()
  point.x = client.x
  point.y = client.y
  const local = point.matrixTransform(matrix.inverse())

  return {
    x: snapCoordinate(local.x, canvas.width, snap),
    y: snapCoordinate(local.y, canvas.height, snap)
  }
}

/**
 * Artwork-local pointer surface and preview for Spine-style bone creation.
 * Render this last inside the artwork transform so it sits above attachments.
 */
export function ArtworkBoneCreateOverlay({
  canvas,
  parentBoneId,
  viewportScale,
  snap,
  onCreate
}: ArtworkBoneCreateOverlayProps): React.JSX.Element {
  const surfaceRef = useRef<SVGRectElement | null>(null)
  const draftRef = useRef<BoneDraft | null>(null)
  const [draft, setDraft] = useState<BoneDraft | null>(null)
  const safeScale = Math.max(0.001, viewportScale)
  const previewWidth = 2.25 / safeScale
  const jointRadius = 4.5 / safeScale

  const cancelDraft = useCallback((pointerId?: number): void => {
    const active = draftRef.current
    if (!active || (pointerId !== undefined && active.pointerId !== pointerId)) return

    draftRef.current = null
    setDraft(null)

    const surface = surfaceRef.current
    if (surface?.hasPointerCapture(active.pointerId)) {
      surface.releasePointerCapture(active.pointerId)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !draftRef.current) return
      event.preventDefault()
      event.stopPropagation()
      cancelDraft()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [cancelDraft])

  useEffect(
    () => () => {
      const active = draftRef.current
      draftRef.current = null
      const surface = surfaceRef.current
      if (active && surface?.hasPointerCapture(active.pointerId)) {
        surface.releasePointerCapture(active.pointerId)
      }
    },
    []
  )

  function pointForEvent(event: ReactPointerEvent<SVGRectElement>): Point | null {
    return localArtworkPoint(
      event.currentTarget,
      { x: event.clientX, y: event.clientY },
      canvas,
      snap
    )
  }

  function handlePointerDown(event: ReactPointerEvent<SVGRectElement>): void {
    if (event.button !== 0) return

    const start = pointForEvent(event)
    if (!start) return

    event.preventDefault()
    event.stopPropagation()
    const nextDraft: BoneDraft = {
      pointerId: event.pointerId,
      parentBoneId,
      start,
      current: start,
      startClient: { x: event.clientX, y: event.clientY }
    }
    draftRef.current = nextDraft
    setDraft(nextDraft)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<SVGRectElement>): void {
    const active = draftRef.current
    if (!active || active.pointerId !== event.pointerId) return

    const current = pointForEvent(event)
    if (!current) return

    event.preventDefault()
    event.stopPropagation()
    const nextDraft = { ...active, current }
    draftRef.current = nextDraft
    setDraft(nextDraft)
  }

  function handlePointerUp(event: ReactPointerEvent<SVGRectElement>): void {
    const active = draftRef.current
    if (!active || active.pointerId !== event.pointerId) return

    event.preventDefault()
    event.stopPropagation()
    const current = pointForEvent(event) ?? active.current
    const dragged = exceedsDragThreshold(active.startClient, {
      x: event.clientX,
      y: event.clientY
    })
    const end = dragged ? current : active.start

    draftRef.current = null
    setDraft(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    onCreate(active.parentBoneId, active.start, end)
  }

  function handlePointerCancel(event: ReactPointerEvent<SVGRectElement>): void {
    const active = draftRef.current
    if (!active || active.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    cancelDraft(event.pointerId)
  }

  return (
    <g data-editor-only="bone-create">
      <rect
        ref={surfaceRef}
        x={0}
        y={0}
        width={canvas.width}
        height={canvas.height}
        fill="transparent"
        pointerEvents="all"
        className="cursor-crosshair"
        aria-label="Create bone"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={(event) => cancelDraft(event.pointerId)}
      />
      {draft ? (
        <g pointerEvents="none" data-editor-only="bone-create-preview">
          <line
            x1={draft.start.x}
            y1={draft.start.y}
            x2={draft.current.x}
            y2={draft.current.y}
            stroke="#071014"
            strokeWidth={previewWidth * 2.5}
            strokeLinecap="round"
          />
          <line
            x1={draft.start.x}
            y1={draft.start.y}
            x2={draft.current.x}
            y2={draft.current.y}
            stroke="#67e8d0"
            strokeWidth={previewWidth}
            strokeLinecap="round"
          />
          <circle
            cx={draft.start.x}
            cy={draft.start.y}
            r={jointRadius}
            fill="#0d171d"
            stroke="#67e8d0"
            strokeWidth={previewWidth * 0.7}
          />
          <circle
            cx={draft.current.x}
            cy={draft.current.y}
            r={jointRadius * 0.82}
            fill="#0d171d"
            stroke="#d8fff8"
            strokeWidth={previewWidth * 0.65}
          />
        </g>
      ) : null}
    </g>
  )
}
