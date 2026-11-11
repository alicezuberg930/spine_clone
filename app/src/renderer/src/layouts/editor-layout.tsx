import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'

import { FeatureNotImplementedDialog } from '@/components/editor/dialogs/feature-not-implemented-dialog'
import { AudioImportDialog } from '@/components/editor/dialogs/audio-import-dialog'
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
import {
  evaluateLayerDeformation,
  useEditorState,
  useSelectedEntity
} from '@/hooks/use-editor-state'
import { useAudioPlayback } from '@/hooks/use-audio-playback'
import { usePlayback } from '@/hooks/use-playback'
import type { AudioTrack, EditorSelection, ViewFlag } from '@/@types'
import { importArtworkFiles } from '@/lib/import-artwork'
import { createDefaultClipping, createGridMesh, weightedMeshDeformation } from '@/lib/mesh-geometry'
import { serializeProject } from '@/lib/project-serialization'
import { rasterizeSceneToPng, drawSceneToCanvas } from '@/lib/rasterize-scene'
import { recordSceneVideo } from '@/lib/record-scene-video'
import { serializeRuntimeData } from '@/lib/runtime-data-export'

function selectionFromId(id: string): EditorSelection {
  if (id.startsWith('audio-')) return { kind: 'audio', id }
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
  const [audioImportOpen, setAudioImportOpen] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [outputBusy, setOutputBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const viewportSvgRef = useRef<SVGSVGElement | null>(null)

  const selectedId = state.selection?.id ?? 'bone-head'
  const selectedName =
    selectedEntity && 'name' in selectedEntity ? selectedEntity.name : state.project.skeletonName
  const selectedArtworkLayer =
    state.selection?.kind === 'artwork-layer'
      ? (state.project.artwork?.layers.find((layer) => layer.id === state.selection?.id) ?? null)
      : null
  const selectedConstraint =
    state.selection?.kind === 'constraint'
      ? (state.project.constraints.find((constraint) => constraint.id === state.selection?.id) ??
        null)
      : null
  const selectedAudioTrack =
    state.selection?.kind === 'audio'
      ? (state.project.audioTracks.find((track) => track.id === state.selection?.id) ?? null)
      : null
  const audioTrack = selectedAudioTrack ?? state.project.audioTracks[0] ?? null
  const keyedDeformations = useMemo(
    () =>
      Object.fromEntries(
        (state.project.artwork?.layers ?? []).map((layer) => [
          layer.id,
          evaluateLayerDeformation(state.keyframes, layer.id, state.frame)
        ])
      ),
    [state.frame, state.keyframes, state.project.artwork]
  )
  const deformations = useMemo(
    () =>
      Object.fromEntries(
        (state.project.artwork?.layers ?? []).map((layer) => {
          const keyed = keyedDeformations[layer.id] ?? {}
          const weighted = layer.mesh
            ? weightedMeshDeformation(layer.mesh, state.project.bones)
            : {}
          const vertexIds = new Set([...Object.keys(keyed), ...Object.keys(weighted)])
          return [
            layer.id,
            Object.fromEntries(
              [...vertexIds].map((id) => [
                id,
                {
                  x: (keyed[id]?.x ?? 0) + (weighted[id]?.x ?? 0),
                  y: (keyed[id]?.y ?? 0) + (weighted[id]?.y ?? 0)
                }
              ])
            )
          ]
        })
      ),
    [keyedDeformations, state.project.artwork, state.project.bones]
  )

  const showFeatureNotImplemented = useCallback((feature: string): void => {
    setUnimplementedFeature(feature)
  }, [])

  const insertKey = useCallback((): void => {
    if (state.tool === 'deform' && selectedArtworkLayer) {
      actions.upsertKeyframe(
        `track-${selectedArtworkLayer.id}-deform`,
        selectedArtworkLayer.id,
        'deform',
        state.frame,
        {
          kind: 'mesh-deform',
          offsets: evaluateLayerDeformation(state.keyframes, selectedArtworkLayer.id, state.frame)
        },
        'linear'
      )
      setNotice(`Deformation key added at frame ${state.frame}`)
      return
    }
    actions.upsertKeyframe(
      `track-${selectedId}-rotation`,
      selectedId,
      'rotation',
      state.frame,
      state.transform.rotation,
      'bezier'
    )
    setNotice(`Key added at frame ${state.frame}`)
  }, [
    actions,
    selectedArtworkLayer,
    selectedId,
    state.frame,
    state.keyframes,
    state.tool,
    state.transform.rotation
  ])

  const outputName = useCallback(
    (extension: string): string =>
      `${
        state.project.name
          .trim()
          .replace(/[^a-z0-9_-]+/gi, '-')
          .replace(/^-+|-+$/g, '') || 'untitled'
      }.${extension}`,
    [state.project.name]
  )

  const handleSaveProject = useCallback(async (): Promise<void> => {
    if (outputBusy) return
    setOutputBusy('Saving project')
    try {
      const result = await window.api.saveProject({
        projectId: state.project.id,
        suggestedName: outputName('lfproj'),
        contents: serializeProject(state)
      })
      if (result.status === 'saved') setNotice(`Project saved to ${result.filePath}`)
      else if (result.status === 'error') setNotice(result.message)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The project could not be saved.')
    } finally {
      setOutputBusy(null)
    }
  }, [outputBusy, outputName, state])

  const handleExportData = useCallback(async (): Promise<void> => {
    if (outputBusy) return
    setOutputBusy('Exporting data')
    try {
      const result = await window.api.saveFile({
        kind: 'json',
        suggestedName: outputName('json'),
        contents: serializeRuntimeData(state)
      })
      if (result.status === 'saved') setNotice(`Runtime data exported to ${result.filePath}`)
      else if (result.status === 'error') setNotice(result.message)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Runtime data could not be exported.')
    } finally {
      setOutputBusy(null)
    }
  }, [outputBusy, outputName, state])

  const handleExportImages = useCallback(async (): Promise<void> => {
    if (outputBusy) return
    const svg = viewportSvgRef.current
    if (!svg) {
      setNotice('The viewport is not ready to export.')
      return
    }
    setOutputBusy('Rendering image')
    try {
      const contents = await rasterizeSceneToPng(svg, {
        width: state.project.canvas.width,
        height: state.project.canvas.height
      })
      const result = await window.api.saveFile({
        kind: 'png',
        suggestedName: outputName('png'),
        contents
      })
      if (result.status === 'saved')
        setNotice(`Frame ${state.frame} exported to ${result.filePath}`)
      else if (result.status === 'error') setNotice(result.message)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The frame could not be exported.')
    } finally {
      setOutputBusy(null)
    }
  }, [outputBusy, outputName, state.frame, state.project.canvas.height, state.project.canvas.width])

  const handleExportVideo = useCallback(async (): Promise<void> => {
    if (outputBusy) return
    if (!viewportSvgRef.current) {
      setNotice('The viewport is not ready to export.')
      return
    }
    const previousFrame = state.frame
    const wasPlaying = state.isPlaying
    actions.setPlaying(false)
    setOutputBusy('Preparing video')
    try {
      const video = await recordSceneVideo({
        width: state.project.canvas.width,
        height: state.project.canvas.height,
        fps: state.fps,
        startFrame: 0,
        endFrame: state.duration,
        audio: audioEnabled
          ? state.project.audioTracks.map((track) => ({
              dataUrl: track.dataUrl,
              startFrame: track.startFrame,
              volume: track.volume,
              muted: track.muted
            }))
          : [],
        onProgress: ({ completedFrames, totalFrames }) =>
          setOutputBusy(`Rendering video ${completedFrames}/${totalFrames}`),
        renderFrame: async (frame, canvas) => {
          actions.setFrame(frame)
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
          const svg = viewportSvgRef.current
          if (!svg) throw new Error('The viewport closed during video export.')
          await drawSceneToCanvas(svg, canvas, {
            width: state.project.canvas.width,
            height: state.project.canvas.height
          })
        }
      })
      const result = await window.api.saveFile({
        kind: 'webm',
        suggestedName: outputName('webm'),
        contents: video.contents
      })
      if (result.status === 'saved') setNotice(`Video exported to ${result.filePath}`)
      else if (result.status === 'error') setNotice(result.message)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The video could not be exported.')
    } finally {
      actions.setFrame(previousFrame)
      actions.setPlaying(wasPlaying)
      setOutputBusy(null)
    }
  }, [
    actions,
    audioEnabled,
    outputBusy,
    outputName,
    state.duration,
    state.fps,
    state.frame,
    state.isPlaying,
    state.project.audioTracks,
    state.project.canvas.height,
    state.project.canvas.width
  ])

  usePlayback({
    isPlaying: state.isPlaying,
    frame: state.frame,
    fps: state.fps,
    duration: state.duration,
    loop: state.loop,
    onFrameChange: actions.setFrame,
    onPlayingChange: actions.setPlaying
  })

  useAudioPlayback({
    clips: state.project.audioTracks,
    enabled: audioEnabled,
    frame: state.frame,
    fps: state.fps,
    isPlaying: state.isPlaying,
    onPlaybackError: (error) => setNotice(error.message)
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
    onSave: () => void handleSaveProject(),
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
      else if (key === 'audioEnabled') {
        setAudioEnabled((value) => !value)
      } else actions.toggleViewFlag(key)
    },
    [actions]
  )

  function handleCreateProject(values: NewProjectValues): void {
    actions.configureProject(values.name, values.width, values.height, values.fps)
    setNotice(`${values.name} created · ${values.width} × ${values.height}`)
  }

  async function handleArtworkImport(files: File[]): Promise<void> {
    const artwork = await importArtworkFiles(files)
    actions.setArtwork(artwork)
    setNotice(
      `Imported ${artwork.layers.length} layer${artwork.layers.length === 1 ? '' : 's'} from ${artwork.name}`
    )
  }

  function handleAudioImport(tracks: AudioTrack[]): void {
    tracks.forEach(actions.addAudioTrack)
    setAudioEnabled(true)
    const longestDuration = Math.max(...tracks.map((track) => track.durationSeconds))
    setNotice(
      tracks.length === 1
        ? `Imported ${tracks[0].name} · ${tracks[0].durationSeconds.toFixed(2)} seconds`
        : `Imported ${tracks.length} audio tracks · ${longestDuration.toFixed(2)} seconds longest`
    )
  }

  return (
    <div className="flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <EditorTopbar
        mode={state.mode}
        onModeChange={actions.setMode}
        onNewProject={() => setNewProjectOpen(true)}
        onImportArtwork={() => setArtworkImportOpen(true)}
        onImportAudio={() => setAudioImportOpen(true)}
        onSaveProject={() => void handleSaveProject()}
        onExportData={() => void handleExportData()}
        onExportImages={() => void handleExportImages()}
        onExportVideo={() => void handleExportVideo()}
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
              audioTracks={state.project.audioTracks}
              bones={state.project.bones}
              constraints={state.project.constraints}
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
                  constraints={state.project.constraints}
                  geometrySelection={state.geometrySelection}
                  weightBrush={state.weightBrush}
                  deformations={deformations}
                  keyedDeformations={keyedDeformations}
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
                  onConstraintChange={actions.updateConstraint}
                  onGeometrySelectionChange={actions.setGeometrySelection}
                  onMeshVerticesChange={actions.moveArtworkMeshVertices}
                  onDeformationChange={actions.setArtworkDeformation}
                  onClippingVerticesChange={actions.moveArtworkClippingVertices}
                  onWeightPaint={actions.paintArtworkWeights}
                  onAddClipVertex={actions.addClipVertex}
                  onRemoveGeometryVertices={actions.removeGeometryVertices}
                  onSvgElement={(element) => {
                    viewportSvgRef.current = element
                  }}
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
                  audioTracks={state.project.audioTracks}
                  selectedAudioTrackId={audioTrack?.id ?? null}
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
                  onAudioTrackSelect={(id) => actions.select({ kind: 'audio', id })}
                  onAudioTrackChange={actions.updateAudioTrack}
                  onAudioRemove={actions.removeAudioTrack}
                  onImportAudio={() => setAudioImportOpen(true)}
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
              tool={state.tool}
              bones={state.project.bones}
              geometrySelection={state.geometrySelection}
              weightBrush={state.weightBrush}
              selectedConstraint={selectedConstraint}
              selectedAudioTrack={selectedAudioTrack}
              onTransformChange={actions.updateTransform}
              onPhysicsChange={actions.updatePhysics}
              onPhysicsEnabledChange={actions.setPhysicsEnabled}
              onToggle={toggleView}
              onResetTransform={actions.resetTransform}
              onArtworkLayerVisibilityChange={actions.toggleArtworkLayer}
              onCreateArtworkMesh={(layerId, cells) => {
                const layer = state.project.artwork?.layers.find((item) => item.id === layerId)
                if (layer) {
                  actions.setArtworkMesh(
                    layerId,
                    createGridMesh(layer.width, layer.height, { columns: cells, rows: cells })
                  )
                }
              }}
              onResetArtworkDeformation={actions.resetArtworkDeformation}
              onWeightBrushChange={actions.setWeightBrush}
              onVertexWeightChange={actions.setVertexWeight}
              onCreateArtworkClipping={(layerId) => {
                const layer = state.project.artwork?.layers.find((item) => item.id === layerId)
                if (layer) {
                  actions.setArtworkClipping(
                    layerId,
                    createDefaultClipping(layer.width, layer.height)
                  )
                }
              }}
              onArtworkClippingChange={actions.updateArtworkClipping}
              onConstraintChange={actions.updateConstraint}
              onConstraintSelect={(id) => actions.select({ kind: 'constraint', id })}
              onAudioTrackChange={actions.updateAudioTrack}
              onAudioTrackRemove={actions.removeAudioTrack}
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
      {audioImportOpen ? (
        <AudioImportDialog
          open
          onOpenChange={setAudioImportOpen}
          onImport={handleAudioImport}
          startFrame={state.frame}
        />
      ) : null}

      {outputBusy ? (
        <div className="fixed bottom-10 right-4 z-[70] flex items-center gap-2 rounded-lg border border-primary/25 bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur-xl">
          <span className="size-3.5 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
          <span>{outputBusy}</span>
        </div>
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
