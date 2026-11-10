import { useMemo, type MouseEvent as ReactMouseEvent } from 'react'
import {
  ChevronFirst,
  ChevronLast,
  Circle,
  Diamond,
  Ghost,
  ListTree,
  Repeat2,
  Pause,
  Play,
  Plus,
  Settings2,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX
} from 'lucide-react'

import { IconTool } from '@/components/editor/icon-tool'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Animation, EditorKeyframe, TimelineView } from '@/@types'
import { cn } from '@/lib/utils'

interface TimelinePanelProps {
  view: TimelineView
  frame: number
  fps: number
  duration: number
  isPlaying: boolean
  loop: boolean
  autoKey: boolean
  ghosting: boolean
  audioEnabled: boolean
  activeAnimation: string
  animations: Animation[]
  keyframes: EditorKeyframe[]
  onViewChange: (view: TimelineView) => void
  onFrameChange: (frame: number) => void
  onTogglePlayback: () => void
  onLoopChange: (loop: boolean) => void
  onAutoKeyChange: (autoKey: boolean) => void
  onGhostingChange: (ghosting: boolean) => void
  onAudioEnabledChange: (enabled: boolean) => void
  onAnimationChange: (animation: string) => void
  onInsertKey: () => void
}

const trackLabels = [
  { id: 'bone-root', name: 'root · translate Y', color: '#89a7ff' },
  { id: 'bone-torso', name: 'torso · rotation', color: '#45d6bd' },
  { id: 'bone-head', name: 'head · rotation', color: '#f4b85a' },
  { id: 'bone-arm-l', name: 'arm L · rotation', color: '#ff8f9c' },
  { id: 'bone-cape', name: 'scarf · deform', color: '#d987e6' },
  { id: 'event-footstep', name: 'events · footsteps', color: '#ff786f' }
]

