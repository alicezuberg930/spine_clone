import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'

import { FeatureNotImplementedDialog } from '@/components/editor/dialogs/feature-not-implemented-dialog'
import { AudioImportDialog } from '@/components/editor/dialogs/audio-import-dialog'
import { AnimationNameDialog } from '@/components/editor/dialogs/animation-name-dialog'
import { DeleteAnimationDialog } from '@/components/editor/dialogs/delete-animation-dialog'
import { DeleteBoneDialog } from '@/components/editor/dialogs/delete-bone-dialog'
import { LayeredArtworkDialog } from '@/components/editor/dialogs/layered-artwork-dialog'
import { RenameBoneDialog } from '@/components/editor/dialogs/rename-bone-dialog'
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
import type { AudioTrack, BoneDeletionMode, EditorSelection, Transform, ViewFlag } from '@/@types'
import { evaluateBoneTransforms } from '@/lib/bone-animation'
import { boneNameValidationError, normalizeBoneName } from '@/lib/bone-naming'
import {
  animationNameValidationError,
  nextAnimationName,
  normalizeAnimationName
} from '@/lib/animation-management'
import { importArtworkFiles } from '@/lib/import-artwork'
import { createDefaultClipping, createGridMesh, weightedMeshDeformation } from '@/lib/mesh-geometry'
import { deserializeProject, serializeProject } from '@/lib/project-serialization'
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

type AnimationNameDialogState = { mode: 'create' } | { mode: 'rename'; animationId: string }

