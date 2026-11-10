import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'

import { FeatureNotImplementedDialog } from '@/components/editor/dialogs/feature-not-implemented-dialog'
import { LayeredArtworkDialog } from '@/components/editor/dialogs/layered-artwork-dialog'
import {
  NewProjectDialog,
  type NewProjectValues
} from '@/components/editor/dialogs/project-dialogs'
import { EditorTopbar } from '@/components/editor/editor-topbar'
import { HierarchyPanel } from '@/components/editor/hierarchy-panel'
import { InspectorPanel } from '@/components/editor/inspector-panel'
import { StatusBar } from '@/components/editor/status-bar'
import { TimelinePanel } from '@/components/editor/timeline-panel'
import { ToolStrip } from '@/components/editor/tool-strip'
import { ViewportCanvas } from '@/components/editor/viewport-canvas'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useEditorShortcuts } from '@/hooks/use-editor-shortcuts'
import { useEditorState, useSelectedEntity } from '@/hooks/use-editor-state'
import { usePlayback } from '@/hooks/use-playback'
import type { EditorSelection, ViewFlag } from '@/@types'
import { importArtworkFiles } from '@/lib/import-artwork'

function selectionFromId(id: string): EditorSelection {
  if (id.startsWith('artwork-layer-')) return { kind: 'artwork-layer', id }
  if (id.startsWith('bone-')) return { kind: 'bone', id }
  if (id.startsWith('slot-')) return { kind: 'slot', id }
  if (id.startsWith('constraint-')) return { kind: 'constraint', id }
  if (id === 'attachment-hurtbox') return { kind: 'bounding-box', id }
  if (id.startsWith('attachment-')) return { kind: 'attachment', id }
  if (id.startsWith('animation-')) return { kind: 'animation', id }
  if (id.startsWith('skin-')) return { kind: 'skin', id }
  return { kind: 'skeleton', id }
}

