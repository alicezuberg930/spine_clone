import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'

import type { Point } from '@/@types/geometry'
import type {
  ArtworkClipping,
  ArtworkMesh,
  ClipVertex,
  GeometrySelection,
  GeometrySelectionKind,
  MeshDeformValue,
  WeightBrush
} from '@/@types/mesh'
import {
  deformedVertexPosition,
  resolveMeshTriangles,
  vertexWeightForBone
} from '@/lib/mesh-geometry'

export type ArtworkGeometryTool = 'mesh' | 'deform' | 'weights' | 'clipping'

export interface GeometryVertexPatch {
  id: string
  position: Point
}

export interface ArtworkGeometryOverlayProps {
  layerId: string
  width: number
  height: number
  tool: ArtworkGeometryTool
  mesh?: ArtworkMesh
  clipping?: ArtworkClipping
  deformation?: MeshDeformValue['offsets'] | null
  selection?: GeometrySelection | null
  weightBrush?: WeightBrush
  showMesh?: boolean
  showWeights?: boolean
  showClipping?: boolean
  /** Document-to-viewport scale, used to keep handles a consistent screen size. */
  viewportScale?: number
  onSelectionChange?: (selection: GeometrySelection) => void
  onMeshVerticesChange?: (layerId: string, changes: GeometryVertexPatch[]) => void
  onDeformationChange?: (layerId: string, offsets: MeshDeformValue['offsets']) => void
  onClippingVerticesChange?: (layerId: string, changes: GeometryVertexPatch[]) => void
  onWeightPaint?: (layerId: string, point: Point, brush: WeightBrush) => void
  onAddClipVertex?: (layerId: string, afterVertexId: string, point: Point) => void
  onRemoveVertices?: (layerId: string, kind: GeometrySelectionKind, vertexIds: string[]) => void
}

type DragState =
  | {
      kind: 'mesh'
      start: Point
      ids: string[]
      positions: Record<string, Point>
    }
  | {
      kind: 'deform'
      start: Point
      ids: string[]
      offsets: MeshDeformValue['offsets']
    }
  | {
      kind: 'clip'
      start: Point
      ids: string[]
      positions: Record<string, Point>
    }

function localPoint<T extends SVGGraphicsElement>(event: {
  currentTarget: T
  clientX: number
  clientY: number
}): Point {
  const element = event.currentTarget
  const svg = element.ownerSVGElement
  const matrix = element.getScreenCTM()
  if (!svg || !matrix) return { x: event.clientX, y: event.clientY }
  const point = svg.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const transformed = point.matrixTransform(matrix.inverse())
  return { x: transformed.x, y: transformed.y }
}

const polygonPoints = (points: Point[]): string =>
  points.map((point) => `${point.x},${point.y}`).join(' ')

function selectedIdsForClick(
  selection: GeometrySelection | null | undefined,
  layerId: string,
  kind: GeometrySelectionKind,
  vertexId: string,
  additive: boolean
): string[] {
  const current =
    selection?.layerId === layerId && selection.kind === kind ? selection.vertexIds : []
  if (!additive) return current.includes(vertexId) && current.length > 1 ? current : [vertexId]
  return current.includes(vertexId)
    ? current.filter((id) => id !== vertexId)
    : [...current, vertexId]
}

function heatColor(weight: number): string {
  const amount = Math.max(0, Math.min(1, weight))
  const hue = 174 - amount * 166
  return `hsl(${hue} 82% 62%)`
}

/**
 * SVG interaction overlay for mesh setup, keyed deformation, weight painting,
 * and clipping polygon editing. Render it inside the same layer-local `<g>` as
 * ArtworkLayerRenderer (usually translated by the layer's x/y).
 */
