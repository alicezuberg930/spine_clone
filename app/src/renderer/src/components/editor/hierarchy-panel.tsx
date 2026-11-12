import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Aperture,
  AudioWaveform,
  Bone,
  Box,
  ChevronDown,
  ChevronRight,
  CircleDot,
  CircleGauge,
  Eye,
  EyeOff,
  Film,
  Folder,
  Image,
  Layers3,
  Link2,
  Lock,
  MoreHorizontal,
  Plus,
  Search,
  Shirt,
  Spline,
  SquareDashed,
  Trash2,
  Upload,
  WandSparkles
} from 'lucide-react'

import { PanelHeader } from '@/components/editor/panel-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type {
  Animation,
  ArtworkDocument,
  ArtworkLayer,
  Attachment,
  AudioTrack,
  Bone as BoneType,
  Constraint,
  Skin,
  Slot
} from '@/@types'
import {
  createConstraintTreeNodes,
  filterHierarchyRows,
  hierarchyRowHasChildren,
  visibleHierarchyRows
} from '@/lib/hierarchy-model'
import { cn } from '@/lib/utils'

interface HierarchyPanelProps {
  projectName: string
  selectedIds: string[]
  onSelect: (id: string) => void
  onDeleteBone: (id: string) => void
  onRenameBone: (id: string) => void
  animations: Animation[]
  activeAnimation: string
  onAnimationCreate: () => void
  onAnimationChange: (id: string) => void
  onAnimationRename: (id: string) => void
  onAnimationDelete: (id: string) => void
  artwork: ArtworkDocument | null
  audioTracks: AudioTrack[]
  bones: BoneType[]
  slots: Slot[]
  attachments: Attachment[]
  constraints: Constraint[]
  skins: Skin[]
  onArtworkLayerSelect: (id: string) => void
  onArtworkLayerVisibilityChange: (id: string) => void
  onImportArtwork: () => void
  activeSkin: string
  onSkinChange: (skin: string) => void
  onFeatureNotImplemented: (feature: string) => void
}

type TreeNode = {
  id: string
  name: string
  type: 'root' | 'bone' | 'slot' | 'mesh' | 'constraint' | 'bounds' | 'audio' | 'animation'
  depth: number
  muted?: boolean
}

type ArtworkTreeRow =
  | {
    id: string
    kind: 'group'
    name: string
    depth: number
  }
  | {
    id: string
    kind: 'layer'
    name: string
    depth: number
    layer: ArtworkLayer
  }

const iconByType = {
  root: Aperture,
  bone: Bone,
  slot: Layers3,
  mesh: Spline,
  constraint: Link2,
  bounds: SquareDashed,
  audio: AudioWaveform,
  animation: Film
}

function createArtworkTreeRows(artwork: ArtworkDocument, query: string): ArtworkTreeRow[] {
  const normalizedQuery = query.trim().toLowerCase()
  const layers = normalizedQuery
    ? artwork.layers.filter((layer) =>
      [layer.name, layer.sourceFileName, ...layer.groupPath].some((value) =>
        value.toLowerCase().includes(normalizedQuery)
      )
    )
    : artwork.layers
  const rows: ArtworkTreeRow[] = []
  const addedGroups = new Set<string>()

  layers.forEach((layer) => {
    layer.groupPath.forEach((groupName, index) => {
      const path = layer.groupPath.slice(0, index + 1)
      const id = `artwork-group-${path.join('\u001f')}`
      if (addedGroups.has(id)) return
      addedGroups.add(id)
      rows.push({ id, kind: 'group', name: groupName, depth: index + 1 })
    })

    rows.push({
      id: layer.id,
      kind: 'layer',
      name: layer.name,
      depth: layer.groupPath.length + 1,
      layer
    })
  })

  return rows
}