function PlaybackButton({
  label,
  icon: Icon,
  onClick,
  active
}: {
  label: string
  icon: typeof Play
  onClick: () => void
  active?: boolean
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            onClick={onClick}
            className={cn(active && 'bg-primary/12 text-primary')}
          />
        }
      >
        <Icon />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function Dopesheet({
  frame,
  duration,
  keyframes,
  onFrameChange
}: {
  frame: number
  duration: number
  keyframes: EditorKeyframe[]
  onFrameChange: (frame: number) => void
}): React.JSX.Element {
  const ruler = useMemo(
    () =>
      Array.from({ length: Math.min(duration, 120) + 1 }, (_, index) => index).filter(
        (value) => value % Math.max(1, Math.ceil(duration / 12)) === 0
      ),
    [duration]
  )

  function handleSeek(event: ReactMouseEvent<HTMLDivElement>): void {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    onFrameChange(Math.round(Math.max(0, Math.min(1, ratio)) * duration))
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="w-48 shrink-0 border-r border-border/70 bg-[#101920]">
        <div className="flex h-6 items-center gap-1.5 border-b border-border/70 px-2 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          <ListTree className="size-3" /> Timeline
        </div>
        {trackLabels.map((track, index) => (
          <div
            key={track.id}
            className={cn(
              'flex h-7 items-center gap-2 border-b border-border/35 px-2 text-[10px]',
              index === 2 && 'bg-primary/5'
            )}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: track.color }} />
            <span className="min-w-0 flex-1 truncate text-foreground/75">{track.name}</span>
            <Diamond className="size-2.5 text-muted-foreground/70" />
          </div>
        ))}
      </div>
      <div
        className="relative min-w-0 flex-1 overflow-hidden bg-[#0c151a]"
        onMouseDown={handleSeek}
      >
        <div className="relative h-6 border-b border-border/70 bg-[#111b22]">
          {ruler.map((value) => (
            <div
              key={value}
              className="absolute inset-y-0 border-l border-border/70 pt-1 pl-1 text-[8px] tabular-nums text-muted-foreground"
              style={{ left: `${(value / duration) * 100}%` }}
            >
              {value}
            </div>
          ))}
        </div>
        <div className="timeline-grid relative h-[168px] min-w-0">
          {trackLabels.map((track, row) => (
            <div key={track.id} className="relative h-7 border-b border-border/35">
              {keyframes
                .filter((keyframe) => {
                  if (row === 0) return keyframe.targetId.includes('root')
                  if (row === 1)
                    return (
                      keyframe.targetId.includes('torso') || keyframe.targetId.includes('chest')
                    )
                  if (row === 2) return keyframe.targetId.includes('head')
                  if (row === 3) return keyframe.targetId.includes('arm')
                  if (row === 4) return keyframe.targetId.includes('cape')
                  return false
                })
                .map((keyframe) => (
                  <button
                    key={keyframe.id}
                    type="button"
                    aria-label={`Keyframe at ${keyframe.frame}`}
                    className="key-diamond absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-150"
                    style={{
                      left: `${(keyframe.frame / duration) * 100}%`,
                      backgroundColor: track.color
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={() => onFrameChange(keyframe.frame)}
                  />
                ))}
              {row === 5
                ? [3, 9, 15, 21, 27]
                    .filter((eventFrame) => eventFrame <= duration)
                    .map((eventFrame) => (
                      <button
                        key={eventFrame}
                        type="button"
                        className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#ff786f] bg-[#311a1b]"
                        style={{ left: `${(eventFrame / duration) * 100}%` }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={() => onFrameChange(eventFrame)}
                      />
                    ))
                : null}
            </div>
          ))}
        </div>
        <div
          className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-primary shadow-[0_0_8px_rgba(69,214,189,0.55)]"
          style={{ left: `${(frame / duration) * 100}%` }}
        >
          <div className="absolute -left-[4px] top-0 size-2 rotate-45 rounded-[1px] bg-primary" />
        </div>
      </div>
    </div>
  )
}

function GraphEditor({
  frame,
  duration,
  onFrameChange
}: {
  frame: number
  duration: number
  onFrameChange: (frame: number) => void
}): React.JSX.Element {
  return (
    <div className="relative h-full overflow-hidden bg-[#0c151a]">
      <svg viewBox="0 0 900 210" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <pattern id="graph-grid" width="60" height="35" patternUnits="userSpaceOnUse">
            <path d="M60 0H0V35" fill="none" stroke="#263741" strokeWidth="1" opacity="0.7" />
          </pattern>
          <linearGradient id="curve-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#45d6bd" stopOpacity="0.22" />
            <stop offset="1" stopColor="#45d6bd" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width="900" height="210" fill="url(#graph-grid)" />
        <path
          d="M0 160 C90 160 95 45 190 45 S305 168 390 145 S470 52 550 70 S680 170 760 120 S845 35 900 52 L900 210 L0 210 Z"
          fill="url(#curve-fill)"
        />
        <path
          d="M0 160 C90 160 95 45 190 45 S305 168 390 145 S470 52 550 70 S680 170 760 120 S845 35 900 52"
          fill="none"
          stroke="#45d6bd"
          strokeWidth="2.5"
        />
        <path
          d="M190 45 L135 45 M190 45 L250 45 M550 70 L495 110 M550 70 L610 70"
          stroke="#f4b85a"
          strokeWidth="1"
          opacity="0.75"
        />
        {[
          [0, 160, 0],
          [190, 45, Math.round(duration * 0.2)],
          [390, 145, Math.round(duration * 0.42)],
          [550, 70, Math.round(duration * 0.61)],
          [760, 120, Math.round(duration * 0.84)],
          [900, 52, duration]
        ].map(([x, y, keyFrame]) => (
          <g key={x} onClick={() => onFrameChange(keyFrame)} className="cursor-pointer">
            <circle cx={x} cy={y} r="7" fill="#0c151a" stroke="#f4b85a" strokeWidth="2" />
            <circle cx={x} cy={y} r="2" fill="#f4b85a" />
          </g>
        ))}
        <line
          x1={(frame / duration) * 900}
          y1="0"
          x2={(frame / duration) * 900}
          y2="210"
          stroke="#45d6bd"
          strokeWidth="1"
        />
      </svg>
      <div className="pointer-events-none absolute left-3 top-2 flex gap-2 text-[9px] text-muted-foreground">
        <Badge
          variant="outline"
          className="h-5 border-primary/25 bg-primary/5 text-[9px] text-primary"
        >
          rotation
        </Badge>
        <span className="pt-1">Bezier · weighted tangents</span>
      </div>
    </div>
  )
}

function AudioTimeline({
  enabled,
  onEnabledChange
}: {
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
}): React.JSX.Element {
  const bars = useMemo(
    () =>
      Array.from(
        { length: 96 },
        (_, index) => 8 + Math.abs(Math.sin(index * 0.67) * 46 + Math.cos(index * 0.21) * 24)
      ),
    []
  )
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0c151a]">
      <div className="flex h-8 items-center gap-2 border-b border-border/70 px-3">
        {enabled ? (
          <Volume2 className="size-3.5 text-primary" />
        ) : (
          <VolumeX className="size-3.5 text-muted-foreground" />
        )}
        <span className="text-[10px] font-medium">forest-loop.ogg</span>
        <span className="text-[9px] text-muted-foreground">48 kHz · stereo</span>
        <Switch size="sm" checked={enabled} onCheckedChange={onEnabledChange} className="ml-auto" />
      </div>
      <div className="flex min-h-0 flex-1 items-center gap-[2px] overflow-hidden px-3">
        {bars.map((height, index) => (
          <span
            key={index}
            className={cn(
              'min-w-[2px] flex-1 rounded-full',
              enabled ? 'bg-primary/65' : 'bg-muted-foreground/25'
            )}
            style={{ height: `${Math.min(82, height)}%` }}
          />
        ))}
      </div>
    </div>
  )
}

