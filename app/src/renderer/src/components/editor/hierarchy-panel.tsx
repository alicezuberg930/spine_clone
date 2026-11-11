import { useMemo, useState } from 'react'
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
  Upload,
  WandSparkles
} from 'lucide-react'

import { PanelHeader } from '@/components/editor/panel-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type {
  ArtworkDocument,
  ArtworkLayer,
  AudioTrack,
  Bone as BoneType,
  Constraint
} from '@/@types'
import { createConstraintTreeNodes } from '@/lib/hierarchy-model'
import { cn } from '@/lib/utils'

interface HierarchyPanelProps {
  selectedId: string
  onSelect: (id: string) => void
  artwork: ArtworkDocument | null
  audioTracks: AudioTrack[]
  bones: BoneType[]
  constraints: Constraint[]
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
  type: 'root' | 'bone' | 'slot' | 'mesh' | 'constraint' | 'bounds' | 'audio'
  depth: number
  open?: boolean
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

const nodes: TreeNode[] = [
  { id: 'bone-root', name: 'Meadow runner', type: 'root', depth: 0, open: true },
  { id: 'bone-pelvis', name: 'hips', type: 'bone', depth: 1, open: true },
  { id: 'bone-torso', name: 'torso', type: 'bone', depth: 2, open: true },
  { id: 'bone-chest', name: 'chest', type: 'bone', depth: 3, open: true },
  { id: 'bone-neck', name: 'neck', type: 'bone', depth: 4 },
  { id: 'bone-head', name: 'head', type: 'mesh', depth: 5 },
  { id: 'bone-arm-l', name: 'arm · left', type: 'bone', depth: 3 },
  { id: 'bone-arm-r', name: 'arm · right', type: 'bone', depth: 3 },
  { id: 'bone-thigh-l', name: 'leg · left', type: 'bone', depth: 2 },
  { id: 'bone-thigh-r', name: 'leg · right', type: 'bone', depth: 2 },
  { id: 'slots', name: 'Slots', type: 'slot', depth: 1, open: true },
  { id: 'slot-head', name: 'face / blink', type: 'slot', depth: 2 },
  { id: 'slot-torso', name: 'jacket / moss', type: 'slot', depth: 2 },
  { id: 'attachment-cape', name: 'scarf · weighted', type: 'mesh', depth: 2 },
  { id: 'attachment-hurtbox', name: 'Bounds · body hitbox', type: 'bounds', depth: 1 },
  { id: 'audio', name: 'Audio · forest-loop.ogg', type: 'audio', depth: 1 }
]

const iconByType = {
  root: Aperture,
  bone: Bone,
  slot: Layers3,
  mesh: Spline,
  constraint: Link2,
  bounds: SquareDashed,
  audio: AudioWaveform
}

const skins = [
  { id: 'skin-ember', name: 'Ember trail', colors: ['#ff9a68', '#934b4e'] },
  { id: 'skin-night', name: 'Moon courier', colors: ['#8ea9ff', '#675a9f'] },
  { id: 'skin-rig', name: 'Rig diagnostics', colors: ['#45d6bd', '#2e756a'] }
]

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

function TreeRow({
  node,
  selected,
  onSelect
}: {
  node: TreeNode
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  const Icon = iconByType[node.type]
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex h-7 w-full items-center gap-1.5 rounded-[5px] pr-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground',
        selected && 'bg-primary/12 text-primary ring-1 ring-inset ring-primary/20'
      )}
      style={{ paddingLeft: 6 + node.depth * 12 }}
    >
      {node.open ? (
        <ChevronDown className="size-3 shrink-0 opacity-65" />
      ) : node.type === 'root' ||
        node.type === 'bone' ||
        node.type === 'slot' ||
        node.type === 'constraint' ? (
        <ChevronRight className="size-3 shrink-0 opacity-55" />
      ) : (
        <span className="w-3" />
      )}
      <Icon className={cn('size-3.5 shrink-0', selected ? 'text-primary' : 'text-[#83a2af]')} />
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      <span className="hidden items-center gap-1 group-hover:flex">
        {node.muted ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
        <Lock className="size-3 opacity-60" />
      </span>
    </button>
  )
}