function createBoneTreeNodes(bones: readonly BoneType[], rootDepth = 1): TreeNode[] {
  const knownIds = new Set(bones.map((bone) => bone.id))
  const children = new Map<string | null, BoneType[]>()

  bones.forEach((bone) => {
    const parentId = bone.parentId && knownIds.has(bone.parentId) ? bone.parentId : null
    const siblings = children.get(parentId) ?? []
    siblings.push(bone)
    children.set(parentId, siblings)
  })

  const rows: TreeNode[] = []
  const visited = new Set<string>()
  const visit = (bone: BoneType, depth: number): void => {
    if (visited.has(bone.id)) return
    visited.add(bone.id)
    rows.push({
      id: bone.id,
      name: bone.name,
      type: bone.parentId === null ? 'root' : 'bone',
      depth
    })
    children.get(bone.id)?.forEach((child) => visit(child, depth + 1))
  }

  children.get(null)?.forEach((bone) => visit(bone, rootDepth))
  bones.forEach((bone) => visit(bone, rootDepth))
  return rows
}

function attachmentTreeType(attachment: Attachment): TreeNode['type'] {
  return attachment.type === 'bounding-box' ? 'bounds' : 'mesh'
}

function createProjectTreeNodes(
  bones: readonly BoneType[],
  slots: readonly Slot[],
  attachments: readonly Attachment[],
  constraints: readonly Constraint[]
): TreeNode[] {
  const rows = createBoneTreeNodes(bones, 0)
  const attachmentsBySlot = new Map<string, Attachment[]>()

  attachments.forEach((attachment) => {
    const slotAttachments = attachmentsBySlot.get(attachment.slotId) ?? []
    slotAttachments.push(attachment)
    attachmentsBySlot.set(attachment.slotId, slotAttachments)
  })

  if (slots.length > 0) {
    rows.push({ id: 'project-slots', name: 'Slots', type: 'slot', depth: 0 })
    const orderedSlots = [...slots].sort((left, right) => left.drawOrder - right.drawOrder)
    orderedSlots.forEach((slot) => {
      rows.push({ id: slot.id, name: slot.name, type: 'slot', depth: 1 })
      const slotAttachments = attachmentsBySlot.get(slot.id) ?? []
      slotAttachments.forEach((attachment) => {
        rows.push({
          id: attachment.id,
          name: attachment.name,
          type: attachmentTreeType(attachment),
          depth: 2
        })
      })
    })
  }

  const knownSlotIds = new Set(slots.map((slot) => slot.id))
  const orphanedAttachments = attachments.filter(
    (attachment) => !knownSlotIds.has(attachment.slotId)
  )
  if (orphanedAttachments.length > 0) {
    rows.push({ id: 'project-attachments', name: 'Attachments', type: 'mesh', depth: 0 })
    orphanedAttachments.forEach((attachment) => {
      rows.push({
        id: attachment.id,
        name: attachment.name,
        type: attachmentTreeType(attachment),
        depth: 1
      })
    })
  }

  if (constraints.length > 0) {
    rows.push({ id: 'project-constraints', name: 'Constraints', type: 'constraint', depth: 0 })
    rows.push(
      ...createConstraintTreeNodes(constraints).map((constraint) => ({
        ...constraint,
        depth: 1
      }))
    )
  }

  return rows
}