export function TimelinePanel({
  view,
  frame,
  fps,
  duration,
  isPlaying,
  loop,
  autoKey,
  ghosting,
  audioEnabled,
  activeAnimation,
  animations,
  keyframes,
  onViewChange,
  onFrameChange,
  onTogglePlayback,
  onLoopChange,
  onAutoKeyChange,
  onGhostingChange,
  onAudioEnabledChange,
  onAnimationChange,
  onInsertKey
}: TimelinePanelProps): React.JSX.Element {
  return (
    <section className="flex h-full min-h-0 flex-col bg-[#0d161c]">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/80 bg-[#121d24] px-2">
        <Tabs
          value={view}
          onValueChange={(value) => onViewChange(value as TimelineView)}
          className="gap-0"
        >
          <TabsList className="h-7 rounded-md bg-background/55 p-0.5">
            <TabsTrigger value="dopesheet" className="h-6 px-2 text-[10px]">
              Dopesheet
            </TabsTrigger>
            <TabsTrigger value="graph" className="h-6 px-2 text-[10px]">
              Graph
            </TabsTrigger>
            <TabsTrigger value="audio" className="h-6 px-2 text-[10px]">
              Audio
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Separator orientation="vertical" className="h-5" />

        <NativeSelect
          size="sm"
          value={activeAnimation}
          onChange={(event) => onAnimationChange(event.target.value)}
          className="w-40"
        >
          {animations.map((animation) => (
            <NativeSelectOption key={animation.id} value={animation.id}>
              {animation.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <div className="ml-auto flex items-center gap-0.5">
          <span className="hide-compact flex items-center gap-0.5">
            <PlaybackButton
              label="First frame"
              icon={ChevronFirst}
              onClick={() => onFrameChange(0)}
            />
            <PlaybackButton
              label="Previous frame"
              icon={SkipBack}
              onClick={() => onFrameChange(Math.max(0, frame - 1))}
            />
          </span>
          <PlaybackButton
            label={isPlaying ? 'Pause' : 'Play'}
            icon={isPlaying ? Pause : Play}
            onClick={onTogglePlayback}
            active={isPlaying}
          />
          <span className="hide-compact flex items-center gap-0.5">
            <PlaybackButton
              label="Next frame"
              icon={SkipForward}
              onClick={() => onFrameChange(Math.min(duration, frame + 1))}
            />
            <PlaybackButton
              label="Last frame"
              icon={ChevronLast}
              onClick={() => onFrameChange(duration)}
            />
          </span>
          <PlaybackButton
            label="Loop playback"
            icon={Repeat2}
            onClick={() => onLoopChange(!loop)}
            active={loop}
          />
        </div>

        <Separator orientation="vertical" className="h-5" />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onAutoKeyChange(!autoKey)}
                className={cn('gap-1.5 text-[10px]', autoKey && 'bg-[#ff786f]/12 text-[#ff9189]')}
              />
            }
          >
            <Circle className={cn('size-2.5', autoKey && 'fill-current')} /> Auto
          </TooltipTrigger>
          <TooltipContent>Auto Key</TooltipContent>
        </Tooltip>
        <span className="hide-compact">
          <IconTool
            icon={Ghost}
            label="Ghosting"
            active={ghosting}
            onClick={() => onGhostingChange(!ghosting)}
          />
        </span>
        <IconTool icon={Plus} label="Insert key" shortcut="K" onClick={onInsertKey} />
        <span className="hide-compact">
          <IconTool icon={Settings2} label="Timeline settings" />
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {view === 'dopesheet' ? (
          <Dopesheet
            frame={frame}
            duration={duration}
            keyframes={keyframes}
            onFrameChange={onFrameChange}
          />
        ) : null}
        {view === 'graph' ? (
          <GraphEditor frame={frame} duration={duration} onFrameChange={onFrameChange} />
        ) : null}
        {view === 'audio' ? (
          <AudioTimeline enabled={audioEnabled} onEnabledChange={onAudioEnabledChange} />
        ) : null}
      </div>

      <div className="flex h-6 shrink-0 items-center gap-3 border-t border-border/70 bg-[#101920] px-2 text-[9px] text-muted-foreground">
        <span className="tabular-nums text-foreground/80">
          F{frame.toString().padStart(3, '0')}
        </span>
        <span>/ {duration} frames</span>
        <span>{fps} fps</span>
        <span>{(frame / fps).toFixed(2)} s</span>
        <span className="ml-auto flex items-center gap-1">
          <Sparkles className="size-3 text-primary" /> Preview mix 100%
        </span>
      </div>
    </section>
  )
}
