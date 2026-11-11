import { useEffect } from 'react'

import type { EditorTool } from '@/@types'

interface UseEditorShortcutsOptions {
  onToolChange: (tool: EditorTool) => void
  onTogglePlayback: () => void
  onToggleGhosting: () => void
  onToggleBones: () => void
  onToggleSnap: () => void
  onInsertKey: () => void
  onNewProject: () => void
  onOpenProject: () => void
  onSave: () => void
  onFeatureNotImplemented: (feature: string) => void
}

const toolShortcuts: Record<string, EditorTool> = {
  s: 'select',
  t: 'translate',
  r: 'rotate',
  e: 'scale',
  p: 'pose',
  m: 'mesh',
  d: 'deform',
  w: 'weights',
  c: 'clipping'
}

const unavailableToolShortcuts: Record<string, string> = {
  b: 'Bounds editor'
}

export function useEditorShortcuts({
  onToolChange,
  onTogglePlayback,
  onToggleGhosting,
  onToggleBones,
  onToggleSnap,
  onInsertKey,
  onNewProject,
  onOpenProject,
  onSave,
  onFeatureNotImplemented
}: UseEditorShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return

      const key = event.key.toLowerCase()
      if (event.ctrlKey || event.metaKey) {
        if (key === 'n') {
          event.preventDefault()
          onNewProject()
        } else if (key === 'o') {
          event.preventDefault()
          onOpenProject()
        } else if (key === 's') {
          event.preventDefault()
          onSave()
        } else if (key === 'z') {
          event.preventDefault()
          onFeatureNotImplemented(event.shiftKey ? 'Redo' : 'Undo')
        } else if (key === 'y') {
          event.preventDefault()
          onFeatureNotImplemented('Redo')
        }
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        onTogglePlayback()
      } else if (event.code === 'F9') {
        event.preventDefault()
        onFeatureNotImplemented('Runtime mix preview')
      } else if (event.shiftKey && key === 'b') {
        onToggleBones()
      } else if (event.shiftKey && key === 's') {
        onToggleSnap()
      } else if (key === 'g') {
        onToggleGhosting()
      } else if (key === 'k') {
        onInsertKey()
      } else if (toolShortcuts[key]) {
        onToolChange(toolShortcuts[key])
      } else if (unavailableToolShortcuts[key]) {
        onFeatureNotImplemented(unavailableToolShortcuts[key])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    onInsertKey,
    onFeatureNotImplemented,
    onNewProject,
    onOpenProject,
    onSave,
    onToggleGhosting,
    onToggleBones,
    onTogglePlayback,
    onToggleSnap,
    onToolChange
  ])
}