export function EditorLayout(): React.JSX.Element {
  const { state, actions } = useEditorState()
  const selectedEntity = useSelectedEntity()
  const [unimplementedFeature, setUnimplementedFeature] = useState<string | null>(null)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [artworkImportOpen, setArtworkImportOpen] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)

  const selectedId = state.selection?.id ?? 'bone-head'
  const selectedName =
    selectedEntity && 'name' in selectedEntity ? selectedEntity.name : state.project.skeletonName
  const selectedArtworkLayer =
    state.selection?.kind === 'artwork-layer'
      ? (state.project.artwork?.layers.find((layer) => layer.id === state.selection?.id) ?? null)
      : null

  const showFeatureNotImplemented = useCallback((feature: string): void => {
    setUnimplementedFeature(feature)
  }, [])

  const insertKey = useCallback((): void => {
    actions.upsertKeyframe(
      `track-${selectedId}-rotation`,
      selectedId,
      'rotation',
      state.frame,
      state.transform.rotation,
      'bezier'
    )
    setNotice(`Key added at frame ${state.frame}`)
  }, [actions, selectedId, state.frame, state.transform.rotation])

  usePlayback({
    isPlaying: state.isPlaying,
    frame: state.frame,
    fps: state.fps,
    duration: state.duration,
    loop: state.loop,
    onFrameChange: actions.setFrame,
    onPlayingChange: actions.setPlaying
  })

  useEditorShortcuts({
    onToolChange: actions.setTool,
    onTogglePlayback: actions.togglePlayback,
    onToggleGhosting: actions.toggleGhosting,
    onToggleBones: () => actions.toggleViewFlag('showBones'),
    onToggleSnap: () => actions.toggleViewFlag('snap'),
    onInsertKey: insertKey,
    onNewProject: () => setNewProjectOpen(true),
    onOpenProject: () => showFeatureNotImplemented('Open project'),
    onSave: () => showFeatureNotImplemented('Save project'),
    onFeatureNotImplemented: showFeatureNotImplemented
  })

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(null), 2600)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const toggleView = useCallback(
    (key: ViewFlag | 'ghosting' | 'physicsEnabled' | 'audioEnabled'): void => {
      if (key === 'ghosting') actions.toggleGhosting()
      else if (key === 'physicsEnabled') actions.togglePhysics()
      else if (key === 'audioEnabled') setAudioEnabled((value) => !value)
      else actions.toggleViewFlag(key)
    },
    [actions]
  )

  function handleCreateProject(values: NewProjectValues): void {
    actions.resetDemo()
    actions.setFps(values.fps)
    setNotice(`${values.name} created · ${values.width} × ${values.height}`)
  }

  async function handleArtworkImport(files: File[]): Promise<void> {
    const artwork = await importArtworkFiles(files)
    actions.setArtwork(artwork)
    setNotice(
      `Imported ${artwork.layers.length} layer${artwork.layers.length === 1 ? '' : 's'} from ${artwork.name}`
    )
  }

  return (
    <div className="flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <EditorTopbar
        mode={state.mode}
        onModeChange={actions.setMode}
        onNewProject={() => setNewProjectOpen(true)}
        onImportArtwork={() => setArtworkImportOpen(true)}
        onFeatureNotImplemented={showFeatureNotImplemented}
        onInsertKey={insertKey}
        onResetDemo={() => {
          actions.resetDemo()
          setNotice('Demo workspace restored')
        }}
        onToggle={toggleView}
        flags={{
          showGrid: state.showGrid,
          showBones: state.showBones,
          showMesh: state.showMesh,
          showBounds: state.showBounds,
          ghosting: state.ghosting,
          audioEnabled
        }}
      />

      <main className="flex min-h-0 min-w-0 flex-1">
        <ToolStrip
          tool={state.tool}
          onToolChange={actions.setTool}
          onFeatureNotImplemented={showFeatureNotImplemented}
          flags={{
            showBones: state.showBones,
            showGrid: state.showGrid,
            snap: state.snap,
            ghosting: state.ghosting
          }}
          onToggle={toggleView}
        />

        <ResizablePanelGroup orientation="horizontal" className="min-h-0 min-w-0 flex-1">
          <ResizablePanel defaultSize="20%" minSize="210px" maxSize="350px">
            <HierarchyPanel
              selectedId={selectedId}
              onSelect={(id) => actions.select(selectionFromId(id))}
              artwork={state.project.artwork}
              onArtworkLayerSelect={(id) => actions.select({ kind: 'artwork-layer', id })}
              onArtworkLayerVisibilityChange={actions.toggleArtworkLayer}
              onImportArtwork={() => setArtworkImportOpen(true)}
              activeSkin={state.activeSkin}
              onFeatureNotImplemented={showFeatureNotImplemented}
              onSkinChange={(id) => {
                actions.setActiveSkin(id)
                actions.select({ kind: 'skin', id })
              }}
            />
          </ResizablePanel>

          <ResizableHandle className="w-1 bg-border/70 hover:bg-primary/45" />

          <ResizablePanel defaultSize="57%" minSize="420px">
            <ResizablePanelGroup orientation="vertical" className="min-h-0">
              <ResizablePanel defaultSize="70%" minSize="300px">
                <ViewportCanvas
                  mode={state.mode}
                  tool={state.tool}
                  frame={state.frame}
                  duration={state.duration}
                  zoom={Math.round(state.zoom * 100)}
                  transform={{
                    ...state.transform,
                    scaleX: state.transform.scaleX * 100,
                    scaleY: state.transform.scaleY * 100,
                    opacity: state.transform.opacity * 100
                  }}
                  activeSkin={state.activeSkin}
                  artwork={state.project.artwork}
                  selectedId={selectedId}
                  isPlaying={state.isPlaying}
                  flags={{
                    showGrid: state.showGrid,
                    showBones: state.showBones,
                    showMesh: state.showMesh,
                    showWeights: state.showWeights,
                    showClipping: state.showClipping,
                    showBounds: state.showBounds,
                    ghosting: state.ghosting,
                    snap: state.snap,
                    physicsEnabled: state.physicsEnabled
                  }}
                  onZoomChange={(zoom) => actions.setZoom(zoom / 100)}
                  onTransformChange={(patch) => actions.updateTransform(patch)}
                  onSelect={(id) => actions.select(selectionFromId(id))}
                  onToggle={toggleView}
                  onFeatureNotImplemented={showFeatureNotImplemented}
                />
              </ResizablePanel>

              <ResizableHandle className="h-1 bg-border/70 hover:bg-primary/45" />

              <ResizablePanel defaultSize="30%" minSize="230px" maxSize="46%">
                <TimelinePanel
                  view={state.timelineView}
                  frame={state.frame}
                  fps={state.fps}
                  duration={state.duration}
                  isPlaying={state.isPlaying}
                  loop={state.loop}
                  autoKey={state.autoKey}
                  ghosting={state.ghosting}
                  audioEnabled={audioEnabled}
                  activeAnimation={state.activeAnimation}
                  animations={state.project.animations}
                  keyframes={state.keyframes}
                  onViewChange={actions.setTimelineView}
                  onFrameChange={actions.setFrame}
                  onTogglePlayback={actions.togglePlayback}
                  onLoopChange={actions.setLoop}
                  onAutoKeyChange={actions.setAutoKey}
                  onGhostingChange={actions.setGhosting}
                  onAudioEnabledChange={setAudioEnabled}
                  onAnimationChange={actions.setActiveAnimation}
                  onInsertKey={insertKey}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle className="w-1 bg-border/70 hover:bg-primary/45" />

          <ResizablePanel defaultSize="23%" minSize="245px" maxSize="390px">
            <InspectorPanel
              selectedId={selectedId}
              selectedName={selectedName}
              transform={state.transform}
              physics={state.physics}
              flags={{
                showMesh: state.showMesh,
                showWeights: state.showWeights,
                showClipping: state.showClipping,
                showBounds: state.showBounds,
                physicsEnabled: state.physicsEnabled
              }}
              frame={state.frame}
              artworkLayer={selectedArtworkLayer}
              onTransformChange={actions.updateTransform}
              onPhysicsChange={actions.updatePhysics}
              onPhysicsEnabledChange={actions.setPhysicsEnabled}
              onToggle={toggleView}
              onResetTransform={actions.resetTransform}
              onArtworkLayerVisibilityChange={actions.toggleArtworkLayer}
              onFeatureNotImplemented={showFeatureNotImplemented}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>

      <StatusBar
        selectedName={selectedName}
        tool={state.tool}
        frame={state.frame}
        fps={state.fps}
        isPlaying={state.isPlaying}
        autoKey={state.autoKey}
      />

      <FeatureNotImplementedDialog
        open={unimplementedFeature !== null}
        onOpenChange={(open) => {
          if (!open) setUnimplementedFeature(null)
        }}
        feature={unimplementedFeature ?? undefined}
      />
      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        onCreate={handleCreateProject}
      />
      {artworkImportOpen ? (
        <LayeredArtworkDialog
          open
          onOpenChange={setArtworkImportOpen}
          onImport={handleArtworkImport}
        />
      ) : null}

      {notice ? (
        <div className="fixed right-4 top-14 z-[70] flex items-center gap-2 rounded-lg border border-primary/25 bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur-xl">
          <CheckCircle2 className="size-4 text-primary" />
          <span>{notice}</span>
          <Button variant="ghost" size="icon-xs" onClick={() => setNotice(null)} className="ml-2">
            <X />
          </Button>
        </div>
      ) : null}
    </div>
  )
}
