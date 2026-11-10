import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Bone,
  Box,
  Check,
  ChevronDown,
  Crosshair,
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

import type { ArtworkDocument, EditorMode, EditorTool, Transform } from '@/@types'
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
  selectedId: string
  isPlaying: boolean
  flags: ViewportFlags
  onZoomChange: (zoom: number) => void
  onTransformChange: (patch: Partial<Transform>) => void
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

function ArtworkComposition({
  artwork,
  selectedId,
  onSelect
}: {
  artwork: ArtworkDocument
  selectedId: string
  onSelect: (id: string) => void
}): React.JSX.Element {
  const fit = Math.max(0.01, Math.min(680 / artwork.width, 500 / artwork.height))
  const x = (800 - artwork.width * fit) / 2
  const y = (600 - artwork.height * fit) / 2
  const selectedLayer = artwork.layers.find((layer) => layer.id === selectedId)

  return (
    <g>
      <rect
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
      <g transform={`translate(${x} ${y}) scale(${fit})`}>
        {[...artwork.layers]
          .reverse()
          .filter((layer) => layer.visible)
          .map((layer) => (
            <image
              key={layer.id}
              href={layer.dataUrl}
              x={layer.x}
              y={layer.y}
              width={layer.width}
              height={layer.height}
              opacity={layer.opacity}
              preserveAspectRatio="none"
              className="cursor-pointer"
              style={{ mixBlendMode: layer.blendMode as CSSProperties['mixBlendMode'] }}
              onPointerDown={(event) => {
                event.stopPropagation()
                onSelect(layer.id)
              }}
            />
          ))}
        {selectedLayer ? (
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
          />
        ) : null}
      </g>
    </g>
  )
}