export function ArtworkGeometryOverlay({
  layerId,
  width,
  height,
  tool,
  mesh,
  clipping,
  deformation,
  selection,
  weightBrush,
  showMesh = false,
  showWeights = false,
  showClipping = false,
  viewportScale = 1,
  onSelectionChange,
  onMeshVerticesChange,
  onDeformationChange,
  onClippingVerticesChange,
  onWeightPaint,
  onAddClipVertex,
  onRemoveVertices
}: ArtworkGeometryOverlayProps): React.JSX.Element {
  const dragRef = useRef<DragState | null>(null)
  const [brushPosition, setBrushPosition] = useState<Point | null>(null)
  const safeScale = Math.max(0.001, viewportScale)
  const strokeWidth = 1.25 / safeScale
  const handleRadius = 4 / safeScale
  const selectedRadius = 5.5 / safeScale
  const meshVisible = Boolean(mesh && (showMesh || ['mesh', 'deform', 'weights'].includes(tool)))
  const weightsVisible = Boolean(mesh && (showWeights || tool === 'weights'))
  const clipVisible = Boolean(
    clipping && clipping.vertices.length >= 2 && (showClipping || tool === 'clipping')
  )
  const resolvedTriangles = mesh ? resolveMeshTriangles(mesh, deformation) : []
  const selectedMeshIds =
    selection?.layerId === layerId && selection.kind === 'mesh'
      ? new Set(selection.vertexIds)
      : new Set<string>()
  const selectedClipIds =
    selection?.layerId === layerId && selection.kind === 'clip'
      ? new Set(selection.vertexIds)
      : new Set<string>()

  function beginMeshDrag(event: ReactPointerEvent<SVGCircleElement>, vertexId: string): void {
    event.preventDefault()
    event.stopPropagation()
    const ids = selectedIdsForClick(selection, layerId, 'mesh', vertexId, event.shiftKey)
    onSelectionChange?.({ kind: 'mesh', layerId, vertexIds: ids })
    if (ids.length === 0 || tool === 'weights') {
      if (tool === 'weights' && weightBrush) {
        onWeightPaint?.(layerId, localPoint(event), weightBrush)
      }
      return
    }

    const start = localPoint(event)
    if (tool === 'mesh' && mesh) {
      dragRef.current = {
        kind: 'mesh',
        start,
        ids,
        positions: Object.fromEntries(
          mesh.vertices
            .filter((vertex) => ids.includes(vertex.id))
            .map((vertex) => [vertex.id, { ...vertex.position }])
        )
      }
    } else if (tool === 'deform' && mesh) {
      dragRef.current = {
        kind: 'deform',
        start,
        ids,
        offsets: Object.fromEntries(
          ids.map((id) => [id, { ...(deformation?.[id] ?? { x: 0, y: 0 }) }])
        )
      }
    } else {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function beginClipDrag(event: ReactPointerEvent<SVGCircleElement>, vertexId: string): void {
    event.preventDefault()
    event.stopPropagation()
    if (!clipping) return
    const ids = selectedIdsForClick(selection, layerId, 'clip', vertexId, event.shiftKey)
    onSelectionChange?.({ kind: 'clip', layerId, vertexIds: ids })
    if (ids.length === 0) return
    dragRef.current = {
      kind: 'clip',
      start: localPoint(event),
      ids,
      positions: Object.fromEntries(
        clipping.vertices
          .filter((vertex) => ids.includes(vertex.id))
          .map((vertex) => [vertex.id, { x: vertex.x, y: vertex.y }])
      )
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function continueDrag(event: ReactPointerEvent<SVGCircleElement>): void {
    const drag = dragRef.current
    if (!drag) return
    event.preventDefault()
    event.stopPropagation()
    const point = localPoint(event)
    const delta = { x: point.x - drag.start.x, y: point.y - drag.start.y }

    if (drag.kind === 'mesh') {
      onMeshVerticesChange?.(
        layerId,
        drag.ids.map((id) => ({
          id,
          position: {
            x: drag.positions[id].x + delta.x,
            y: drag.positions[id].y + delta.y
          }
        }))
      )
    } else if (drag.kind === 'deform') {
      onDeformationChange?.(
        layerId,
        Object.fromEntries(
          drag.ids.map((id) => [
            id,
            {
              x: drag.offsets[id].x + delta.x,
              y: drag.offsets[id].y + delta.y
            }
          ])
        )
      )
    } else {
      onClippingVerticesChange?.(
        layerId,
        drag.ids.map((id) => ({
          id,
          position: {
            x: drag.positions[id].x + delta.x,
            y: drag.positions[id].y + delta.y
          }
        }))
      )
    }
  }

  function endDrag(event: ReactPointerEvent<SVGCircleElement>): void {
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function paintWeights(event: ReactPointerEvent<SVGRectElement>): void {
    if (tool !== 'weights' || !weightBrush) return
    event.preventDefault()
    event.stopPropagation()
    const point = localPoint(event)
    setBrushPosition(point)
    onWeightPaint?.(layerId, point, weightBrush)
  }

  function handleDelete(event: ReactKeyboardEvent<SVGGElement>): void {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return
    if (!selection || selection.layerId !== layerId || selection.vertexIds.length === 0) return
    event.preventDefault()
    onRemoveVertices?.(layerId, selection.kind, selection.vertexIds)
  }

  return (
    <g tabIndex={0} aria-label="Artwork geometry editor" onKeyDown={handleDelete}>
      {tool === 'weights' && mesh ? (
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          pointerEvents="all"
          onPointerEnter={(event) => setBrushPosition(localPoint(event))}
          onPointerMove={(event) => {
            setBrushPosition(localPoint(event))
            if (event.currentTarget.hasPointerCapture(event.pointerId)) paintWeights(event)
          }}
          onPointerLeave={() => setBrushPosition(null)}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            paintWeights(event)
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
          }}
          onPointerCancel={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
          }}
        />
      ) : null}

      {weightsVisible && mesh && weightBrush?.boneId ? (
        <g pointerEvents="none" style={{ mixBlendMode: 'screen' }}>
          {mesh.vertices.map((vertex) => {
            const point = deformedVertexPosition(vertex, deformation)
            const weight = vertexWeightForBone(vertex, weightBrush.boneId)
            return (
              <circle
                key={`heat-${vertex.id}`}
                cx={point.x}
                cy={point.y}
                r={(8 + weight * 12) / safeScale}
                fill={heatColor(weight)}
                fillOpacity={0.08 + weight * 0.48}
              />
            )
          })}
        </g>
      ) : null}

      {meshVisible && mesh ? (
        <g>
          <g
            fill="none"
            stroke="#70e1cf"
            strokeWidth={strokeWidth}
            strokeOpacity={tool === 'weights' ? 0.5 : 0.78}
            pointerEvents="none"
          >
            {resolvedTriangles.map((triangle) => (
              <polygon key={triangle.id} points={polygonPoints(triangle.destination)} />
            ))}
          </g>
          {mesh.vertices.map((vertex) => {
            const point = deformedVertexPosition(vertex, deformation)
            const selected = selectedMeshIds.has(vertex.id)
            const weight = vertexWeightForBone(vertex, weightBrush?.boneId ?? null)
            return (
              <circle
                key={vertex.id}
                cx={point.x}
                cy={point.y}
                r={selected ? selectedRadius : handleRadius}
                fill={tool === 'weights' ? heatColor(weight) : selected ? '#45d6bd' : '#0a1419'}
                stroke={selected ? '#eafffb' : '#70e1cf'}
                strokeWidth={strokeWidth}
                className={tool === 'weights' ? 'cursor-cell' : 'cursor-move'}
                onPointerDown={(event) => beginMeshDrag(event, vertex.id)}
                onPointerMove={continueDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
            )
          })}
        </g>
      ) : null}

      {clipVisible && clipping ? (
        <g>
          <polygon
            points={polygonPoints(clipping.vertices)}
            fill="#f4b85a"
            fillOpacity={0.08}
            stroke="#f4b85a"
            strokeWidth={strokeWidth * 1.2}
            strokeDasharray={`${5 / safeScale} ${4 / safeScale}`}
            pointerEvents="none"
          />
          {clipping.vertices.map((vertex, index) => {
            const next = clipping.vertices[(index + 1) % clipping.vertices.length]
            return (
              <line
                key={`edge-${vertex.id}`}
                x1={vertex.x}
                y1={vertex.y}
                x2={next.x}
                y2={next.y}
                stroke="transparent"
                strokeWidth={12 / safeScale}
                className="cursor-copy"
                onDoubleClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onAddClipVertex?.(layerId, vertex.id, localPoint(event))
                }}
              />
            )
          })}
          {clipping.vertices.map((vertex: ClipVertex) => {
            const selected = selectedClipIds.has(vertex.id)
            return (
              <circle
                key={vertex.id}
                cx={vertex.x}
                cy={vertex.y}
                r={selected ? selectedRadius : handleRadius}
                fill={selected ? '#f4b85a' : '#17130b'}
                stroke={selected ? '#fff2ce' : '#f4b85a'}
                strokeWidth={strokeWidth}
                className="cursor-move"
                onPointerDown={(event) => beginClipDrag(event, vertex.id)}
                onPointerMove={continueDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
            )
          })}
        </g>
      ) : null}

      {tool === 'weights' && brushPosition && weightBrush ? (
        <circle
          cx={brushPosition.x}
          cy={brushPosition.y}
          r={weightBrush.radius}
          fill="none"
          stroke="#f7d67c"
          strokeWidth={strokeWidth}
          strokeDasharray={`${3 / safeScale} ${2 / safeScale}`}
          pointerEvents="none"
        />
      ) : null}
    </g>
  )
}