export function HierarchyPanel({
  selectedId,
  onSelect,
  artwork,
  audioTracks,
  bones,
  constraints,
  onArtworkLayerSelect,
  onArtworkLayerVisibilityChange,
  onImportArtwork,
  activeSkin,
  onSkinChange,
  onFeatureNotImplemented
}: HierarchyPanelProps): React.JSX.Element {
  const [filter, setFilter] = useState('')
  const artworkRows = useMemo(
    () => (artwork ? createArtworkTreeRows(artwork, filter) : []),
    [artwork, filter]
  )
  const filteredDemoNodes = useMemo(() => {
    const query = filter.trim().toLowerCase()
    const projectNodes: TreeNode[] = [
      ...nodes.filter((node) => node.type !== 'audio' && node.id !== 'attachment-hurtbox'),
      { id: 'constraints', name: 'Constraints', type: 'constraint', depth: 1, open: true },
      ...createConstraintTreeNodes(constraints),
      ...nodes.filter((node) => node.id === 'attachment-hurtbox')
    ]
    return query
      ? projectNodes.filter((node) => node.name.toLowerCase().includes(query))
      : projectNodes
  }, [constraints, filter])

  return (
    <section className="panel-sheen flex h-full min-h-0 flex-col">
      <PanelHeader
        title="Project"
        eyebrow={artwork ? (artwork.layers[0]?.sourceFileName ?? artwork.name) : 'meadow-runner.lf'}
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
      <Tabs
        key={artwork?.id ?? 'demo-project'}
        defaultValue="tree"
        className="min-h-0 flex-1 gap-0"
      >
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
              placeholder={artwork ? 'Filter imported layers' : 'Filter hierarchy'}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="h-7 border-border/70 bg-background/50 pl-8 text-[11px]"
            />
          </div>
          <ScrollArea className="min-h-0 flex-1 px-1.5 pb-2">
            {artwork ? (
              <div className="space-y-0.5">
                <div className="flex h-8 items-center gap-1.5 rounded-md bg-primary/8 px-1.5 text-[11px] font-medium text-primary ring-1 ring-inset ring-primary/15">
                  <ChevronDown className="size-3 shrink-0 opacity-70" />
                  <Aperture className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{artwork.name}</span>
                  <span className="text-[9px] font-normal text-muted-foreground">
                    {artwork.layers.length}
                  </span>
                </div>

                {artworkRows.map((row) =>
                  row.kind === 'group' ? (
                    <div
                      key={row.id}
                      className="flex h-7 items-center gap-1.5 rounded-[5px] pr-1 text-[11px] text-muted-foreground"
                      style={{ paddingLeft: 6 + row.depth * 12 }}
                    >
                      <ChevronDown className="size-3 shrink-0 opacity-65" />
                      <Folder className="size-3.5 shrink-0 text-[#83a2af]" />
                      <span className="min-w-0 flex-1 truncate">{row.name}</span>
                    </div>
                  ) : (
                    <div
                      key={row.id}
                      className={cn(
                        'group flex h-7 min-w-0 items-center rounded-[5px] border border-transparent pr-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground',
                        selectedId === row.id && 'border-primary/20 bg-primary/12 text-primary'
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

                {artworkRows.length === 0 ? (
                  <p className="px-3 py-8 text-center text-[10px] text-muted-foreground">
                    No imported layers match “{filter}”.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredDemoNodes.map((node) => (
                  <TreeRow
                    key={node.id}
                    node={node}
                    selected={selectedId === node.id}
                    onSelect={() => onSelect(node.id)}
                  />
                ))}
              </div>
            )}
            {audioTracks.map((track) => (
              <button
                key={track.id}
                type="button"
                onClick={() => onSelect(track.id)}
                className={cn(
                  'mt-1 flex h-8 w-full items-center gap-2 rounded-md px-3 text-left text-[11px] text-muted-foreground hover:bg-accent/70 hover:text-foreground',
                  selectedId === track.id &&
                    'bg-primary/12 text-primary ring-1 ring-inset ring-primary/20'
                )}
              >
                <AudioWaveform className="size-3.5" />
                <span className="min-w-0 flex-1 truncate">{track.name}</span>
                <span className="text-[9px]">{track.durationSeconds.toFixed(1)}s</span>
              </button>
            ))}
            {artwork ? (
              <div className="mt-2 border-t border-border/60 pt-2">
                <div className="flex h-7 items-center gap-2 px-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Bone className="size-3.5" /> Rig bones
                </div>
                {bones.map((bone) => (
                  <TreeRow
                    key={bone.id}
                    node={{
                      id: bone.id,
                      name: bone.name,
                      type: 'bone',
                      depth: bone.parentId ? 2 : 1
                    }}
                    selected={selectedId === bone.id}
                    onSelect={() => onSelect(bone.id)}
                  />
                ))}
              </div>
            ) : null}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="skins" className="min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-2 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">Character variants</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Shared rig · 3 skins</p>
                </div>
                <WandSparkles className="size-4 text-primary" />
              </div>
              {skins.map((skin) => (
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
                      background: `linear-gradient(135deg, ${skin.colors[0]}, ${skin.colors[1]})`
                    }}
                  >
                    <Shirt className="size-4 text-white/90" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{skin.name}</p>
                    <p className="text-[10px] text-muted-foreground">12 attachments</p>
                  </div>
                  {activeSkin === skin.id ? <CircleDot className="size-4 text-primary" /> : null}
                </button>
              ))}
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
                        selectedId === layer.id && 'border-primary/25 bg-primary/10 text-primary'
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
                <div>
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
            <span>34 bones</span>
            <span>·</span>
            <span>18 slots</span>
          </>
        )}
        <Box className="ml-auto size-3" />
      </div>
    </section>
  )
}
