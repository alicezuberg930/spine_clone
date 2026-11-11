import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent
} from 'react'
import {
  Bone,
  Box,
  ChevronDown,
  Crosshair,
  Crop,
  Eye,
  Focus,
  Grid3X3,
  Magnet,
  Maximize2,
  Minus,
  MoreHorizontal,
  Plus,
  ScanLine,
  Sparkles,
  Weight
} from 'lucide-react'

import type {
  ArtworkDocument,
  Bone as BoneType,
  EditorMode,
  EditorTool,
  GeometrySelection,
  MeshDeformValue,
  Point,
  Transform,
  WeightBrush
} from '@/@types'
import { ArtworkBoneCreateOverlay } from '@/components/editor/artwork-bone-create-overlay'
import { ArtworkBoneTransformGizmo } from '@/components/editor/artwork-bone-transform-gizmo'
import { ArtworkGeometryOverlay } from '@/components/editor/artwork-geometry-overlay'
import { ArtworkLayerRenderer } from '@/components/editor/artwork-layer-renderer'
import { ArtworkSkeletonOverlay } from '@/components/editor/artwork-skeleton-overlay'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { artworkLayerMatrix } from '@/lib/artwork-bone-binding'
import { svgMatrix } from '@/lib/mesh-geometry'
import { resolveBoneWorldMatrices } from '@/lib/skeleton-geometry'
import { cn } from '@/lib/utils'
import {
  clampViewportZoom,
  exceedsDragThreshold,
  mergeSelectionIds,
  normalizeViewportRect,
  rectangleIntersects,
  zoomPanAtPoint,
  type ViewportRect
} from '@/lib/viewport-math'

interface ViewportFlags {
  showGrid: boolean
  showBones: boolean
  showMesh: boolean
  showWeights: boolean
  showClipping: boolean
  showBounds: boolean
  ghosting: boolean
  snap: boolean
  physicsEnabled: boolean
}

interface ViewportCanvasProps {
  mode: EditorMode
  tool: EditorTool
  frame: number
  duration: number
  zoom: number
  transform: Transform
  projectName: string
  canvas: { width: number; height: number }
  artwork: ArtworkDocument | null
  bones: BoneType[]
  geometrySelection: GeometrySelection | null
  weightBrush: WeightBrush
  deformations: Record<string, MeshDeformValue['offsets']>
  keyedDeformations: Record<string, MeshDeformValue['offsets']>
  selectedId: string
  selectedIds: string[]
  isPlaying: boolean
  flags: ViewportFlags
  onZoomChange: (zoom: number) => void
  onTransformChange: (patch: Partial<Transform>) => void
  onGeometrySelectionChange: (selection: GeometrySelection) => void
  onMeshVerticesChange: (layerId: string, changes: Array<{ id: string; position: Point }>) => void
  onDeformationChange: (layerId: string, offsets: MeshDeformValue['offsets']) => void
  onClippingVerticesChange: (
    layerId: string,
    changes: Array<{ id: string; position: Point }>
  ) => void
  onWeightPaint: (layerId: string, point: Point) => void
  onAddClipVertex: (layerId: string, afterVertexId: string, point: Point) => void
  onRemoveGeometryVertices: (layerId: string, kind: 'mesh' | 'clip', ids: string[]) => void
  onCreateBone: (parentId: string | null, start: Point, end: Point) => void
  onSvgElement?: (element: SVGSVGElement | null) => void
  onSelect: (id: string) => void
  onSelectMany: (ids: string[]) => void
  onToggle: (key: keyof ViewportFlags) => void
  onFeatureNotImplemented: (feature: string) => void
}

