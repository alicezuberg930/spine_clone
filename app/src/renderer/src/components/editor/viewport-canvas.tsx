import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Bone,
  Box,
  Check,
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
  Constraint,
  EditorMode,
  EditorTool,
  GeometrySelection,
  MeshDeformValue,
  Point,
  Transform,
  WeightBrush
} from '@/@types'
import { ArtworkGeometryOverlay } from '@/components/editor/artwork-geometry-overlay'
import { ArtworkLayerRenderer } from '@/components/editor/artwork-layer-renderer'
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
import {
  buildCubicBezierArcLengthTable,
  cubicBezierFromVertices,
  sampleCubicBezierAtDistance,
  sampleCubicBezierAtProgress,
  solveTwoBoneIk
} from '@/lib/constraints'
import { cn } from '@/lib/utils'

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
  activeSkin: string
  artwork: ArtworkDocument | null
  constraints: Constraint[]
  geometrySelection: GeometrySelection | null
  weightBrush: WeightBrush
  deformations: Record<string, MeshDeformValue['offsets']>
  keyedDeformations: Record<string, MeshDeformValue['offsets']>
  selectedId: string
  isPlaying: boolean
  flags: ViewportFlags
  onZoomChange: (zoom: number) => void
  onTransformChange: (patch: Partial<Transform>) => void
  onConstraintChange: (id: string, patch: Partial<Constraint>) => void
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
  onSvgElement?: (element: SVGSVGElement | null) => void
  onSelect: (id: string) => void
  onToggle: (key: keyof ViewportFlags) => void
  onFeatureNotImplemented: (feature: string) => void
}

const palettes = {
  'skin-rig': {
    jacket: '#3fb9a4',
    jacketDark: '#246f67',
    trim: '#b7f1d9',
    scarf: '#f1b95d',
    hair: '#273c42'
  },
  'skin-ember': {
    jacket: '#f58e67',
    jacketDark: '#964c4f',
    trim: '#ffd4a9',
    scarf: '#f6c85d',
    hair: '#4b2e38'
  },
  'skin-night': {
    jacket: '#7e9cf0',
    jacketDark: '#544f99',
    trim: '#d4ddff',
    scarf: '#d987e6',
    hair: '#2f345a'
  }
} as const

type IkVisualChainId = 'left-arm' | 'right-leg'

interface IkVisualDefinition {
  id: IkVisualChainId
  boneIds: [string, string]
  base: Point
  defaultJoint: Point
  defaultEnd: Point
  upperLength: number
  lowerLength: number
  idleRotation: (cycle: number) => number
}

interface IkVisualPose {
  definition: IkVisualDefinition
  constraint?: Constraint
  joint: Point
  end: Point
  solvedJoint: Point
  solvedEnd: Point
  target: Point
  mix: number
}

interface HeadVisualTransform {
  x: number
  y: number
  rotation: number
  scale: number
}

const IK_VISUAL_DEFINITIONS: IkVisualDefinition[] = [
  {
    id: 'left-arm',
    boneIds: ['bone-arm-l', 'bone-forearm-l'],
    base: { x: 357, y: 319 },
    defaultJoint: { x: 320, y: 373 },
    defaultEnd: { x: 298, y: 426 },
    upperLength: Math.hypot(37, 54),
    lowerLength: Math.hypot(22, 53),
    idleRotation: (cycle) => Math.sin(cycle) * 11
  },
  {
    id: 'right-leg',
    boneIds: ['bone-thigh-r', 'bone-shin-r'],
    base: { x: 421, y: 416 },
    defaultJoint: { x: 429, y: 485 },
    defaultEnd: { x: 444, y: 509 },
    upperLength: 72,
    lowerLength: 55,
    idleRotation: (cycle) => -Math.sin(cycle) * 9
  }
]

const SCARF_UNCONSTRAINED_PATH: [Point, Point, Point, Point] = [
  { x: 437, y: 269 },
  { x: 491, y: 282 },
  { x: 515, y: 310 },
  { x: 544, y: 300 }
]

const SCARF_DEFAULT_CONSTRAINT_PATH: [Point, Point, Point, Point] = [
  { x: 438, y: 270 },
  { x: 482, y: 260 },
  { x: 520, y: 325 },
  { x: 565, y: 288 }
]

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

function lerpPoint(from: Point, to: Point, mix: number): Point {
  return {
    x: from.x + (to.x - from.x) * mix,
    y: from.y + (to.y - from.y) * mix
  }
}