function CharacterArt({
  palette,
  frame,
  physicsEnabled,
  opacity = 1,
  ghostShift = 0,
  selectedId
}: {
  palette: (typeof palettes)[keyof typeof palettes]
  frame: number
  physicsEnabled: boolean
  opacity?: number
  ghostShift?: number
  selectedId: string
}): React.JSX.Element {
  const cycle = (frame / 60) * Math.PI * 2
  const bob = Math.sin(cycle * 2) * 3
  const armSwing = Math.sin(cycle) * 11
  const legSwing = Math.sin(cycle) * 9
  const scarfWave = physicsEnabled ? Math.sin(cycle * 1.35) * 18 : 0

  return (
    <g opacity={opacity} transform={`translate(${ghostShift} ${bob})`}>
      <ellipse cx="400" cy="520" rx="82" ry="13" fill="#000" opacity="0.28" />

      <path
        d={`M 437 269 C ${491 + scarfWave * 0.35} ${282 - scarfWave * 0.25}, ${515 + scarfWave} ${310 + scarfWave * 0.2}, ${544 + scarfWave * 0.7} ${300 - scarfWave * 0.15}`}
        fill="none"
        stroke={palette.scarf}
        strokeLinecap="round"
        strokeWidth="18"
      />
      <path
        d={`M 438 270 C ${490 + scarfWave * 0.35} ${282 - scarfWave * 0.25}, ${515 + scarfWave} ${310 + scarfWave * 0.2}, ${544 + scarfWave * 0.7} ${300 - scarfWave * 0.15}`}
        fill="none"
        stroke="#fff"
        strokeDasharray="4 13"
        strokeLinecap="round"
        strokeWidth="2"
        opacity="0.35"
      />

      <g transform={`rotate(${legSwing} 378 414)`}>
        <path d="M378 407 L369 485" stroke="#202d33" strokeLinecap="round" strokeWidth="29" />
        <path d="M369 481 L350 509" stroke="#172027" strokeLinecap="round" strokeWidth="23" />
        <path d="M350 509 L326 512" stroke="#0e161b" strokeLinecap="round" strokeWidth="17" />
      </g>
      <g transform={`rotate(${-legSwing} 421 414)`}>
        <path d="M421 407 L429 485" stroke="#25343b" strokeLinecap="round" strokeWidth="29" />
        <path d="M429 481 L444 509" stroke="#172027" strokeLinecap="round" strokeWidth="23" />
        <path d="M444 509 L469 512" stroke="#0e161b" strokeLinecap="round" strokeWidth="17" />
      </g>

      <path
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

      <g transform={`rotate(${armSwing} 357 319)`}>
        <path
          d="M357 319 L320 373"
          stroke={palette.jacketDark}
          strokeLinecap="round"
          strokeWidth="25"
        />
        <path d="M320 373 L301 420" stroke="#d99c76" strokeLinecap="round" strokeWidth="18" />
        <circle cx="298" cy="426" r="12" fill="#e7ad87" />
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

      <rect x="386" y="273" width="28" height="35" rx="12" fill="#d99c76" />
      <circle
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
  selectedId,
  isPlaying,
  flags,
  onZoomChange,
  onTransformChange,
  onSelect,
  onToggle,
  onFeatureNotImplemented
}: ViewportCanvasProps): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null)
  const palette = palettes[activeSkin as keyof typeof palettes] ?? palettes['skin-ember']

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>): void {
    if (artwork) return
    if (!['select', 'translate', 'pose'].includes(tool)) return
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
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const characterTransform = `translate(${transform.x} ${transform.y}) rotate(${transform.rotation} 400 350) scale(${transform.scaleX / 100} ${transform.scaleY / 100})`
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
        ref={svgRef}
        role="img"
        aria-label="Interactive rig viewport"
        viewBox="0 0 800 600"
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

        <g transform={`translate(400 300) scale(${zoom / 100}) translate(-400 -300)`}>
          {artwork ? (
            <ArtworkComposition artwork={artwork} selectedId={selectedId} onSelect={onSelect} />
          ) : (
            <g
              transform={characterTransform}
              filter={flags.ghosting ? undefined : 'url(#character-shadow)'}
            >
              {flags.ghosting ? (
                <>
                  <g style={{ mixBlendMode: 'screen' }}>
                    <CharacterArt
                      palette={palette}
                      frame={Math.max(0, frame - 6)}
                      physicsEnabled={flags.physicsEnabled}
                      opacity={0.12}
                      ghostShift={-24}
                      selectedId=""
                    />
                    <CharacterArt
                      palette={palette}
                      frame={Math.min(duration, frame + 6)}
                      physicsEnabled={flags.physicsEnabled}
                      opacity={0.1}
                      ghostShift={24}
                      selectedId=""
                    />
                  </g>
                </>
              ) : null}
              <g filter="url(#character-shadow)">
                <CharacterArt
                  palette={palette}
                  frame={frame}
                  physicsEnabled={flags.physicsEnabled}
                  selectedId={selectedId}
                />
              </g>

              {flags.showWeights ? (
                <g opacity="0.8" style={{ mixBlendMode: 'screen' }}>
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
                <g fill="none" stroke="#70e1cf" strokeWidth="1" opacity="0.72">
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
                <g>
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
                <g fill="none" stroke="#ff786f" strokeDasharray="5 4" strokeWidth="1.5">
                  <rect x="337" y="177" width="129" height="348" rx="14" />
                  <path d="M353 417 L447 417 L466 506 L331 506 Z" />
                  <text x="340" y="169" fill="#ff9a91" fontSize="10">
                    body_hitbox
                  </text>
                </g>
              ) : null}

              {flags.showBones ? (
                <g fill="none" stroke="#f7c860" strokeLinecap="round" strokeWidth="4">
                  <path d="M400 416 L400 355 L400 298 L400 244" />
                  <path d="M400 315 L357 320 L320 373 L298 426" />
                  <path d="M400 315 L443 320 L478 370 L504 418" />
                  <path d="M400 416 L378 416 L369 485 L350 509" />
                  <path d="M400 416 L421 416 L429 485 L444 509" />
                  {[
                    [400, 416],
                    [400, 355],
                    [400, 298],
                    [400, 244],
                    [357, 320],
                    [320, 373],
                    [298, 426],
                    [443, 320],
                    [478, 370],
                    [504, 418],
                    [378, 416],
                    [369, 485],
                    [350, 509],
                    [421, 416],
                    [429, 485],
                    [444, 509]
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

              {(tool === 'pose' || selectedId === 'constraint-foot-ik') && (
                <g>
                  <path
                    d="M421 416 Q480 450 476 510"
                    fill="none"
                    stroke="#86a9ff"
                    strokeDasharray="4 4"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx="476"
                    cy="510"
                    r="13"
                    fill="#17213a"
                    stroke="#86a9ff"
                    strokeWidth="2"
                  />
                  <path d="M469 510 H483 M476 503 V517" stroke="#b9c6ff" strokeWidth="1.5" />
                  <text x="492" y="513" fill="#aebeff" fontSize="10">
                    IK target
                  </text>
                </g>
              )}

              {(selectedId === 'constraint-scarf-path' || tool === 'mesh') && (
                <g>
                  <path
                    d="M438 270 C 482 260 520 325 565 288"
                    fill="none"
                    stroke="#d987e6"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M438 270 L482 260 M520 325 L565 288"
                    fill="none"
                    stroke="#d987e6"
                    strokeDasharray="3 3"
                    opacity="0.6"
                  />
                  <circle cx="438" cy="270" r="4" fill="#d987e6" />
                  <circle cx="482" cy="260" r="3" fill="#0a1419" stroke="#d987e6" />
                  <circle cx="520" cy="325" r="3" fill="#0a1419" stroke="#d987e6" />
                  <circle cx="565" cy="288" r="4" fill="#d987e6" />
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
