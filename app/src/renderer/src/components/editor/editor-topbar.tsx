import { PanelTop, Save, Wand2 } from 'lucide-react'

import { EditorMenubar } from '@/components/editor/editor-menubar'
import { Button } from '@/components/ui/button'
import type { EditorMode } from '@/@types'
import { cn } from '@/lib/utils'

interface EditorTopbarProps {
  mode: EditorMode
  onModeChange: (mode: EditorMode) => void
  onNewProject: () => void
  onImportArtwork: () => void
  onFeatureNotImplemented: (feature: string) => void
  onInsertKey: () => void
  onResetDemo: () => void
  onToggle: (
    key: 'showGrid' | 'showBones' | 'showMesh' | 'showBounds' | 'ghosting' | 'audioEnabled'
  ) => void
  flags: Record<
    'showGrid' | 'showBones' | 'showMesh' | 'showBounds' | 'ghosting' | 'audioEnabled',
    boolean
  >
}

export function EditorTopbar({
  mode,
  onModeChange,
  onNewProject,
  onImportArtwork,
  onFeatureNotImplemented,
  onInsertKey,
  onResetDemo,
  onToggle,
  flags
}: EditorTopbarProps): React.JSX.Element {
  return (
    <header className="surface-glow flex h-11 shrink-0 items-center border-b border-border/85 bg-[#0d171d] px-2">
      <EditorMenubar
        onNewProject={onNewProject}
        onImportArtwork={onImportArtwork}
        onFeatureNotImplemented={onFeatureNotImplemented}
        onInsertKey={onInsertKey}
        onResetDemo={onResetDemo}
        onToggle={onToggle}
        flags={flags}
      />

      <div className="absolute left-1/2 flex -translate-x-1/2 items-center rounded-lg border border-border/80 bg-background/55 p-0.5 shadow-inner">
        <button
          type="button"
          onClick={() => onModeChange('setup')}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-md px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors',
            mode === 'setup' && 'bg-secondary text-foreground shadow-sm'
          )}
        >
          <PanelTop className="size-3.5" /> Setup
        </button>
        <button
          type="button"
          onClick={() => onModeChange('animate')}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-md px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors',
            mode === 'animate' && 'bg-primary/16 text-primary shadow-sm ring-1 ring-primary/20'
          )}
        >
          <Wand2 className="size-3.5" /> Animate
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-[10px] text-muted-foreground"
          onClick={() => onFeatureNotImplemented('Save project')}
        >
          <Save /> <span className="hide-compact">Save</span>
        </Button>
      </div>
    </header>
  )
}