interface CanvasCompositionProps {
  artwork: ArtworkDocument | null
  canvas: { width: number; height: number }
  bones: BoneType[]
  selectedId: string
  selectedIds: ReadonlySet<string>
  tool: EditorTool
  zoom: number
  flags: Pick<ViewportFlags, 'showBones' | 'showMesh' | 'showWeights' | 'showClipping' | 'snap'>
  geometrySelection: GeometrySelection | null
  weightBrush: WeightBrush
  deformations: Record<string, MeshDeformValue['offsets']>
  keyedDeformations: Record<string, MeshDeformValue['offsets']>
  onSelect: (id: string) => void
  onGeometrySelectionChange: (selection: GeometrySelection) => void
  onMeshVerticesChange: (layerId: string, changes: Array<{ id: string; position: Point }>) => void
  onDeformationChange: (layerId: string, offsets: MeshDeformValue['offsets']) => void
  onClippingVerticesChange: (
    layerId: string,
    changes: Array<{ id: string; position: Point }>
  ) => void
  onWeightPaint: (layerId: string, point: Point) => void
  onAddClipVertex: (layerId: string, afterVertexId: string, point: Point) => void
  onRemoveGeometryVertices: (layerId: string, kind: 'mesh' | 'clip', ids: string[]) => void
  onCreateBone: (parentId: string | null, start: Point, end: Point) => void
  onTransformChange: (patch: Partial<Transform>) => void
}

function CanvasComposition({
  artwork,
  canvas,
  bones,
  selectedId,
  selectedIds,
  tool,
  zoom,
  flags,
  geometrySelection,
  weightBrush,
  deformations,
  keyedDeformations,
  onSelect,
  onGeometrySelectionChange,
  onMeshVerticesChange,
  onDeformationChange,
  onClippingVerticesChange,
  onWeightPaint,
  onAddClipVertex,
  onRemoveGeometryVertices,
  onCreateBone,
  onTransformChange
}: CanvasCompositionProps): React.JSX.Element {
  const width = Math.max(1, artwork?.width ?? canvas.width)
  const height = Math.max(1, artwork?.height ?? canvas.height)
  const fit = Math.max(0.01, Math.min(680 / width, 500 / height))
  const x = (800 - width * fit) / 2
  const y = (600 - height * fit) / 2
  const layers = artwork?.layers ?? []
  const selectedLayer = layers.find((layer) => layer.id === selectedId)
  const selectedLayers = layers.filter((layer) => selectedIds.has(layer.id))
  const boneWorldMatrices = useMemo(() => resolveBoneWorldMatrices(bones), [bones])
  const selectedParentId = bones.some((bone) => bone.id === selectedId)
    ? selectedId
    : (bones.find((bone) => bone.parentId === null)?.id ?? null)
  const displaysBones =
    flags.showBones || ['create-bone', 'translate', 'rotate', 'scale', 'shear'].includes(tool)

  return (
    <g>
      <rect
        data-editor-only="canvas-frame"
        x={x}
        y={y}
        width={width * fit}
        height={height * fit}
        fill="#05090c"
        fillOpacity="0.28"
        stroke="#58717c"
        strokeOpacity="0.55"
        strokeWidth="1"
      />
      <g
        transform={`translate(${x} ${y}) scale(${fit})`}
        data-export-transform="translate(0 0) scale(1)"
      >
        {[...layers]
          .reverse()
          .filter((layer) => layer.visible)
          .map((layer) => (
            <g key={layer.id} data-selection-id={layer.id}>
              <ArtworkLayerRenderer
                layer={layer}
                deformation={deformations[layer.id]}
                boneWorldMatrix={layer.boneId ? boneWorldMatrices.get(layer.boneId) : null}
                className="cursor-pointer"
                onPointerDown={(event) => {
                  if (event.button !== 0 || tool === 'create-bone') return
                  event.stopPropagation()
                  onSelect(layer.id)
                }}
              />
            </g>
          ))}

        {displaysBones ? (
          <ArtworkSkeletonOverlay
            bones={bones}
            selectedBoneId={selectedId}
            viewportScale={fit * (zoom / 100)}
            interactive={!['create-bone', 'mesh', 'deform', 'weights', 'clipping'].includes(tool)}
            onSelectBone={onSelect}
          />
        ) : null}

        <ArtworkBoneTransformGizmo
          bones={bones}
          selectedBoneId={selectedId}
          tool={tool}
          viewportScale={fit * (zoom / 100)}
          onTransformChange={onTransformChange}
        />

        {selectedLayers.map((layer) => {
          const matrix = artworkLayerMatrix(
            layer,
            layer.boneId ? boneWorldMatrices.get(layer.boneId) : null
          )
          return (
            <rect
              key={layer.id}
              x={0}
              y={0}
              width={layer.width}
              height={layer.height}
              transform={svgMatrix(matrix)}
              fill="none"
              stroke="#45d6bd"
              strokeWidth={Math.max(1, 1.5 / fit)}
              strokeDasharray={`${Math.max(3, 5 / fit)} ${Math.max(2, 3 / fit)}`}
              pointerEvents="none"
              data-editor-only="selection"
            />
          )
        })}

        {selectedLayer && ['mesh', 'deform', 'weights', 'clipping'].includes(tool) ? (
          <g
            transform={svgMatrix(
              artworkLayerMatrix(
                selectedLayer,
                selectedLayer.boneId ? boneWorldMatrices.get(selectedLayer.boneId) : null
              )
            )}
            data-editor-only="geometry"
          >
            <ArtworkGeometryOverlay
              layerId={selectedLayer.id}
              width={selectedLayer.width}
              height={selectedLayer.height}
              tool={tool as 'mesh' | 'deform' | 'weights' | 'clipping'}
              mesh={selectedLayer.mesh}
              clipping={selectedLayer.clipping}
              deformation={keyedDeformations[selectedLayer.id]}
              selection={geometrySelection}
              weightBrush={weightBrush}
              showMesh={flags.showMesh}
              showWeights={flags.showWeights}
              showClipping={flags.showClipping}
              viewportScale={fit * (zoom / 100)}
              onSelectionChange={onGeometrySelectionChange}
              onMeshVerticesChange={onMeshVerticesChange}
              onDeformationChange={onDeformationChange}
              onClippingVerticesChange={onClippingVerticesChange}
              onWeightPaint={onWeightPaint}
              onAddClipVertex={onAddClipVertex}
              onRemoveVertices={onRemoveGeometryVertices}
            />
          </g>
        ) : null}

        {tool === 'create-bone' ? (
          <ArtworkBoneCreateOverlay
            canvas={{ width, height }}
            parentBoneId={selectedParentId}
            viewportScale={fit * (zoom / 100)}
            snap={flags.snap}
            onCreate={onCreateBone}
          />
        ) : null}
      </g>
    </g>
  )
}

