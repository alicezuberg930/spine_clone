import {
  Blend,
  Bone,
  BoxSelect,
  CircleDotDashed,
  Crop,
  Eye,
  Grid2X2,
  Hand,
  Magnet,
  MousePointer2,
  Move,
  PenTool,
  RotateCw,
  Scaling,
  Sparkles,
  SquareDashedMousePointer,
  Waypoints
} from 'lucide-react'

import { Separator } from '@/components/ui/separator'
import { IconTool } from '@/components/editor/icon-tool'
import type { EditorTool } from '@/@types'

interface ToolStripProps {
  tool: EditorTool
  onToolChange: (tool: EditorTool) => void
  onFeatureNotImplemented: (feature: string) => void
  flags: {
    showBones: boolean
    showGrid: boolean
    snap: boolean
    ghosting: boolean
  }
  onToggle: (key: 'showBones' | 'showGrid' | 'snap' | 'ghosting') => void
}

const primaryTools: Array<{
  id: EditorTool
  label: string
  shortcut: string
  icon: typeof MousePointer2
  implemented: boolean
}> = [
  { id: 'select', label: 'Select', shortcut: 'S', icon: MousePointer2, implemented: true },
  { id: 'translate', label: 'Translate', shortcut: 'T', icon: Move, implemented: true },
  { id: 'rotate', label: 'Rotate', shortcut: 'R', icon: RotateCw, implemented: true },
  { id: 'scale', label: 'Scale', shortcut: 'E', icon: Scaling, implemented: true },
  { id: 'pose', label: 'Pose / IK', shortcut: 'P', icon: Hand, implemented: true }
]

const geometryTools: Array<{
  id: EditorTool
  label: string
  shortcut: string
  icon: typeof PenTool
  implemented: boolean
}> = [
  { id: 'mesh', label: 'Edit mesh', shortcut: 'M', icon: PenTool, implemented: true },
  { id: 'deform', label: 'Deform mesh', shortcut: 'D', icon: Waypoints, implemented: true },
  { id: 'weights', label: 'Paint weights', shortcut: 'W', icon: Blend, implemented: true },
  { id: 'clipping', label: 'Edit clipping', shortcut: 'C', icon: Crop, implemented: true },
  { id: 'bounds', label: 'Edit bounds', shortcut: 'B', icon: BoxSelect, implemented: false }
]

export function ToolStrip({
  tool,
  onToolChange,
  onFeatureNotImplemented,
  flags,
  onToggle
}: ToolStripProps): React.JSX.Element {
  return (
    <aside className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-border/80 bg-[#0d161c] py-2">
      {primaryTools.map((item) => (
        <IconTool
          key={item.id}
          icon={item.icon}
          label={item.label}
          shortcut={item.shortcut}
          active={tool === item.id}
          onClick={() =>
            item.implemented ? onToolChange(item.id) : onFeatureNotImplemented(`${item.label} tool`)
          }
        />
      ))}

      <Separator className="my-1 w-6" />

      {geometryTools.map((item) => (
        <IconTool
          key={item.id}
          icon={item.icon}
          label={item.label}
          shortcut={item.shortcut}
          active={tool === item.id}
          onClick={() =>
            item.implemented ? onToolChange(item.id) : onFeatureNotImplemented(`${item.label} tool`)
          }
        />
      ))}

      <Separator className="my-1 w-6" />

      <IconTool
        icon={Bone}
        label="Skeleton overlay"
        shortcut="Shift+B"
        active={flags.showBones}
        onClick={() => onToggle('showBones')}
      />
      <IconTool
        icon={Grid2X2}
        label="Canvas grid"
        shortcut="#"
        active={flags.showGrid}
        onClick={() => onToggle('showGrid')}
      />
      <IconTool
        icon={Magnet}
        label="Snap"
        shortcut="Shift+S"
        active={flags.snap}
        onClick={() => onToggle('snap')}
      />
      <IconTool
        icon={Sparkles}
        label="Ghosting"
        shortcut="G"
        active={flags.ghosting}
        onClick={() => onToggle('ghosting')}
      />

      <div className="mt-auto flex flex-col gap-1">
        <IconTool
          icon={Eye}
          label="Preview runtime mix"
          shortcut="F9"
          onClick={() => onFeatureNotImplemented('Runtime mix preview')}
        />
        <IconTool
          icon={Waypoints}
          label="Constraint order"
          onClick={() => onFeatureNotImplemented('Constraint ordering')}
        />
        <IconTool
          icon={CircleDotDashed}
          label="Problems"
          onClick={() => onFeatureNotImplemented('Problems panel')}
        />
        <IconTool
          icon={SquareDashedMousePointer}
          label="Marquee options"
          onClick={() => onFeatureNotImplemented('Marquee options')}
        />
      </div>
    </aside>
  )
}
