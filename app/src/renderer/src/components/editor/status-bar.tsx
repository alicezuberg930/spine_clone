import { Activity, CheckCircle2, CircleDot, Cpu, HardDrive, MousePointer2 } from 'lucide-react'

interface StatusBarProps {
  selectedName: string
  tool: string
  frame: number
  fps: number
  isPlaying: boolean
  autoKey: boolean
}

export function StatusBar({
  selectedName,
  tool,
  frame,
  fps,
  isPlaying,
  autoKey
}: StatusBarProps): React.JSX.Element {
  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-border/85 bg-[#0b1419] px-2.5 text-[9px] text-muted-foreground">
      <span className="flex items-center gap-1.5 text-primary">
        <span className="status-pulse size-1.5 rounded-full bg-primary" /> Ready
      </span>
      <span className="flex items-center gap-1">
        <MousePointer2 className="size-3" /> {tool}
      </span>
      <span className="max-w-40 truncate text-foreground/70">{selectedName}</span>
      <span className="flex items-center gap-1">
        <CircleDot className="size-3" /> frame {frame}
      </span>
      {isPlaying ? (
        <span className="flex items-center gap-1 text-primary">
          <Activity className="size-3" /> {fps} fps realtime
        </span>
      ) : null}
      {autoKey ? (
        <span className="flex items-center gap-1 text-[#ff9189]">
          <CircleDot className="size-3 fill-current" /> Auto key
        </span>
      ) : null}
      <span className="ml-auto flex items-center gap-1">
        <Cpu className="size-3" /> 2.1 ms
      </span>
      <span className="flex items-center gap-1">
        <HardDrive className="size-3" /> 48 MB
      </span>
      <span className="flex items-center gap-1 text-primary">
        <CheckCircle2 className="size-3" /> 0 problems
      </span>
    </footer>
  )
}