function ViewportToggle({
  label,
  icon: Icon,
  checked,
  onCheckedChange
}: {
  label: string
  icon: typeof Grid3X3
  checked: boolean
  onCheckedChange: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-xs">
        <Icon className="size-3.5 text-muted-foreground" />
        <span>{label}</span>
      </div>
      <Switch size="sm" checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

export function ViewportCanvas({
  mode,
  tool,
  frame,
  duration,
  zoom,
  transform,
  projectName,
  canvas,
  artwork,
  bones,
  geometrySelection,
  weightBrush,
  deformations,
  keyedDeformations,
  selectedId,
  selectedIds,
  isPlaying,
  flags,
  onZoomChange,
  onTransformChange,
  onGeometrySelectionChange,
  onMeshVerticesChange,
  onDeformationChange,
  onClippingVerticesChange,
  onWeightPaint,
  onAddClipVertex,
  onRemoveGeometryVertices,
  onCreateBone,
  onSvgElement,
  onSelect,
  onSelectMany,
  onToggle,
  onFeatureNotImplemented
}: ViewportCanvasProps): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null)
  const [viewportPan, setViewportPan] = useState<Point>({ x: 0, y: 0 })
  const [marqueeRect, setMarqueeRect] = useState<ViewportRect | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const viewportPanRef = useRef(viewportPan)
  const viewportZoomRef = useRef(zoom)
  const panDragRef = useRef<{
    pointerId: number
    start: Point
    origin: Point
  } | null>(null)
  const marqueeDragRef = useRef<{
    pointerId: number
    startClient: Point
    currentClient: Point
    startViewport: Point
    mode: 'replace' | 'add' | 'toggle'
    initialIds: string[]
  } | null>(null)
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const documentWidth = Math.max(1, artwork?.width ?? canvas.width)
  const documentHeight = Math.max(1, artwork?.height ?? canvas.height)
  const playProgress = Math.round((frame / Math.max(1, duration)) * 100)

  useEffect(() => {
    viewportPanRef.current = viewportPan
  }, [viewportPan])

  useEffect(() => {
    viewportZoomRef.current = zoom
  }, [zoom])

  function pointerInViewport(
    event: Pick<ReactPointerEvent<SVGElement> | ReactWheelEvent<SVGElement>, 'clientX' | 'clientY'>
  ): Point {
    const matrix = svgRef.current?.getScreenCTM()
    if (!matrix) return { x: event.clientX, y: event.clientY }
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  }

  function applyViewportZoom(nextZoomValue: number, anchor: Point = { x: 400, y: 300 }): void {
    const currentZoom = viewportZoomRef.current
    const nextZoom = clampViewportZoom(nextZoomValue)
    if (Math.abs(nextZoom - currentZoom) < 0.001) return
    const nextPan = zoomPanAtPoint(viewportPanRef.current, anchor, currentZoom, nextZoom)
    viewportPanRef.current = nextPan
    viewportZoomRef.current = nextZoom
    setViewportPan(nextPan)
    onZoomChange(nextZoom)
  }

  function selectionModeForPointer(
    event: Pick<ReactPointerEvent<SVGSVGElement>, 'shiftKey' | 'ctrlKey' | 'metaKey'>
  ): 'replace' | 'add' | 'toggle' {
    if (event.ctrlKey || event.metaKey) return 'toggle'
    return event.shiftKey ? 'add' : 'replace'
  }

  function selectableIdAtPoint(client: Point): string | null {
    const svg = svgRef.current
    if (!svg) return null
    for (const element of document.elementsFromPoint(client.x, client.y)) {
      const boneSelectable = element.closest<SVGElement>('[data-bone-selection-id]')
      if (boneSelectable && svg.contains(boneSelectable)) {
        const boneId = boneSelectable.dataset.boneSelectionId
        if (boneId) return boneId
      }
      const selectable = element.closest<SVGElement>('[data-selection-id]')
      if (!selectable || !svg.contains(selectable) || selectable.closest('[data-editor-only]')) {
        continue
      }
      const id = selectable.dataset.selectionId
      if (id) return id
    }
    return null
  }

  function selectableIdsInRect(clientRect: ViewportRect): string[] {
    const svg = svgRef.current
    if (!svg) return []
    const ids: string[] = []
    svg.querySelectorAll<SVGGraphicsElement>('[data-selection-id]').forEach((element) => {
      if (element.closest('[data-editor-only]') && !element.dataset.boneSelectionId) return
      const id = element.dataset.selectionId
      if (!id) return
      const bounds = element.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return
      if (
        rectangleIntersects(clientRect, {
          x: bounds.left,
          y: bounds.top,
          width: bounds.width,
          height: bounds.height
        })
      ) {
        ids.push(id)
      }
    })
    return [...new Set(ids)]
  }

  function handleViewportPointerDownCapture(event: ReactPointerEvent<SVGSVGElement>): void {
    if (event.button === 2) {
      event.preventDefault()
      event.stopPropagation()
      panDragRef.current = {
        pointerId: event.pointerId,
        start: pointerInViewport(event),
        origin: { ...viewportPanRef.current }
      }
      setIsPanning(true)
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }

    if (event.button !== 0 || tool !== 'select') return
    event.preventDefault()
    event.stopPropagation()
    const client = { x: event.clientX, y: event.clientY }
    marqueeDragRef.current = {
      pointerId: event.pointerId,
      startClient: client,
      currentClient: client,
      startViewport: pointerInViewport(event),
      mode: selectionModeForPointer(event),
      initialIds: selectedIds
    }
    setMarqueeRect(null)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleViewportPointerMoveCapture(event: ReactPointerEvent<SVGSVGElement>): void {
    const panDrag = panDragRef.current
    if (panDrag?.pointerId === event.pointerId) {
      event.preventDefault()
      event.stopPropagation()
      const point = pointerInViewport(event)
      const nextPan = {
        x: panDrag.origin.x + point.x - panDrag.start.x,
        y: panDrag.origin.y + point.y - panDrag.start.y
      }
      viewportPanRef.current = nextPan
      setViewportPan(nextPan)
      return
    }

    const marquee = marqueeDragRef.current
    if (marquee?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    marquee.currentClient = { x: event.clientX, y: event.clientY }
    if (exceedsDragThreshold(marquee.startClient, marquee.currentClient)) {
      setMarqueeRect(normalizeViewportRect(marquee.startViewport, pointerInViewport(event)))
    } else {
      setMarqueeRect(null)
    }
  }

  function finishViewportGesture(event: ReactPointerEvent<SVGSVGElement>, cancelled = false): void {
    const panDrag = panDragRef.current
    if (panDrag?.pointerId === event.pointerId) {
      event.preventDefault()
      event.stopPropagation()
      panDragRef.current = null
      setIsPanning(false)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      return
    }

    const marquee = marqueeDragRef.current
    if (marquee?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    marquee.currentClient = { x: event.clientX, y: event.clientY }
    if (!cancelled) {
      const dragged = exceedsDragThreshold(marquee.startClient, marquee.currentClient)
      const hits = dragged
        ? selectableIdsInRect(normalizeViewportRect(marquee.startClient, marquee.currentClient))
        : [selectableIdAtPoint(marquee.currentClient)].filter((id): id is string => Boolean(id))
      onSelectMany(mergeSelectionIds(marquee.initialIds, hits, marquee.mode))
    }
    marqueeDragRef.current = null
    setMarqueeRect(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>): void {
    event.preventDefault()
    const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 240 : 1
    const factor = Math.exp(-event.deltaY * deltaScale * 0.0015)
    applyViewportZoom(viewportZoomRef.current * factor, pointerInViewport(event))
  }

  function resetViewport(): void {
    viewportPanRef.current = { x: 0, y: 0 }
    viewportZoomRef.current = 100
    setViewportPan({ x: 0, y: 0 })
    onZoomChange(100)
  }

  return (
    <section
      className={cn(
        'relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-[#091116]',
        flags.showGrid ? 'editor-grid' : 'editor-dots'
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-10 items-center justify-between bg-linear-to-b from-[#081015]/95 to-transparent px-3">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2">
          <Badge
            variant="outline"
            className="h-5 border-primary/25 bg-primary/8 px-1.5 text-[9px] uppercase tracking-[0.12em] text-primary"
          >
            {mode}
          </Badge>
          <span className="max-w-48 truncate text-[11px] font-medium text-foreground/85">
            {artwork?.name ?? projectName}
          </span>
          <span className="text-[10px] text-muted-foreground">
            / {documentWidth} × {documentHeight}
            {artwork ? ` / ${artwork.layers.length} layers` : ` / ${bones.length} bones`}
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-border/70 bg-card/80 p-0.5 shadow-lg backdrop-blur-md">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Focus selection"
                  onClick={() => onFeatureNotImplemented('Focus selection')}
                />
              }
            >
              <Focus />
            </TooltipTrigger>
            <TooltipContent>Focus selection</TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Zoom out"
            onClick={() => applyViewportZoom(zoom - 10)}
          >
            <Minus />
          </Button>
          <button
            type="button"
            onClick={resetViewport}
            className="w-10 text-center text-[10px] tabular-nums text-muted-foreground hover:text-foreground"
          >
            {Math.round(zoom)}%
          </button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Zoom in"
            onClick={() => applyViewportZoom(zoom + 10)}
          >
            <Plus />
          </Button>
          <Separator orientation="vertical" className="mx-0.5 h-4" />
          <Popover>
            <PopoverTrigger
              render={<Button variant="ghost" size="icon-xs" aria-label="Viewport overlays" />}
            >
              <Eye />
              <ChevronDown className="size-2.5" />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-64 gap-3 border-border bg-popover/95 p-3 backdrop-blur-xl"
            >
              <PopoverHeader>
                <PopoverTitle className="text-xs">Viewport overlays</PopoverTitle>
              </PopoverHeader>
              <ViewportToggle
                label="Grid"
                icon={Grid3X3}
                checked={flags.showGrid}
                onCheckedChange={() => onToggle('showGrid')}
              />
              <ViewportToggle
                label="Bones"
                icon={Bone}
                checked={flags.showBones}
                onCheckedChange={() => onToggle('showBones')}
              />
              <ViewportToggle
                label="Mesh"
                icon={ScanLine}
                checked={flags.showMesh}
                onCheckedChange={() => onToggle('showMesh')}
              />
              <ViewportToggle
                label="Weights"
                icon={Weight}
                checked={flags.showWeights}
                onCheckedChange={() => onToggle('showWeights')}
              />
              <ViewportToggle
                label="Clipping"
                icon={Crop}
                checked={flags.showClipping}
                onCheckedChange={() => onToggle('showClipping')}
              />
              <ViewportToggle
                label="Bounds"
                icon={Box}
                checked={flags.showBounds}
                onCheckedChange={() => onToggle('showBounds')}
              />
              <ViewportToggle
                label="Ghosting"
                icon={Sparkles}
                checked={flags.ghosting}
                onCheckedChange={() => onToggle('ghosting')}
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Maximize viewport"
            onClick={() => onFeatureNotImplemented('Maximize viewport')}
          >
            <Maximize2 />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="More viewport actions"
            onClick={() => onFeatureNotImplemented('Viewport actions')}
          >
            <MoreHorizontal />
          </Button>
        </div>
      </div>

      <svg
        ref={(element) => {
          svgRef.current = element
          onSvgElement?.(element)
        }}
        role="img"
        aria-label="Interactive rig viewport"
        viewBox="0 0 800 600"
        data-export-view-box={`0 0 ${documentWidth} ${documentHeight}`}
        className={cn(
          'h-full w-full touch-none',
          isPanning
            ? 'cursor-grabbing'
            : ['translate', 'pose'].includes(tool)
              ? 'cursor-move'
              : 'cursor-crosshair'
        )}
        onPointerDownCapture={handleViewportPointerDownCapture}
        onPointerMoveCapture={handleViewportPointerMoveCapture}
        onPointerUpCapture={(event) => finishViewportGesture(event)}
        onPointerCancelCapture={(event) => finishViewportGesture(event, true)}
        onLostPointerCapture={(event) => finishViewportGesture(event, true)}
        onWheel={handleWheel}
        onContextMenu={(event) => event.preventDefault()}
      >
        <g
          transform={`translate(${viewportPan.x} ${viewportPan.y}) translate(400 300) scale(${zoom / 100}) translate(-400 -300)`}
          data-export-transform="translate(400 300) scale(1) translate(-400 -300)"
        >
          <CanvasComposition
            artwork={artwork}
            canvas={canvas}
            bones={bones}
            selectedId={selectedId}
            selectedIds={selectedIdSet}
            tool={tool}
            zoom={zoom}
            flags={flags}
            geometrySelection={geometrySelection}
            weightBrush={weightBrush}
            deformations={deformations}
            keyedDeformations={keyedDeformations}
            onSelect={onSelect}
            onGeometrySelectionChange={onGeometrySelectionChange}
            onMeshVerticesChange={onMeshVerticesChange}
            onDeformationChange={onDeformationChange}
            onClippingVerticesChange={onClippingVerticesChange}
            onWeightPaint={onWeightPaint}
            onAddClipVertex={onAddClipVertex}
            onRemoveGeometryVertices={onRemoveGeometryVertices}
            onCreateBone={onCreateBone}
            onTransformChange={onTransformChange}
          />
        </g>
        {marqueeRect ? (
          <g data-editor-only="marquee" pointerEvents="none">
            <rect
              x={marqueeRect.x}
              y={marqueeRect.y}
              width={marqueeRect.width}
              height={marqueeRect.height}
              fill="#45d6bd"
              fillOpacity="0.08"
              stroke="#63e2cc"
              strokeWidth="1.5"
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ) : null}
      </svg>

      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-border/70 bg-card/86 px-2.5 py-1.5 shadow-lg backdrop-blur-md">
          <Crosshair className="size-3.5 text-primary" />
          <span className="text-[10px] text-muted-foreground">Canvas</span>
          <span className="text-[10px] tabular-nums">
            {documentWidth} × {documentHeight}
          </span>
          {artwork ? (
            <span className="text-[10px] text-muted-foreground">
              {artwork.layers.filter((layer) => layer.visible).length} visible
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">{bones.length} bones</span>
          )}
          {flags.snap ? <Magnet className="size-3 text-primary" /> : null}
          {selectedId ? (
            <span className="text-[9px] text-muted-foreground">
              {Math.round(transform.x)}, {Math.round(transform.y)}
            </span>
          ) : null}
        </div>
        {isPlaying ? (
          <div className="rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] text-primary">
            Previewing · {playProgress}%
          </div>
        ) : null}
        {selectedIds.length > 1 ? (
          <div className="rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] text-primary">
            {selectedIds.length} parts selected
          </div>
        ) : null}
      </div>
    </section>
  )
}