function TreeRow({
  node,
  selected,
  hasChildren,
  expanded,
  toggleDisabled = false,
  onToggle,
  onSelect,
  onRename,
  onDelete
}: {
  node: TreeNode
  selected: boolean
  hasChildren: boolean
  expanded: boolean
  toggleDisabled?: boolean
  onToggle: () => void
  onSelect: () => void
  onRename?: () => void
  onDelete?: () => void
}): React.JSX.Element {
  const Icon = iconByType[node.type]
  return (
    <div
      role="treeitem"
      aria-level={node.depth + 1}
      aria-selected={selected}
      aria-expanded={hasChildren ? expanded : undefined}
      className={cn(
        'group flex h-7 w-full items-center rounded-[5px] pr-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground',
        selected && 'bg-primary/12 text-primary ring-1 ring-inset ring-primary/20'
      )}
      style={{ paddingLeft: 6 + node.depth * 12 }}
    >
      {hasChildren ? (
        <button
          type="button"
          className="grid size-5 shrink-0 place-items-center rounded-sm hover:bg-accent"
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`}
          aria-expanded={expanded}
          disabled={toggleDisabled}
          onClick={onToggle}
        >
          {expanded ? (
            <ChevronDown className="size-3 opacity-70" />
          ) : (
            <ChevronRight className="size-3 opacity-65" />
          )}
        </button>
      ) : (
        <span className="w-5 shrink-0" />
      )}
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        onClick={onSelect}
        onDoubleClick={
          onRename
            ? (event) => {
              event.preventDefault()
              event.stopPropagation()
              onRename()
            }
            : hasChildren && !toggleDisabled
              ? onToggle
              : undefined
        }
        onKeyDown={(event) => {
          if (!hasChildren || toggleDisabled) return
          if (event.key === 'ArrowRight' && !expanded) {
            event.preventDefault()
            onToggle()
          } else if (event.key === 'ArrowLeft' && expanded) {
            event.preventDefault()
            onToggle()
          }
        }}
      >
        <Icon className={cn('size-3.5 shrink-0', selected ? 'text-primary' : 'text-[#83a2af]')} />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        <span className="hidden items-center gap-1 group-hover:flex">
          {node.muted ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
          <Lock className="size-3 opacity-60" />
        </span>
      </button>
      {onDelete ? (
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-6 shrink-0 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`Delete ${node.type} ${node.name}`}
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 />
        </Button>
      ) : null}
    </div>
  )
}

export function HierarchyPanel({
  projectName,
  selectedIds,
  onSelect,
  onDeleteBone,
  onRenameBone,
  animations,
  activeAnimation,
  onAnimationCreate,
  onAnimationChange,
  onAnimationRename,
  onAnimationDelete,
  artwork,
  audioTracks,
  bones,
  slots,
  attachments,
  constraints,
  skins,
  onArtworkLayerSelect,
  onArtworkLayerVisibilityChange,
  onImportArtwork,
  activeSkin,
  onSkinChange,
  onFeatureNotImplemented
}: HierarchyPanelProps): React.JSX.Element {
  const [filter, setFilter] = useState('')
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const normalizedFilter = filter.trim().toLowerCase()
  const highlightedIds = useMemo(() => new Set(selectedIds), [selectedIds])
  const boneIds = useMemo(() => new Set(bones.map((bone) => bone.id)), [bones])
  const artworkRootId = artwork ? `artwork-root-${artwork.id}` : 'artwork-root'
  const importedRigRootId = artwork ? `rig-bones-${artwork.id}` : 'rig-bones'
  const animationRootId = 'project-animations'
  const artworkRows = useMemo(() => (artwork ? createArtworkTreeRows(artwork, '') : []), [artwork])
  const visibleArtworkRows = useMemo(() => {
    if (!artwork) return []
    if (normalizedFilter) return createArtworkTreeRows(artwork, normalizedFilter)
    if (collapsedIds.has(artworkRootId)) return []
    return visibleHierarchyRows(artworkRows, collapsedIds)
  }, [artwork, artworkRootId, artworkRows, collapsedIds, normalizedFilter])
  const artworkParentIds = useMemo(
    () =>
      new Set(
        artworkRows
          .filter((_, index) => hierarchyRowHasChildren(artworkRows, index))
          .map((row) => row.id)
      ),
    [artworkRows]
  )
  const projectNodes = useMemo(
    () => createProjectTreeNodes(bones, slots, attachments, constraints),
    [attachments, bones, constraints, slots]
  )
  const visibleProjectNodes = useMemo(
    () =>
      normalizedFilter
        ? filterHierarchyRows(projectNodes, (node) =>
          node.name.toLowerCase().includes(normalizedFilter)
        )
        : visibleHierarchyRows(projectNodes, collapsedIds),
    [collapsedIds, normalizedFilter, projectNodes]
  )
  const projectParentIds = useMemo(
    () =>
      new Set(
        projectNodes
          .filter((_, index) => hierarchyRowHasChildren(projectNodes, index))
          .map((node) => node.id)
      ),
    [projectNodes]
  )
  const importedBoneNodes = useMemo(() => createBoneTreeNodes(bones), [bones])
  const visibleImportedBoneNodes = useMemo(() => {
    if (!artwork) return []
    if (normalizedFilter) {
      return filterHierarchyRows(importedBoneNodes, (node) =>
        node.name.toLowerCase().includes(normalizedFilter)
      )
    }
    if (collapsedIds.has(importedRigRootId)) return []
    return visibleHierarchyRows(importedBoneNodes, collapsedIds)
  }, [artwork, collapsedIds, importedBoneNodes, importedRigRootId, normalizedFilter])
  const importedBoneParentIds = useMemo(
    () =>
      new Set(
        importedBoneNodes
          .filter((_, index) => hierarchyRowHasChildren(importedBoneNodes, index))
          .map((node) => node.id)
      ),
    [importedBoneNodes]
  )
  const knownBoneIdsRef = useRef(new Set(bones.map((bone) => bone.id)))
  const visibleAnimations = useMemo(
    () =>
      normalizedFilter
        ? animations.filter((animation) =>
          animation.name.toLocaleLowerCase().includes(normalizedFilter)
        )
        : animations,
    [animations, normalizedFilter]
  )

  useEffect(() => {
    const previousIds = knownBoneIdsRef.current
    const currentIds = new Set(bones.map((bone) => bone.id))
    knownBoneIdsRef.current = currentIds
    const createdBoneId = [...selectedIds]
      .reverse()
      .find((id) => currentIds.has(id) && !previousIds.has(id))
    if (!createdBoneId) return

    const byId = new Map(bones.map((bone) => [bone.id, bone]))
    const ancestors = new Set<string>([importedRigRootId])
    let current = byId.get(createdBoneId)
    while (current?.parentId) {
      if (ancestors.has(current.parentId)) break
      ancestors.add(current.parentId)
      current = byId.get(current.parentId)
    }
    setCollapsedIds((collapsed) => {
      if (![...ancestors].some((id) => collapsed.has(id))) return collapsed
      const next = new Set(collapsed)
      ancestors.forEach((id) => next.delete(id))
      return next
    })
  }, [bones, importedRigRootId, selectedIds])

  const toggleBranch = (id: string): void => {
    setCollapsedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="panel-sheen flex h-full min-h-0 flex-col">
      <PanelHeader
        title="Project"
        eyebrow={artwork ? (artwork.layers[0]?.sourceFileName ?? artwork.name) : projectName}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Add item"
              onClick={
                artwork ? onImportArtwork : () => onFeatureNotImplemented('Add project item')
              }
            >
              <Plus />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Project options"
              onClick={() => onFeatureNotImplemented('Project options')}
            >
              <MoreHorizontal />
            </Button>
          </>
        }
      />
      <Tabs key={artwork?.id ?? projectName} defaultValue="tree" className="min-h-0 flex-1 gap-0">
        <TabsList
          variant="line"
          className="h-9 w-full shrink-0 justify-start gap-2 border-b border-border/70 px-2"
        >
          <TabsTrigger value="tree" className="text-[11px]">
            Tree
          </TabsTrigger>
          <TabsTrigger value="skins" className="text-[11px]">
            Skins
          </TabsTrigger>
          <TabsTrigger value="assets" className="text-[11px]">
            Assets
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tree" className="flex min-h-0 flex-col overflow-hidden">
          <div className="relative px-2 py-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Filter hierarchy"
              placeholder={artwork ? 'Filter layers, bones, animations' : 'Filter hierarchy'}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="h-7 border-border/70 bg-background/50 pl-8 text-[11px]"
            />
          </div>
          <ScrollArea className="min-h-0 flex-1 px-1.5 pb-2">
            {artwork ? (
              <div role="tree" aria-label="Imported artwork hierarchy" className="space-y-0.5">
                <div
                  role="treeitem"
                  aria-level={1}
                  aria-expanded={normalizedFilter ? true : !collapsedIds.has(artworkRootId)}
                  className="flex h-8 items-center rounded-md bg-primary/8 px-1.5 text-sm font-medium text-primary ring-1 ring-inset ring-primary/15 gap-1"
                >
                  <button
                    type="button"
                    className="grid size-5 shrink-0 place-items-center rounded-sm hover:bg-primary/10"
                    aria-label={`${normalizedFilter || !collapsedIds.has(artworkRootId) ? 'Collapse' : 'Expand'} ${artwork.name}`}
                    aria-expanded={normalizedFilter ? true : !collapsedIds.has(artworkRootId)}
                    disabled={Boolean(normalizedFilter)}
                    onClick={() => toggleBranch(artworkRootId)}
                  >
                    {normalizedFilter || !collapsedIds.has(artworkRootId) ? (
                      <ChevronDown className="size-3 opacity-70" />
                    ) : (
                      <ChevronRight className="size-3 opacity-65" />
                    )}
                  </button>
                  <Aperture className="size-3.5 shrink-0" />
                  <span className="ml-1.5 min-w-0 flex-1 truncate">{artwork.name}</span>
                </div>

                {visibleArtworkRows.map((row) =>
                  row.kind === 'group' ? (
                    <div
                      key={row.id}
                      role="treeitem"
                      aria-level={row.depth + 1}
                      aria-expanded={normalizedFilter ? true : !collapsedIds.has(row.id)}
                      className="flex h-7 items-center rounded-[5px] pr-1 text-[11px] text-muted-foreground hover:bg-accent/70 hover:text-foreground"
                      style={{ paddingLeft: 6 + row.depth * 12 }}
                    >
                      {artworkParentIds.has(row.id) ? (
                        <button
                          type="button"
                          className="grid size-5 shrink-0 place-items-center rounded-sm hover:bg-accent"
                          aria-label={`${normalizedFilter || !collapsedIds.has(row.id) ? 'Collapse' : 'Expand'} ${row.name}`}
                          aria-expanded={normalizedFilter ? true : !collapsedIds.has(row.id)}
                          disabled={Boolean(normalizedFilter)}
                          onClick={() => toggleBranch(row.id)}
                        >
                          {normalizedFilter || !collapsedIds.has(row.id) ? (
                            <ChevronDown className="size-3 opacity-70" />
                          ) : (
                            <ChevronRight className="size-3 opacity-65" />
                          )}
                        </button>
                      ) : (
                        <span className="w-5 shrink-0" />
                      )}
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        disabled={Boolean(normalizedFilter)}
                        onClick={() => toggleBranch(row.id)}
                      >
                        <Folder className="size-3.5 shrink-0 text-[#83a2af]" />
                        <span className="min-w-0 flex-1 truncate">{row.name}</span>
                      </button>
                    </div>
                  ) : (
                    <div
                      key={row.id}
                      role="treeitem"
                      aria-level={row.depth + 1}
                      aria-selected={highlightedIds.has(row.id)}
                      className={cn(
                        'group flex h-7 min-w-0 items-center rounded-[5px] border border-transparent pr-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground',
                        highlightedIds.has(row.id) && 'border-primary/20 bg-primary/12 text-primary'
                      )}
                      style={{ paddingLeft: 6 + row.depth * 12 }}
                    >
                      <span className="w-3 shrink-0" />
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        onClick={() => onArtworkLayerSelect(row.id)}
                      >
                        <Image className="size-3.5 shrink-0 text-[#83a2af]" />
                        <span className="min-w-0 flex-1 truncate">{row.name}</span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="size-6 shrink-0"
                        aria-label={`${row.layer.visible ? 'Hide' : 'Show'} ${row.name}`}
                        onClick={() => onArtworkLayerVisibilityChange(row.id)}
                      >
                        {row.layer.visible ? <Eye /> : <EyeOff />}
                      </Button>
                    </div>
                  )
                )}

                {normalizedFilter && visibleArtworkRows.length === 0 ? (
                  <p className="px-3 py-8 text-center text-[10px] text-muted-foreground">
                    No imported layers match “{filter}”.
                  </p>
                ) : null}
              </div>
            ) : (
              <div role="tree" aria-label="Rig hierarchy" className="space-y-0.5">
                {visibleProjectNodes.map((node) => (
                  <TreeRow
                    key={node.id}
                    node={node}
                    selected={highlightedIds.has(node.id)}
                    hasChildren={projectParentIds.has(node.id)}
                    expanded={normalizedFilter ? true : !collapsedIds.has(node.id)}
                    toggleDisabled={Boolean(normalizedFilter)}
                    onToggle={() => toggleBranch(node.id)}
                    onSelect={() => onSelect(node.id)}
                    onRename={boneIds.has(node.id) ? () => onRenameBone(node.id) : undefined}
                    onDelete={node.type === 'bone' ? () => onDeleteBone(node.id) : undefined}
                  />
                ))}
                {projectNodes.length === 0 && audioTracks.length === 0 ? (
                  <div className="grid min-h-56 place-items-center px-5 py-8 text-center">
                    <div className="flex flex-col gap-2 items-center">
                      <p className="text-xs font-medium">Empty project</p>
                      <p className="mx-auto mt-1 max-w-48 text-[10px] leading-4 text-muted-foreground">
                        Import artwork or use the Create Bone tool to begin a rig.
                      </p>
                      <Button size="sm" className="mt-4" onClick={onImportArtwork}>
                        <Upload /> Import artwork
                      </Button>
                    </div>
                  </div>
                ) : normalizedFilter && visibleProjectNodes.length === 0 ? (
                  <p className="px-3 py-8 text-center text-[10px] text-muted-foreground">
                    No project items match “{filter}”.
                  </p>
                ) : null}
              </div>
            )}
            {audioTracks.map((track) => (
              <button
                key={track.id}
                type="button"
                onClick={() => onSelect(track.id)}
                className={cn(
                  'mt-1 flex h-8 w-full items-center gap-2 rounded-md px-3 text-left text-[11px] text-muted-foreground hover:bg-accent/70 hover:text-foreground',
                  highlightedIds.has(track.id) &&
                  'bg-primary/12 text-primary ring-1 ring-inset ring-primary/20'
                )}
              >
                <AudioWaveform className="size-3.5" />
                <span className="min-w-0 flex-1 truncate">{track.name}</span>
                <span className="text-[9px]">{track.durationSeconds.toFixed(1)}s</span>
              </button>
            ))}
            {artwork && (
              <div
                role="tree"
                aria-label="Imported rig bones"
              >
                <div
                  role="treeitem"
                  aria-level={1}
                  aria-expanded={normalizedFilter ? true : !collapsedIds.has(importedRigRootId)}
                  className="flex h-8 items-center rounded-md bg-primary/8 px-1.5 text-sm font-medium text-primary ring-1 ring-inset ring-primary/15 gap-1"
                >
                  <button
                    type="button"
                    className="grid size-5 shrink-0 place-items-center rounded-sm hover:bg-accent"
                    aria-label={`${normalizedFilter || !collapsedIds.has(importedRigRootId) ? 'Collapse' : 'Expand'} rig bones`}
                    aria-expanded={normalizedFilter ? true : !collapsedIds.has(importedRigRootId)}
                    disabled={Boolean(normalizedFilter)}
                    onClick={() => toggleBranch(importedRigRootId)}
                  >
                    {normalizedFilter || !collapsedIds.has(importedRigRootId) ? (
                      <ChevronDown className="size-3 opacity-70" />
                    ) : (
                      <ChevronRight className="size-3 opacity-65" />
                    )}
                  </button>
                  <Bone className="ml-1 size-3.5" />
                  <span className="ml-1.5">Rig bones</span>
                </div>
                {visibleImportedBoneNodes.map((node) => (
                  <TreeRow
                    key={node.id}
                    node={node}
                    selected={highlightedIds.has(node.id)}
                    hasChildren={importedBoneParentIds.has(node.id)}
                    expanded={normalizedFilter ? true : !collapsedIds.has(node.id)}
                    toggleDisabled={Boolean(normalizedFilter)}
                    onToggle={() => toggleBranch(node.id)}
                    onSelect={() => onSelect(node.id)}
                    onRename={boneIds.has(node.id) ? () => onRenameBone(node.id) : undefined}
                    onDelete={node.type === 'bone' ? () => onDeleteBone(node.id) : undefined}
                  />
                ))}
                {bones.length === 0 ? (
                  <p className="px-7 py-3 text-[10px] text-muted-foreground">
                    No bones yet. Use the Create Bone tool in the viewport.
                  </p>
                ) : normalizedFilter && visibleImportedBoneNodes.length === 0 ? (
                  <p className="px-7 py-3 text-[10px] text-muted-foreground">
                    No bones match “{filter}”.
                  </p>
                ) : null}
              </div>
            )}
            {artwork && (
              <div
                role="tree"
                aria-label="Animations"
              >
                <div
                  role="treeitem"
                  aria-level={1}
                  aria-expanded={normalizedFilter ? true : !collapsedIds.has(animationRootId)}
                  className="flex h-8 items-center rounded-md bg-primary/8 px-1.5 text-sm font-medium text-primary ring-1 ring-inset ring-primary/15 gap-1"
                >
                  <button
                    type="button"
                    className="grid size-5 shrink-0 place-items-center rounded-sm hover:bg-primary/10 ml-auto"
                    aria-label={`${normalizedFilter || !collapsedIds.has(animationRootId) ? 'Collapse' : 'Expand'} animations`}
                    aria-expanded={normalizedFilter ? true : !collapsedIds.has(animationRootId)}
                    disabled={Boolean(normalizedFilter)}
                    onClick={() => toggleBranch(animationRootId)}
                  >
                    {normalizedFilter || !collapsedIds.has(animationRootId) ? (
                      <ChevronDown className="size-3 opacity-70" />
                    ) : (
                      <ChevronRight className="size-3 opacity-65" />
                    )}
                  </button>
                  <Film className="size-3.5 shrink-0" />
                  <span className="ml-1.5">Animations</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="ml-auto size-6 opacity-70 hover:opacity-100"
                    aria-label="Create animation"
                    onClick={onAnimationCreate}
                  >
                    <Plus />
                  </Button>
                </div>
                {(normalizedFilter || !collapsedIds.has(animationRootId)) &&
                  visibleAnimations.map((animation) => (
                    <TreeRow
                      key={animation.id}
                      node={{
                        id: animation.id,
                        name: animation.name,
                        type: 'animation',
                        depth: 1
                      }}
                      selected={animation.id === activeAnimation}
                      hasChildren={false}
                      expanded={false}
                      onToggle={() => undefined}
                      onSelect={() => onAnimationChange(animation.id)}
                      onRename={() => onAnimationRename(animation.id)}
                      onDelete={
                        animations.length > 1
                          ? () => onAnimationDelete(animation.id)
                          : undefined
                      }
                    />
                  ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="skins" className="min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-2 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">Character variants</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {skins.length} {skins.length === 1 ? 'skin' : 'skins'}
                  </p>
                </div>
                <WandSparkles className="size-4 text-primary" />
              </div>
              {skins.length > 0 ? (
                skins.map((skin) => (
                  <button
                    key={skin.id}
                    type="button"
                    onClick={() => onSkinChange(skin.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border border-border/70 bg-background/25 p-2.5 text-left transition-colors hover:border-primary/30 hover:bg-primary/5',
                      activeSkin === skin.id &&
                      'border-primary/40 bg-primary/8 ring-1 ring-primary/15'
                    )}
                  >
                    <div
                      className="grid size-9 place-items-center rounded-md border border-white/10"
                      style={{
                        background: `linear-gradient(135deg, ${skin.accent}, #152329)`
                      }}
                    >
                      <Shirt className="size-4 text-white/90" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{skin.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {skin.attachmentIds.length}{' '}
                        {skin.attachmentIds.length === 1 ? 'attachment' : 'attachments'}
                      </p>
                    </div>
                    {activeSkin === skin.id ? <CircleDot className="size-4 text-primary" /> : null}
                  </button>
                ))
              ) : (
                <div className="grid min-h-52 place-items-center px-4 text-center">
                  <div>
                    <div className="mx-auto mb-3 grid size-11 place-items-center rounded-xl border border-border/70 bg-muted/35 text-muted-foreground">
                      <Shirt className="size-5" />
                    </div>
                    <p className="text-xs font-medium">No skins</p>
                    <p className="mx-auto mt-1 max-w-48 text-[10px] leading-4 text-muted-foreground">
                      This project does not contain any character variants.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="assets" className="min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            {artwork ? (
              <div className="p-2">
                <div className="mb-2 flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5">
                  <Folder className="size-3.5 shrink-0 text-[#83a2af]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium">{artwork.name}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {artwork.width} × {artwork.height} · {artwork.layers.length} layers
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Replace imported artwork"
                    onClick={onImportArtwork}
                  >
                    <Upload />
                  </Button>
                </div>

                <div className="space-y-0.5">
                  {artwork.layers.map((layer) => (
                    <div
                      key={layer.id}
                      className={cn(
                        'group flex min-w-0 items-center rounded-md border border-transparent transition-colors hover:bg-accent/60',
                        highlightedIds.has(layer.id) &&
                        'border-primary/25 bg-primary/10 text-primary'
                      )}
                      style={{ paddingLeft: Math.min(layer.groupPath.length, 5) * 10 }}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                        onClick={() => onArtworkLayerSelect(layer.id)}
                      >
                        <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded border border-border/70 bg-background/55">
                          {layer.dataUrl ? (
                            <img
                              src={layer.dataUrl}
                              alt=""
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <Image className="size-3.5 text-[#83a2af]" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px]">{layer.name}</span>
                          <span className="block truncate text-[9px] text-muted-foreground">
                            {layer.groupPath.length > 0
                              ? layer.groupPath.join(' / ')
                              : `${layer.width} × ${layer.height}`}
                          </span>
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="mr-1 shrink-0"
                        aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
                        onClick={() => onArtworkLayerVisibilityChange(layer.id)}
                      >
                        {layer.visible ? <Eye /> : <EyeOff />}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid min-h-64 place-items-center px-5 py-10 text-center">
                <div className="flex flex-col gap-2 items-center">
                  <div className="mx-auto mb-3 grid size-11 place-items-center rounded-xl border border-border/70 bg-muted/35 text-muted-foreground">
                    <Layers3 className="size-5" />
                  </div>
                  <p className="text-xs font-medium">No artwork imported</p>
                  <p className="mx-auto mt-1 max-w-48 text-[10px] leading-4 text-muted-foreground">
                    Import a PSD or a set of image layers to display them in the viewport.
                  </p>
                  <Button size="sm" className="mt-4" onClick={onImportArtwork}>
                    <Upload /> Import artwork
                  </Button>
                </div>
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <div className="flex h-8 shrink-0 items-center gap-2 border-t border-border/70 px-3 text-[10px] text-muted-foreground">
        <CircleGauge className="size-3 text-primary" />
        {artwork ? (
          <>
            <span>{artwork.layers.length} layers</span>
            <span>·</span>
            <span>
              {artwork.width} × {artwork.height}
            </span>
          </>
        ) : (
          <>
            <span>{bones.length} bones</span>
            <span>·</span>
            <span>{slots.length} slots</span>
            <span>·</span>
            <span>{attachments.length} attachments</span>
          </>
        )}
        <Box className="ml-auto size-3" />
      </div>
    </section>
  )
}