function rotatePointAround(point: Point, origin: Point, angleDegrees: number): Point {
  const radians = (angleDegrees * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const x = point.x - origin.x
  const y = point.y - origin.y
  return {
    x: origin.x + x * cosine - y * sine,
    y: origin.y + x * sine + y * cosine
  }
}

function constraintMatchesBones(constraint: Constraint, definition: IkVisualDefinition): boolean {
  return (
    constraint.boneIds.length >= 2 &&
    constraint.boneIds[0] === definition.boneIds[0] &&
    constraint.boneIds[1] === definition.boneIds[1]
  )
}

function resolveIkVisualPoses(
  constraints: Constraint[],
  frame: number
): Record<IkVisualChainId, IkVisualPose> {
  const cycle = (frame / 60) * Math.PI * 2
  return Object.fromEntries(
    IK_VISUAL_DEFINITIONS.map((definition) => {
      const constraint = constraints.find(
        (candidate) => candidate.type === 'ik' && constraintMatchesBones(candidate, definition)
      )
      const target = constraint?.targetPosition ?? definition.defaultEnd
      const solution = solveTwoBoneIk({
        root: definition.base,
        target,
        upperLength: definition.upperLength,
        lowerLength: definition.lowerLength,
        // The editor's screen-space clockwise convention is the inverse of
        // the math helper's Cartesian bend sign.
        bendDirection: (constraint?.bendDirection ?? 1) === 1 ? -1 : 1
      })
      const idleRotation = definition.idleRotation(cycle)
      const idleJoint = rotatePointAround(definition.defaultJoint, definition.base, idleRotation)
      const idleEnd = rotatePointAround(definition.defaultEnd, definition.base, idleRotation)
      const mix = constraint?.enabled === false ? 0 : clamp01(constraint?.mix ?? 0)

      return [
        definition.id,
        {
          definition,
          constraint,
          joint: lerpPoint(idleJoint, solution.joint, mix),
          end: lerpPoint(idleEnd, solution.end, mix),
          solvedJoint: solution.joint,
          solvedEnd: solution.end,
          target,
          mix
        }
      ]
    })
  ) as Record<IkVisualChainId, IkVisualPose>
}

function scarfPathForFrame(
  frame: number,
  physicsEnabled: boolean,
  constraint?: Constraint
): [Point, Point, Point, Point] {
  const cycle = (frame / 60) * Math.PI * 2
  const wave = physicsEnabled ? Math.sin(cycle * 1.35) * 18 : 0
  const unconstrained: [Point, Point, Point, Point] = [
    SCARF_UNCONSTRAINED_PATH[0],
    {
      x: SCARF_UNCONSTRAINED_PATH[1].x + wave * 0.35,
      y: SCARF_UNCONSTRAINED_PATH[1].y - wave * 0.25
    },
    {
      x: SCARF_UNCONSTRAINED_PATH[2].x + wave,
      y: SCARF_UNCONSTRAINED_PATH[2].y + wave * 0.2
    },
    {
      x: SCARF_UNCONSTRAINED_PATH[3].x + wave * 0.7,
      y: SCARF_UNCONSTRAINED_PATH[3].y - wave * 0.15
    }
  ]
  const target = constraint?.pathPoints ?? SCARF_DEFAULT_CONSTRAINT_PATH
  const mix = constraint?.enabled === false ? 0 : clamp01(constraint?.mix ?? 0)
  return unconstrained.map((point, index) => lerpPoint(point, target[index], mix)) as [
    Point,
    Point,
    Point,
    Point
  ]
}

function ArtworkComposition({
  artwork,
  selectedId,
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
  onRemoveGeometryVertices
}: {
  artwork: ArtworkDocument
  selectedId: string
  tool: EditorTool
  zoom: number
  flags: Pick<ViewportFlags, 'showMesh' | 'showWeights' | 'showClipping'>
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
}): React.JSX.Element {
  const fit = Math.max(0.01, Math.min(680 / artwork.width, 500 / artwork.height))
  const x = (800 - artwork.width * fit) / 2
  const y = (600 - artwork.height * fit) / 2
  const selectedLayer = artwork.layers.find((layer) => layer.id === selectedId)

  return (
    <g>
      <rect
        data-editor-only="artwork-canvas-frame"
        x={x}
        y={y}
        width={artwork.width * fit}
        height={artwork.height * fit}
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
        {[...artwork.layers]
          .reverse()
          .filter((layer) => layer.visible)
          .map((layer) => (
            <ArtworkLayerRenderer
              key={layer.id}
              layer={layer}
              deformation={deformations[layer.id]}
              className="cursor-pointer"
              onPointerDown={(event) => {
                event.stopPropagation()
                onSelect(layer.id)
              }}
            />
          ))}
        {selectedLayer ? (
          <g>
            <rect
              x={selectedLayer.x}
              y={selectedLayer.y}
              width={selectedLayer.width}
              height={selectedLayer.height}
              fill="none"
              stroke="#45d6bd"
              strokeWidth={Math.max(1, 1.5 / fit)}
              strokeDasharray={`${Math.max(3, 5 / fit)} ${Math.max(2, 3 / fit)}`}
              pointerEvents="none"
              data-editor-only="selection"
            />
            {['mesh', 'deform', 'weights', 'clipping'].includes(tool) ? (
              <g
                transform={`translate(${selectedLayer.x} ${selectedLayer.y})`}
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
                  onWeightPaint={(layerId, point) => onWeightPaint(layerId, point)}
                  onAddClipVertex={onAddClipVertex}
                  onRemoveVertices={onRemoveGeometryVertices}
                />
              </g>
            ) : null}
          </g>
        ) : null}
      </g>
    </g>
  )
}

function CharacterArt({
  palette,
  frame,
  opacity = 1,
  ghostShift = 0,
  selectedId,
  headTransform = { x: 0, y: 0, rotation: 0, scale: 1 },
  scarfPath = SCARF_UNCONSTRAINED_PATH,
  pathConstraint,
  ikPoses
}: {
  palette: (typeof palettes)[keyof typeof palettes]
  frame: number
  opacity?: number
  ghostShift?: number
  selectedId: string
  headTransform?: HeadVisualTransform
  scarfPath?: [Point, Point, Point, Point]
  pathConstraint?: Constraint
  ikPoses: Record<IkVisualChainId, IkVisualPose>
}): React.JSX.Element {
  const cycle = (frame / 60) * Math.PI * 2
  const bob = Math.sin(cycle * 2) * 3
  const armSwing = Math.sin(cycle) * 11
  const legSwing = Math.sin(cycle) * 9
  const leftArm = ikPoses['left-arm']
  const rightLeg = ikPoses['right-leg']
  const scarfCurve = cubicBezierFromVertices(scarfPath)
  const scarfTable = buildCubicBezierArcLengthTable(scarfCurve)
  const pathEnabled = pathConstraint?.enabled !== false && (pathConstraint?.mix ?? 0) > 0
  const pathPosition = clamp01(pathConstraint?.pathPosition ?? 0.55)
  const pathSpacing = Math.max(4, Math.min(72, pathConstraint?.pathSpacing ?? 18))
  const stitchCenter = pathPosition * scarfTable.totalLength
  const stitchSamples = pathEnabled
    ? [-pathSpacing, 0, pathSpacing].map((offset) =>
        sampleCubicBezierAtDistance(scarfCurve, stitchCenter + offset, scarfTable)
      )
    : []
  const scarfPathData = `M ${scarfPath[0].x} ${scarfPath[0].y} C ${scarfPath[1].x} ${scarfPath[1].y}, ${scarfPath[2].x} ${scarfPath[2].y}, ${scarfPath[3].x} ${scarfPath[3].y}`
  const headTransformValue = `translate(${headTransform.x} ${headTransform.y}) rotate(${headTransform.rotation} 400 285) translate(400 285) scale(${headTransform.scale}) translate(-400 -285)`

  return (
    <g opacity={opacity} transform={`translate(${ghostShift} ${bob})`}>
      <ellipse cx="400" cy="520" rx="82" ry="13" fill="#000" opacity="0.28" />

      <path
        d={scarfPathData}
        fill="none"
        stroke={palette.scarf}
        strokeLinecap="round"
        strokeWidth="18"
      />
      <path
        d={scarfPathData}
        fill="none"
        stroke="#fff"
        strokeDasharray={pathEnabled ? `${Math.max(2, pathSpacing * 0.22)} ${pathSpacing}` : '4 13'}
        strokeDashoffset={pathEnabled ? -pathPosition * pathSpacing * 4 : 0}
        strokeLinecap="round"
        strokeWidth="2"
        opacity="0.35"
      />
      {stitchSamples.map((sample, index) => (
        <rect
          key={index}
          x={sample.point.x - 1.5}
          y={sample.point.y - 7}
          width="3"
          height="14"
          rx="1.5"
          fill="#fff4c7"
          opacity={0.35 + clamp01(pathConstraint?.mix ?? 0) * 0.45}
          transform={`rotate(${pathConstraint?.pathRotate === false ? 0 : sample.angleDegrees} ${sample.point.x} ${sample.point.y})`}
        />
      ))}

      <g transform={`rotate(${legSwing} 378 414)`}>
        <path d="M378 407 L369 485" stroke="#202d33" strokeLinecap="round" strokeWidth="29" />
        <path d="M369 481 L350 509" stroke="#172027" strokeLinecap="round" strokeWidth="23" />
        <path d="M350 509 L326 512" stroke="#0e161b" strokeLinecap="round" strokeWidth="17" />
      </g>
      <g>
        <path
          d={`M421 407 L${rightLeg.joint.x} ${rightLeg.joint.y}`}
          stroke="#25343b"
          strokeLinecap="round"
          strokeWidth="29"
        />
        <path
          d={`M${rightLeg.joint.x} ${rightLeg.joint.y} L${rightLeg.end.x} ${rightLeg.end.y}`}
          stroke="#172027"
          strokeLinecap="round"
          strokeWidth="23"
        />
        <path
          d={`M${rightLeg.end.x} ${rightLeg.end.y} L${rightLeg.end.x + 25} ${rightLeg.end.y + 3}`}
          stroke="#0e161b"
          strokeLinecap="round"
          strokeWidth="17"
        />
      </g>

      <path
        data-selection-stroke="true"
        d="M346 307 Q400 276 455 309 L446 414 Q399 440 353 414 Z"
        fill={palette.jacketDark}
        stroke={selectedId === 'bone-torso' ? '#45d6bd' : '#071013'}
        strokeWidth={selectedId === 'bone-torso' ? 3 : 5}
      />
      <path d="M358 303 Q400 287 443 304 L432 401 Q401 418 368 402 Z" fill={palette.jacket} />
      <path d="M400 298 L400 408" stroke={palette.trim} strokeWidth="4" opacity="0.75" />
      <path
        d="M366 353 Q400 366 434 353"
        fill="none"
        stroke="#10262a"
        strokeWidth="4"
        opacity="0.5"
      />
      <circle cx="421" cy="374" r="5" fill={palette.trim} opacity="0.8" />

      <g>
        <path
          d={`M357 319 L${leftArm.joint.x} ${leftArm.joint.y}`}
          stroke={palette.jacketDark}
          strokeLinecap="round"
          strokeWidth="25"
        />
        <path
          d={`M${leftArm.joint.x} ${leftArm.joint.y} L${leftArm.end.x} ${leftArm.end.y}`}
          stroke="#d99c76"
          strokeLinecap="round"
          strokeWidth="18"
        />
        <circle cx={leftArm.end.x} cy={leftArm.end.y} r="12" fill="#e7ad87" />
      </g>
      <g transform={`rotate(${-armSwing} 443 319)`}>
        <path
          d="M443 319 L478 370"
          stroke={palette.jacketDark}
          strokeLinecap="round"
          strokeWidth="25"
        />
        <path d="M478 370 L500 411" stroke="#d99c76" strokeLinecap="round" strokeWidth="18" />
        <circle cx="504" cy="418" r="12" fill="#e7ad87" />
      </g>

      <g transform={headTransformValue}>
        <rect x="386" y="273" width="28" height="35" rx="12" fill="#d99c76" />
        <circle
          data-selection-stroke="true"
          cx="400"
          cy="242"
          r="55"
          fill="#e9b08a"
          stroke={selectedId === 'bone-head' ? '#45d6bd' : '#071013'}
          strokeWidth={selectedId === 'bone-head' ? 3 : 5}
        />
        <path
          d="M346 240 Q344 180 401 178 Q463 180 458 246 L445 225 Q431 218 420 192 Q391 222 350 225 Z"
          fill={palette.hair}
        />
        <path
          d="M359 232 Q363 188 403 184"
          fill="none"
          stroke="#476069"
          strokeWidth="8"
          opacity="0.35"
        />
        <path
          d="M373 246 Q381 241 389 246"
          fill="none"
          stroke="#223039"
          strokeLinecap="round"
          strokeWidth="3"
        />
        <path
          d="M412 246 Q420 241 428 246"
          fill="none"
          stroke="#223039"
          strokeLinecap="round"
          strokeWidth="3"
        />
        <circle cx="382" cy="247" r="2.5" fill="#15262d" />
        <circle cx="420" cy="247" r="2.5" fill="#15262d" />
        <path
          d="M390 269 Q401 276 413 268"
          fill="none"
          stroke="#8a4e4e"
          strokeLinecap="round"
          strokeWidth="3"
        />
      </g>

      <path
        d="M367 297 Q399 282 433 297"
        fill="none"
        stroke={palette.scarf}
        strokeLinecap="round"
        strokeWidth="15"
      />
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
  activeSkin,
  artwork,
  constraints,
  geometrySelection,
  weightBrush,
  deformations,
  keyedDeformations,
  selectedId,
  isPlaying,
  flags,
  onZoomChange,
  onTransformChange,
  onConstraintChange,
  onGeometrySelectionChange,
  onMeshVerticesChange,
  onDeformationChange,
  onClippingVerticesChange,
  onWeightPaint,
  onAddClipVertex,
  onRemoveGeometryVertices,
  onSvgElement,
  onSelect,
  onToggle,
  onFeatureNotImplemented
}: ViewportCanvasProps): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null)
  const characterRef = useRef<SVGGElement>(null)
  const dragRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null)
  const poseDragRef = useRef<string | null>(null)
  const pathPointDragRef = useRef<{ constraintId: string; pointIndex: number } | null>(null)
  const palette = palettes[activeSkin as keyof typeof palettes] ?? palettes['skin-ember']
  const selectedIkConstraint = constraints.find(
    (constraint) => constraint.id === selectedId && constraint.type === 'ik'
  )
  const ikConstraint =
    selectedIkConstraint ??
    constraints.find((constraint) => constraint.id === 'constraint-foot-ik') ??
    constraints.find((constraint) => constraint.type === 'ik')
  const ikPoses = resolveIkVisualPoses(constraints, frame)
  const guideIkPose = IK_VISUAL_DEFINITIONS.map((definition) => ikPoses[definition.id]).find(
    (pose) => pose.constraint?.id === ikConstraint?.id
  )
  const transformConstraint = constraints.find((constraint) => constraint.type === 'transform')
  const pathConstraint = constraints.find((constraint) => constraint.type === 'path')
  const transformMix =
    transformConstraint?.enabled === false ? 0 : clamp01(transformConstraint?.mix ?? 0)
  const affectsHead = transformConstraint?.boneIds.includes('bone-head') ?? false
  const targetAnchor =
    transformConstraint?.targetId === 'bone-chest' ? { x: 400, y: 315 } : { x: 400, y: 285 }
  const headAnchor = { x: 400, y: 285 }
  const headTransform: HeadVisualTransform = affectsHead
    ? {
        x:
          (targetAnchor.x - headAnchor.x) *
          0.35 *
          clamp01(transformConstraint?.translateMix ?? 0) *
          transformMix,
        y:
          (targetAnchor.y - headAnchor.y) *
          0.35 *
          clamp01(transformConstraint?.translateMix ?? 0) *
          transformMix,
        rotation:
          (transformConstraint?.offsetRotation ?? 0) *
          clamp01(transformConstraint?.rotateMix ?? transformMix) *
          transformMix,
        scale: 1 + 0.18 * clamp01(transformConstraint?.scaleMix ?? 0) * transformMix
      }
    : { x: 0, y: 0, rotation: 0, scale: 1 }
  const scarfPath = scarfPathForFrame(frame, flags.physicsEnabled, pathConstraint)
  const pathPosition = pathConstraint?.pathPosition ?? 0.55
  const pathCurve = cubicBezierFromVertices(scarfPath)
  const pathTable = buildCubicBezierArcLengthTable(pathCurve)
  const pathMarker = sampleCubicBezierAtProgress(pathCurve, pathPosition, pathTable).point

  function pointerInCharacter(
    event: Pick<ReactPointerEvent<SVGElement>, 'clientX' | 'clientY'>
  ): Point {
    const matrix = characterRef.current?.getScreenCTM()
    if (!matrix) return { x: event.clientX, y: event.clientY }
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>): void {
    if (artwork) return
    if (!['select', 'translate', 'pose'].includes(tool)) return
    if (tool === 'pose' && ikConstraint) {
      poseDragRef.current = ikConstraint.id
      event.currentTarget.setPointerCapture(event.pointerId)
      onSelect(ikConstraint.id)
      onConstraintChange(ikConstraint.id, { targetPosition: pointerInCharacter(event) })
      return
    }
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      originX: transform.x,
      originY: transform.y
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    onSelect(tool === 'pose' ? 'constraint-foot-ik' : 'bone-torso')
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>): void {
    if (pathPointDragRef.current) {
      const draggedConstraint = constraints.find(
        (constraint) => constraint.id === pathPointDragRef.current?.constraintId
      )
      if (draggedConstraint?.type === 'path') {
        const point = pointerInCharacter(event)
        const pointIndex = pathPointDragRef.current.pointIndex
        const targetPoints = [
          ...(draggedConstraint.pathPoints ?? SCARF_DEFAULT_CONSTRAINT_PATH)
        ] as [Point, Point, Point, Point]
        const mix = draggedConstraint.enabled === false ? 0 : clamp01(draggedConstraint.mix ?? 0)
        const basePoint = scarfPathForFrame(frame, flags.physicsEnabled)[pointIndex]
        targetPoints[pointIndex] =
          mix > 0.001
            ? {
                x: (point.x - basePoint.x * (1 - mix)) / mix,
                y: (point.y - basePoint.y * (1 - mix)) / mix
              }
            : point
        onConstraintChange(draggedConstraint.id, { pathPoints: targetPoints })
      }
      return
    }
    if (poseDragRef.current) {
      onConstraintChange(poseDragRef.current, { targetPosition: pointerInCharacter(event) })
      return
    }
    const drag = dragRef.current
    if (!drag) return
    const scale = Math.max(zoom / 100, 0.1)
    onTransformChange({
      x: Math.round(drag.originX + (event.clientX - drag.x) / scale),
      y: Math.round(drag.originY + (event.clientY - drag.y) / scale)
    })
  }

  function stopDragging(event: ReactPointerEvent<SVGSVGElement>): void {
    dragRef.current = null
    poseDragRef.current = null
    pathPointDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const characterTransform =
    selectedId === 'bone-root'
      ? `translate(${transform.x} ${transform.y}) rotate(${transform.rotation} 400 350) scale(${transform.scaleX / 100} ${transform.scaleY / 100})`
      : 'translate(0 0) rotate(0 400 350) scale(1 1)'
  const playProgress = Math.round((frame / duration) * 100)

  return (
    <section
      className={cn(
        'relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-[#091116]',
        flags.showGrid ? 'editor-grid' : 'editor-dots'
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-10 items-center justify-between bg-linear-to-b from-[#081015]/95 to-transparent px-3">
        <div className="pointer-events-auto flex items-center gap-2">
          <Badge
            variant="outline"
            className="h-5 border-primary/25 bg-primary/8 px-1.5 text-[9px] uppercase tracking-[0.12em] text-primary"
          >
            {mode}
          </Badge>
          <span className="text-[11px] font-medium text-foreground/85">
            {artwork?.name ?? 'Meadow runner'}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {artwork
              ? `/ ${artwork.width} × ${artwork.height} / ${artwork.layers.length} layers`
              : `/ ${activeSkin} / ${selectedId}`}
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
            onClick={() => onZoomChange(Math.max(25, zoom - 10))}
          >
            <Minus />
          </Button>
          <button
            type="button"
            onClick={() => onZoomChange(100)}
            className="w-10 text-center text-[10px] tabular-nums text-muted-foreground hover:text-foreground"
          >
            {zoom}%
          </button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Zoom in"
            onClick={() => onZoomChange(Math.min(250, zoom + 10))}
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
        data-export-view-box={artwork ? `0 0 ${artwork.width} ${artwork.height}` : '0 0 800 600'}
        className={cn(
          'h-full w-full touch-none transition-opacity',
          ['select', 'translate', 'pose'].includes(tool) ? 'cursor-move' : 'cursor-crosshair'
        )}
        style={{ opacity: artwork ? 1 : transform.opacity / 100 }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        <defs>
          <filter id="character-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#000" floodOpacity="0.34" />
          </filter>
          <radialGradient id="weight-hot" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ff785f" stopOpacity="0.75" />
            <stop offset="0.45" stopColor="#f4b85a" stopOpacity="0.42" />
            <stop offset="1" stopColor="#45d6bd" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g
          transform={`translate(400 300) scale(${zoom / 100}) translate(-400 -300)`}
          data-export-transform="translate(400 300) scale(1) translate(-400 -300)"
        >
          {artwork ? (
            <ArtworkComposition
              artwork={artwork}
              selectedId={selectedId}
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
            />
          ) : (
            <g
              ref={characterRef}
              transform={characterTransform}
              filter={flags.ghosting ? undefined : 'url(#character-shadow)'}
            >
              {flags.ghosting ? (
                <>
                  <g style={{ mixBlendMode: 'screen' }} data-editor-only="ghosting">
                    <CharacterArt
                      palette={palette}
                      frame={Math.max(0, frame - 6)}
                      opacity={0.12}
                      ghostShift={-24}
                      selectedId=""
                      ikPoses={resolveIkVisualPoses(constraints, Math.max(0, frame - 6))}
                    />
                    <CharacterArt
                      palette={palette}
                      frame={Math.min(duration, frame + 6)}
                      opacity={0.1}
                      ghostShift={24}
                      selectedId=""
                      ikPoses={resolveIkVisualPoses(constraints, Math.min(duration, frame + 6))}
                    />
                  </g>
                </>
              ) : null}
              <g filter="url(#character-shadow)">
                <CharacterArt
                  palette={palette}
                  frame={frame}
                  selectedId={selectedId}
                  headTransform={headTransform}
                  scarfPath={scarfPath}
                  pathConstraint={pathConstraint}
                  ikPoses={ikPoses}
                />
              </g>

              {flags.showWeights ? (
                <g opacity="0.8" style={{ mixBlendMode: 'screen' }} data-editor-only="weights">
                  <circle cx="373" cy="323" r="74" fill="url(#weight-hot)" />
                  <circle
                    cx="430"
                    cy="360"
                    r="62"
                    fill="url(#weight-hot)"
                    transform="rotate(180 430 360)"
                  />
                  <text x="340" y="295" fill="#f7d67c" fontSize="10">
                    73%
                  </text>
                  <text x="445" y="372" fill="#74e4d1" fontSize="10">
                    27%
                  </text>
                </g>
              ) : null}

              {flags.showMesh ? (
                <g
                  fill="none"
                  stroke="#70e1cf"
                  strokeWidth="1"
                  opacity="0.72"
                  data-editor-only="mesh"
                >
                  <path d="M346 307 L400 284 L455 309 L446 414 L400 430 L353 414 Z" />
                  <path d="M346 307 L400 360 L455 309 M353 414 L400 360 L446 414 M400 284 L400 430" />
                  <path d="M348 218 L375 188 L423 187 L454 220 L455 263 L426 294 L376 294 L346 263 Z" />
                  {[
                    ['346', '307'],
                    ['400', '284'],
                    ['455', '309'],
                    ['446', '414'],
                    ['400', '430'],
                    ['353', '414'],
                    ['400', '360'],
                    ['348', '218'],
                    ['375', '188'],
                    ['423', '187'],
                    ['454', '220'],
                    ['455', '263'],
                    ['426', '294'],
                    ['376', '294'],
                    ['346', '263']
                  ].map(([x, y], index) => (
                    <circle key={index} cx={x} cy={y} r="3.5" fill="#0a1419" stroke="#70e1cf" />
                  ))}
                </g>
              ) : null}

              {flags.showClipping ? (
                <g data-editor-only="clipping">
                  <path
                    d="M341 297 Q400 269 459 297 L452 425 Q400 447 347 425 Z"
                    fill="#45d6bd"
                    opacity="0.08"
                    stroke="#f4b85a"
                    strokeDasharray="5 4"
                    strokeWidth="2"
                  />
                  <text x="462" y="309" fill="#f4b85a" fontSize="10">
                    clip · inverse
                  </text>
                </g>
              ) : null}

              {flags.showBounds ? (
                <g
                  fill="none"
                  stroke="#ff786f"
                  strokeDasharray="5 4"
                  strokeWidth="1.5"
                  data-editor-only="bounds"
                >
                  <rect x="337" y="177" width="129" height="348" rx="14" />
                  <path d="M353 417 L447 417 L466 506 L331 506 Z" />
                  <text x="340" y="169" fill="#ff9a91" fontSize="10">
                    body_hitbox
                  </text>
                </g>
              ) : null}

              {flags.showBones ? (
                <g
                  fill="none"
                  stroke="#f7c860"
                  strokeLinecap="round"
                  strokeWidth="4"
                  data-editor-only="bones"
                >
                  <path d="M400 416 L400 355 L400 298 L400 244" />
                  <path
                    d={`M400 315 L${ikPoses['left-arm'].definition.base.x} ${ikPoses['left-arm'].definition.base.y} L${ikPoses['left-arm'].joint.x} ${ikPoses['left-arm'].joint.y} L${ikPoses['left-arm'].end.x} ${ikPoses['left-arm'].end.y}`}
                  />
                  <path d="M400 315 L443 320 L478 370 L504 418" />
                  <path d="M400 416 L378 416 L369 485 L350 509" />
                  <path
                    d={`M400 416 L${ikPoses['right-leg'].definition.base.x} ${ikPoses['right-leg'].definition.base.y} L${ikPoses['right-leg'].joint.x} ${ikPoses['right-leg'].joint.y} L${ikPoses['right-leg'].end.x} ${ikPoses['right-leg'].end.y}`}
                  />
                  {[
                    [400, 416],
                    [400, 355],
                    [400, 298],
                    [400, 244],
                    [ikPoses['left-arm'].definition.base.x, ikPoses['left-arm'].definition.base.y],
                    [ikPoses['left-arm'].joint.x, ikPoses['left-arm'].joint.y],
                    [ikPoses['left-arm'].end.x, ikPoses['left-arm'].end.y],
                    [443, 320],
                    [478, 370],
                    [504, 418],
                    [378, 416],
                    [369, 485],
                    [350, 509],
                    [
                      ikPoses['right-leg'].definition.base.x,
                      ikPoses['right-leg'].definition.base.y
                    ],
                    [ikPoses['right-leg'].joint.x, ikPoses['right-leg'].joint.y],
                    [ikPoses['right-leg'].end.x, ikPoses['right-leg'].end.y]
                  ].map(([x, y], index) => (
                    <circle
                      key={index}
                      cx={x}
                      cy={y}
                      r={index === 0 ? 6 : 4.5}
                      fill="#11191e"
                      stroke="#f7c860"
                      strokeWidth="2"
                    />
                  ))}
                </g>
              ) : null}

              {(tool === 'pose' || selectedIkConstraint) && guideIkPose ? (
                <g data-editor-only="constraint-ik">
                  <path
                    d={`M${guideIkPose.definition.base.x} ${guideIkPose.definition.base.y} L${guideIkPose.joint.x} ${guideIkPose.joint.y} L${guideIkPose.end.x} ${guideIkPose.end.y}`}
                    fill="none"
                    stroke="#86a9ff"
                    strokeDasharray="4 4"
                    strokeWidth="1.5"
                  />
                  {Math.hypot(
                    guideIkPose.target.x - guideIkPose.end.x,
                    guideIkPose.target.y - guideIkPose.end.y
                  ) > 1 ? (
                    <path
                      d={`M${guideIkPose.end.x} ${guideIkPose.end.y} L${guideIkPose.target.x} ${guideIkPose.target.y}`}
                      fill="none"
                      stroke="#86a9ff"
                      strokeDasharray="2 5"
                      strokeWidth="1"
                      opacity="0.65"
                    />
                  ) : null}
                  <circle
                    cx={guideIkPose.target.x}
                    cy={guideIkPose.target.y}
                    r="13"
                    fill="#17213a"
                    stroke="#86a9ff"
                    strokeWidth="2"
                  />
                  <circle
                    cx={guideIkPose.joint.x}
                    cy={guideIkPose.joint.y}
                    r="5"
                    fill="#11191e"
                    stroke="#86a9ff"
                    strokeWidth="2"
                  />
                  <path
                    d={`M${guideIkPose.target.x - 7} ${guideIkPose.target.y} H${guideIkPose.target.x + 7} M${guideIkPose.target.x} ${guideIkPose.target.y - 7} V${guideIkPose.target.y + 7}`}
                    stroke="#b9c6ff"
                    strokeWidth="1.5"
                  />
                  <text
                    x={guideIkPose.target.x + 16}
                    y={guideIkPose.target.y + 3}
                    fill="#aebeff"
                    fontSize="10"
                  >
                    {guideIkPose.constraint?.name ?? 'IK target'}
                  </text>
                </g>
              ) : null}

              {pathConstraint && selectedId === pathConstraint.id && (
                <g data-editor-only="constraint-path">
                  <path
                    d={`M${scarfPath[0].x} ${scarfPath[0].y} C ${scarfPath[1].x} ${scarfPath[1].y} ${scarfPath[2].x} ${scarfPath[2].y} ${scarfPath[3].x} ${scarfPath[3].y}`}
                    fill="none"
                    stroke="#d987e6"
                    strokeWidth="1.5"
                  />
                  <path
                    d={`M${scarfPath[0].x} ${scarfPath[0].y} L${scarfPath[1].x} ${scarfPath[1].y} M${scarfPath[2].x} ${scarfPath[2].y} L${scarfPath[3].x} ${scarfPath[3].y}`}
                    fill="none"
                    stroke="#d987e6"
                    strokeDasharray="3 3"
                    opacity="0.6"
                  />
                  {scarfPath.map((point, index) => (
                    <circle
                      key={index}
                      cx={point.x}
                      cy={point.y}
                      r={index === 0 || index === 3 ? 4 : 3}
                      fill={index === 0 || index === 3 ? '#d987e6' : '#0a1419'}
                      stroke="#d987e6"
                      className="cursor-move"
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        pathPointDragRef.current = {
                          constraintId: pathConstraint.id,
                          pointIndex: index
                        }
                        svgRef.current?.setPointerCapture(event.pointerId)
                      }}
                    />
                  ))}
                  <circle
                    cx={pathMarker.x}
                    cy={pathMarker.y}
                    r="7"
                    fill="#25192b"
                    stroke="#f1b5f8"
                    strokeWidth="2"
                  />
                </g>
              )}
            </g>
          )}
        </g>
      </svg>

      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-border/70 bg-card/86 px-2.5 py-1.5 shadow-lg backdrop-blur-md">
          <Crosshair className="size-3.5 text-primary" />
          {artwork ? (
            <>
              <span className="text-[10px] text-muted-foreground">Canvas</span>
              <span className="text-[10px] tabular-nums">
                {artwork.width} × {artwork.height}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {artwork.layers.filter((layer) => layer.visible).length} visible
              </span>
            </>
          ) : (
            <>
              <span className="text-[10px] text-muted-foreground">X</span>
              <span className="w-8 text-right text-[10px] tabular-nums">{transform.x}</span>
              <span className="text-[10px] text-muted-foreground">Y</span>
              <span className="w-8 text-right text-[10px] tabular-nums">{transform.y}</span>
              {flags.snap ? <Magnet className="size-3 text-primary" /> : null}
            </>
          )}
        </div>
        {isPlaying ? (
          <div className="rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] text-primary">
            Previewing · {playProgress}%
          </div>
        ) : null}
      </div>

      <div className="pointer-events-none absolute right-4 top-14 flex flex-col gap-1.5">
        {!artwork && flags.physicsEnabled ? (
          <Badge
            variant="outline"
            className="border-primary/20 bg-card/75 text-[9px] text-primary backdrop-blur"
          >
            <Check className="size-3" /> Physics live
          </Badge>
        ) : null}
        {!artwork && flags.showWeights ? (
          <Badge
            variant="outline"
            className="border-amber-400/20 bg-card/75 text-[9px] text-amber-300 backdrop-blur"
          >
            Weight heatmap
          </Badge>
        ) : null}
      </div>
    </section>
  )
}