export function EditorLayout(): React.JSX.Element {
  const { state, actions } = useEditorState()
  const selectedEntity = useSelectedEntity()
  const [unimplementedFeature, setUnimplementedFeature] = useState<string | null>(null)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [artworkImportOpen, setArtworkImportOpen] = useState(false)
  const [audioImportOpen, setAudioImportOpen] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [pendingDeleteBoneId, setPendingDeleteBoneId] = useState<string | null>(null)
  const [pendingRenameBoneId, setPendingRenameBoneId] = useState<string | null>(null)
  const [renameBoneError, setRenameBoneError] = useState<string | null>(null)
  const [animationNameDialog, setAnimationNameDialog] = useState<AnimationNameDialogState | null>(
    null
  )
  const [animationNameError, setAnimationNameError] = useState<string | null>(null)
  const [pendingDeleteAnimationId, setPendingDeleteAnimationId] = useState<string | null>(null)
  const [outputBusy, setOutputBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const viewportSvgRef = useRef<SVGSVGElement | null>(null)

  const selectedId = state.selection?.id ?? ''
  const selectedBone =
    state.selection?.kind === 'bone'
      ? (state.project.bones.find((bone) => bone.id === state.selection?.id) ?? null)
      : null
  const pendingDeleteBone = pendingDeleteBoneId
    ? (state.project.bones.find((bone) => bone.id === pendingDeleteBoneId) ?? null)
    : null
  const pendingRenameBone = pendingRenameBoneId
    ? (state.project.bones.find((bone) => bone.id === pendingRenameBoneId) ?? null)
    : null
  const pendingRenameAnimation =
    animationNameDialog?.mode === 'rename'
      ? (state.project.animations.find(
          (animation) => animation.id === animationNameDialog.animationId
        ) ?? null)
      : null
  const pendingDeleteAnimation = pendingDeleteAnimationId
    ? (state.project.animations.find((animation) => animation.id === pendingDeleteAnimationId) ??
      null)
    : null
  const pendingDeleteChildCount = pendingDeleteBone
    ? state.project.bones.filter((bone) => bone.parentId === pendingDeleteBone.id).length
    : 0
  const pendingDeleteDescendantCount = useMemo(() => {
    if (!pendingDeleteBone) return 0
    const childrenByParent = new Map<string, string[]>()
    state.project.bones.forEach((bone) => {
      if (!bone.parentId) return
      const children = childrenByParent.get(bone.parentId) ?? []
      children.push(bone.id)
      childrenByParent.set(bone.parentId, children)
    })
    let count = 0
    const pending = [...(childrenByParent.get(pendingDeleteBone.id) ?? [])]
    const visited = new Set<string>()
    while (pending.length > 0) {
      const id = pending.pop()
      if (!id || visited.has(id)) continue
      visited.add(id)
      count += 1
      pending.push(...(childrenByParent.get(id) ?? []))
    }
    return count
  }, [pendingDeleteBone, state.project.bones])
  const selectedName =
    selectedEntity && 'name' in selectedEntity
      ? selectedEntity.name
      : state.selection
        ? state.project.skeletonName
        : 'No selection'
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
  const selectedIds = state.selections.map((selection) => selection.id)
  const displayedBones = useMemo(
    () =>
      state.mode === 'animate'
        ? evaluateBoneTransforms(state.project.bones, state.keyframes, state.frame)
        : state.project.bones,
    [state.frame, state.keyframes, state.mode, state.project.bones]
  )
  const displayedSelectedBone =
    state.selection?.kind === 'bone'
      ? (displayedBones.find((bone) => bone.id === state.selection?.id) ?? null)
      : null
  const displayedTransform = displayedSelectedBone?.transform ?? state.transform
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
          // A layer uses either rigid bone binding or weighted skinning. Applying both
          // would multiply the same bone delta twice.
          const weighted =
            layer.mesh && !layer.boneId
              ? weightedMeshDeformation(layer.mesh, displayedBones, {
                  x: layer.x,
                  y: layer.y
                })
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
    [displayedBones, keyedDeformations, state.project.artwork]
  )

  const showFeatureNotImplemented = useCallback((feature: string): void => {
    setUnimplementedFeature(feature)
  }, [])

  const requestBoneDelete = useCallback(
    (boneId?: string): void => {
      const id = boneId ?? (state.selection?.kind === 'bone' ? state.selection.id : null)
      if (!id) return
      const bone = state.project.bones.find((candidate) => candidate.id === id)
      if (!bone) return
      if (bone.parentId === null) {
        setNotice('The root bone cannot be deleted.')
        return
      }
      if (state.selection?.kind !== 'bone' || state.selection.id !== id) {
        actions.select({ kind: 'bone', id })
      }
      setPendingDeleteBoneId(id)
    },
    [actions, state.project.bones, state.selection]
  )

  const confirmBoneDelete = useCallback(
    (mode: BoneDeletionMode): void => {
      if (!pendingDeleteBone || pendingDeleteBone.parentId === null) {
        setPendingDeleteBoneId(null)
        return
      }
      actions.deleteBone(pendingDeleteBone.id, mode)
      setPendingDeleteBoneId(null)
      setNotice(
        mode === 'branch' && pendingDeleteDescendantCount > 0
          ? `Deleted ${pendingDeleteBone.name} and its child branch`
          : mode === 'reparent' && pendingDeleteChildCount > 0
            ? `Deleted ${pendingDeleteBone.name} and reparented its children`
            : `Deleted ${pendingDeleteBone.name}`
      )
    },
    [actions, pendingDeleteBone, pendingDeleteChildCount, pendingDeleteDescendantCount]
  )

  const requestBoneRename = useCallback(
    (boneId: string): void => {
      const bone = state.project.bones.find((candidate) => candidate.id === boneId)
      if (!bone) return
      if (state.selection?.kind !== 'bone' || state.selection.id !== boneId) {
        actions.select({ kind: 'bone', id: boneId })
      }
      setRenameBoneError(null)
      setPendingRenameBoneId(boneId)
    },
    [actions, state.project.bones, state.selection]
  )

  const confirmBoneRename = useCallback(
    (value: string): void => {
      if (!pendingRenameBone) return
      const error = boneNameValidationError(state.project.bones, pendingRenameBone.id, value)
      if (error) {
        setRenameBoneError(error)
        return
      }

      const name = normalizeBoneName(value)
      if (name !== pendingRenameBone.name) {
        actions.renameBone(pendingRenameBone.id, name)
        setNotice(`Renamed ${pendingRenameBone.name} to ${name}`)
      }
      setRenameBoneError(null)
      setPendingRenameBoneId(null)
    },
    [actions, pendingRenameBone, state.project.bones]
  )

  const requestAnimationCreate = useCallback((): void => {
    setAnimationNameError(null)
    setAnimationNameDialog({ mode: 'create' })
  }, [])

  const requestAnimationRename = useCallback(
    (animationId: string): void => {
      if (!state.project.animations.some((animation) => animation.id === animationId)) return
      setAnimationNameError(null)
      setAnimationNameDialog({ mode: 'rename', animationId })
    },
    [state.project.animations]
  )

  const confirmAnimationName = useCallback(
    (value: string): void => {
      if (!animationNameDialog) return
      const animationId =
        animationNameDialog.mode === 'rename' ? animationNameDialog.animationId : null
      const error = animationNameValidationError(state.project.animations, animationId, value)
      if (error) {
        setAnimationNameError(error)
        return
      }

      const name = normalizeAnimationName(value)
      if (animationNameDialog.mode === 'create') {
        actions.createAnimation(name)
        setNotice(`Created animation ${name}`)
      } else if (pendingRenameAnimation && pendingRenameAnimation.name !== name) {
        actions.renameAnimation(pendingRenameAnimation.id, name)
        setNotice(`Renamed ${pendingRenameAnimation.name} to ${name}`)
      }
      setAnimationNameError(null)
      setAnimationNameDialog(null)
    },
    [actions, animationNameDialog, pendingRenameAnimation, state.project.animations]
  )

  const requestAnimationDelete = useCallback(
    (animationId: string): void => {
      if (!state.project.animations.some((animation) => animation.id === animationId)) return
      if (state.project.animations.length <= 1) {
        setNotice('A project must contain at least one animation.')
        return
      }
      setPendingDeleteAnimationId(animationId)
    },
    [state.project.animations]
  )

  const confirmAnimationDelete = useCallback((): void => {
    if (!pendingDeleteAnimation) {
      setPendingDeleteAnimationId(null)
      return
    }
    actions.deleteAnimation(pendingDeleteAnimation.id)
    setPendingDeleteAnimationId(null)
    setNotice(`Deleted animation ${pendingDeleteAnimation.name}`)
  }, [actions, pendingDeleteAnimation])

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
    if (!selectedBone) {
      setNotice('Select a bone before adding a key')
      return
    }
    const properties: Array<keyof Transform> =
      state.tool === 'translate'
        ? ['x', 'y']
        : state.tool === 'scale'
          ? ['scaleX', 'scaleY']
          : state.tool === 'shear'
            ? ['shearX', 'shearY']
            : ['rotation']
    properties.forEach((property) => {
      actions.upsertKeyframe(
        `track-${selectedId}-${property}`,
        selectedId,
        property,
        state.frame,
        displayedTransform[property] ?? 0,
        'bezier'
      )
    })
    setNotice(
      `${state.tool === 'select' ? 'Transform' : state.tool} key added at frame ${state.frame}`
    )
  }, [
    actions,
    selectedArtworkLayer,
    selectedId,
    state.frame,
    state.keyframes,
    state.tool,
    displayedTransform,
    selectedBone
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

  const handleOpenProject = useCallback(async (): Promise<void> => {
    if (outputBusy) return
    setOutputBusy('Opening project')
    try {
      const result = await window.api.openProject()
      if (result.status === 'cancelled') return
      if (result.status === 'error') {
        setNotice(result.message)
        return
      }

      const loadedState = deserializeProject(result.contents)
      const acceptance = await window.api.acceptOpenProject(loadedState.project.id)
      if (acceptance.status === 'error') {
        setNotice(acceptance.message)
        return
      }
      actions.loadProject(loadedState)
      setAudioEnabled(true)
      setPendingDeleteBoneId(null)
      setPendingRenameBoneId(null)
      setRenameBoneError(null)
      setAnimationNameDialog(null)
      setAnimationNameError(null)
      setPendingDeleteAnimationId(null)
      setNotice(`Opened ${loadedState.project.name} from ${result.filePath}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The project could not be opened.')
    } finally {
      setOutputBusy(null)
    }
  }, [actions, outputBusy])

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
    onOpenProject: () => void handleOpenProject(),
    onSave: () => void handleSaveProject(),
    onDeleteSelection: () => requestBoneDelete(),
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
    setPendingDeleteBoneId(null)
    setPendingRenameBoneId(null)
    setRenameBoneError(null)
    setAnimationNameDialog(null)
    setAnimationNameError(null)
    setPendingDeleteAnimationId(null)
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
        onOpenProject={() => void handleOpenProject()}
        onImportArtwork={() => setArtworkImportOpen(true)}
        onImportAudio={() => setAudioImportOpen(true)}
        onSaveProject={() => void handleSaveProject()}
        onExportData={() => void handleExportData()}
        onExportImages={() => void handleExportImages()}
        onExportVideo={() => void handleExportVideo()}
        onFeatureNotImplemented={showFeatureNotImplemented}
        onInsertKey={insertKey}
        onDeleteBone={() => requestBoneDelete()}
        canDeleteBone={Boolean(selectedBone && selectedBone.parentId !== null)}
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
              projectName={state.project.name}
              selectedIds={selectedIds}
              onSelect={(id) => actions.select(selectionFromId(id))}
              onDeleteBone={requestBoneDelete}
              onRenameBone={requestBoneRename}
              animations={state.project.animations}
              activeAnimation={state.activeAnimation}
              onAnimationCreate={requestAnimationCreate}
              onAnimationChange={actions.setActiveAnimation}
              onAnimationRename={requestAnimationRename}
              onAnimationDelete={requestAnimationDelete}
              artwork={state.project.artwork}
              audioTracks={state.project.audioTracks}
              bones={state.project.bones}
              slots={state.project.slots}
              attachments={state.project.attachments}
              constraints={state.project.constraints}
              skins={state.project.skins}
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
                  zoom={state.zoom * 100}
                  transform={{
                    ...displayedTransform,
                    scaleX: displayedTransform.scaleX * 100,
                    scaleY: displayedTransform.scaleY * 100,
                    opacity: displayedTransform.opacity * 100
                  }}
                  projectName={state.project.name}
                  canvas={state.project.canvas}
                  artwork={state.project.artwork}
                  bones={displayedBones}
                  geometrySelection={state.geometrySelection}
                  weightBrush={state.weightBrush}
                  deformations={deformations}
                  keyedDeformations={keyedDeformations}
                  selectedId={selectedId}
                  selectedIds={selectedIds}
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
                  onGeometrySelectionChange={actions.setGeometrySelection}
                  onMeshVerticesChange={actions.moveArtworkMeshVertices}
                  onDeformationChange={actions.setArtworkDeformation}
                  onClippingVerticesChange={actions.moveArtworkClippingVertices}
                  onWeightPaint={actions.paintArtworkWeights}
                  onAddClipVertex={actions.addClipVertex}
                  onRemoveGeometryVertices={actions.removeGeometryVertices}
                  onCreateBone={actions.createBone}
                  onSvgElement={(element) => {
                    viewportSvgRef.current = element
                  }}
                  onSelect={(id) => actions.select(selectionFromId(id))}
                  onSelectMany={(ids) => actions.selectMany(ids.map(selectionFromId))}
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
              transform={displayedTransform}
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
              constraints={state.project.constraints}
              geometrySelection={state.geometrySelection}
              weightBrush={state.weightBrush}
              selectedConstraint={selectedConstraint}
              selectedAudioTrack={selectedAudioTrack}
              onTransformChange={actions.updateTransform}
              onToggle={toggleView}
              onResetTransform={actions.resetTransform}
              onArtworkLayerVisibilityChange={actions.toggleArtworkLayer}
              onArtworkLayerBoneChange={actions.bindArtworkLayer}
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
      {pendingDeleteBone ? (
        <DeleteBoneDialog
          open
          boneName={pendingDeleteBone.name}
          childCount={pendingDeleteChildCount}
          descendantCount={pendingDeleteDescendantCount}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteBoneId(null)
          }}
          onDelete={confirmBoneDelete}
        />
      ) : null}
      {pendingRenameBone ? (
        <RenameBoneDialog
          open
          boneName={pendingRenameBone.name}
          error={renameBoneError}
          onOpenChange={(open) => {
            if (open) return
            setPendingRenameBoneId(null)
            setRenameBoneError(null)
          }}
          onRename={confirmBoneRename}
        />
      ) : null}
      {animationNameDialog ? (
        <AnimationNameDialog
          open
          mode={animationNameDialog.mode}
          initialName={
            animationNameDialog.mode === 'create'
              ? nextAnimationName(state.project.animations)
              : (pendingRenameAnimation?.name ?? '')
          }
          error={animationNameError}
          onOpenChange={(open) => {
            if (open) return
            setAnimationNameDialog(null)
            setAnimationNameError(null)
          }}
          onSubmit={confirmAnimationName}
        />
      ) : null}
      {pendingDeleteAnimation ? (
        <DeleteAnimationDialog
          open
          animationName={pendingDeleteAnimation.name}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteAnimationId(null)
          }}
          onDelete={confirmAnimationDelete}
        />
      ) : null}
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
