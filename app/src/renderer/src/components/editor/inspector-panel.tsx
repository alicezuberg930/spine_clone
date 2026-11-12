import { useState } from 'react'
import {
  AudioLines,
  BadgeCheck,
  Blend,
  Bone,
  Box,
  ChevronRight,
  Crop,
  Eye,
  GitBranch,
  Image as ImageIcon,
  MoreHorizontal,
  RefreshCw,
  Scaling,
  Sparkles,
  Spline,
  Target,
  Trash2,
  Unlink,
  Waves,
  Weight
} from 'lucide-react'

import { PanelHeader } from '@/components/editor/panel-header'
import { BoneBindingCombobox } from '@/components/editor/bone-binding-combobox'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type {
  ArtworkLayer,
  AudioTrack,
  Bone as BoneType,
  Constraint,
  EditorTool,
  GeometrySelection,
  Transform,
  WeightBrush
} from '@/@types'

interface InspectorFlags {
  showMesh: boolean
  showWeights: boolean
  showClipping: boolean
  showBounds: boolean
  physicsEnabled: boolean
}

interface InspectorPanelProps {
  selectedId: string
  selectedName: string
  transform: Transform
  flags: InspectorFlags
  frame: number
  artworkLayer: ArtworkLayer | null
  tool: EditorTool
  bones: BoneType[]
  constraints: Constraint[]
  geometrySelection: GeometrySelection | null
  weightBrush: WeightBrush
  selectedConstraint: Constraint | null
  selectedAudioTrack: AudioTrack | null
  onTransformChange: (patch: Partial<Transform>) => void
  onToggle: (key: 'showMesh' | 'showWeights' | 'showClipping' | 'showBounds') => void
  onResetTransform: () => void
  onArtworkLayerVisibilityChange: (id: string) => void
  onArtworkLayerBoneChange: (layerId: string, boneId: string | null) => void
  onCreateArtworkMesh: (layerId: string, cells: number) => void
  onResetArtworkDeformation: (layerId: string) => void
  onWeightBrushChange: (changes: Partial<WeightBrush>) => void
  onVertexWeightChange: (layerId: string, vertexId: string, boneId: string, value: number) => void
  onCreateArtworkClipping: (layerId: string) => void
  onArtworkClippingChange: (
    layerId: string,
    changes: Partial<NonNullable<ArtworkLayer['clipping']>>
  ) => void
  onConstraintChange: (id: string, patch: Partial<Constraint>) => void
  onConstraintSelect: (id: string) => void
  onAudioTrackChange: (id: string, changes: Partial<AudioTrack>) => void
  onAudioTrackRemove: (id: string) => void
  onFeatureNotImplemented: (feature: string) => void
}

function ArtworkLayerInspector({
  layer,
  tool,
  bones,
  geometrySelection,
  weightBrush,
  onVisibilityChange,
  onBoneChange,
  onCreateMesh,
  onResetDeformation,
  onWeightBrushChange,
  onVertexWeightChange,
  onCreateClipping,
  onClippingChange,
  onFeatureNotImplemented
}: {
  layer: ArtworkLayer
  tool: EditorTool
  bones: BoneType[]
  geometrySelection: GeometrySelection | null
  weightBrush: WeightBrush
  onVisibilityChange: (id: string) => void
  onBoneChange: (layerId: string, boneId: string | null) => void
  onCreateMesh: (layerId: string, cells: number) => void
  onResetDeformation: (layerId: string) => void
  onWeightBrushChange: (changes: Partial<WeightBrush>) => void
  onVertexWeightChange: (layerId: string, vertexId: string, boneId: string, value: number) => void
  onCreateClipping: (layerId: string) => void
  onClippingChange: (
    layerId: string,
    changes: Partial<NonNullable<ArtworkLayer['clipping']>>
  ) => void
  onFeatureNotImplemented: (feature: string) => void
}): React.JSX.Element {
  const selectedVertexId =
    geometrySelection?.layerId === layer.id && geometrySelection.kind === 'mesh'
      ? geometrySelection.vertexIds[0]
      : null
  const selectedVertex = layer.mesh?.vertices.find((vertex) => vertex.id === selectedVertexId)
  const activeWeight =
    selectedVertex?.weights.find((weight) => weight.boneId === weightBrush.boneId)?.value ?? 0
  return (
    <section className="panel-sheen flex h-full min-h-0 flex-col">
      <PanelHeader
        title="Inspector"
        eyebrow="imported artwork"
        actions={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Layer options"
            onClick={() => onFeatureNotImplemented('Artwork layer options')}
          >
            <MoreHorizontal />
          </Button>
        }
      />

      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border/70 px-3">
        <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-primary/20 bg-primary/10">
          <img src={layer.dataUrl} alt="" className="max-h-full max-w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{layer.name}</p>
          <p className="truncate text-[9px] text-muted-foreground">{layer.sourceFileName}</p>
        </div>
        <Badge variant="outline" className="h-5 border-border/70 text-[9px] text-muted-foreground">
          Layer
        </Badge>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-3">
          <div className="grid min-h-40 place-items-center overflow-hidden rounded-xl border border-border/70 bg-[linear-gradient(45deg,#111a20_25%,transparent_25%),linear-gradient(-45deg,#111a20_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#111a20_75%),linear-gradient(-45deg,transparent_75%,#111a20_75%)] bg-size-[16px_16px] bg-position-[0_0,0_8px,8px_-8px,-8px_0px] p-3">
            <img
              src={layer.dataUrl}
              alt={`${layer.name} preview`}
              className="max-h-48 max-w-full object-contain drop-shadow-xl"
            />
          </div>

          <div className="rounded-lg border border-border/70 bg-background/25 p-3">
            <div className="flex items-center gap-2.5">
              <div className="grid size-7 place-items-center rounded-md border border-border/70 bg-background/40">
                <Eye className="size-3.5 text-[#8ba5b1]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium">Visible</p>
                <p className="text-[9px] text-muted-foreground">
                  Include this layer in the composition
                </p>
              </div>
              <Switch
                size="sm"
                checked={layer.visible}
                onCheckedChange={() => onVisibilityChange(layer.id)}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border/70 bg-background/25 p-3">
            <div className="flex items-center gap-2">
              <Bone className="size-3.5 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium">Rigid bone binding</p>
                <p className="text-[9px] text-muted-foreground">
                  Move this layer with a bone without mesh weights
                </p>
              </div>
            </div>
            <div className="grid grid-cols-[58px_1fr] items-center gap-2">
              <Label className="text-[10px] font-normal text-muted-foreground">Bone</Label>
              <BoneBindingCombobox
                bones={bones}
                value={layer.boneId ?? null}
                onValueChange={(boneId) => onBoneChange(layer.id, boneId)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              ['Position', `${layer.x}, ${layer.y}`],
              ['Size', `${layer.width} × ${layer.height}`],
              ['Opacity', `${Math.round(layer.opacity * 100)}%`],
              ['Blend', layer.blendMode]
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg border border-border/70 bg-background/25 p-2.5"
              >
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 truncate text-[11px] font-medium capitalize">{value}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center gap-2">
              <Spline className="size-4 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium">Geometry</p>
                <p className="text-[9px] capitalize text-muted-foreground">{tool} workflow</p>
              </div>
              {layer.mesh ? (
                <Badge variant="outline" className="h-5 text-[8px]">
                  {layer.mesh.vertices.length} vertices
                </Badge>
              ) : null}
            </div>

            {layer.mesh ? (
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={() => onCreateMesh(layer.id, 2)}>
                  Reset mesh
                </Button>
                <Button size="sm" variant="outline" onClick={() => onCreateMesh(layer.id, 4)}>
                  Subdivide
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="col-span-2"
                  onClick={() => onResetDeformation(layer.id)}
                >
                  <RefreshCw /> Reset deformation
                </Button>
              </div>
            ) : (
              <Button size="sm" className="w-full" onClick={() => onCreateMesh(layer.id, 2)}>
                <Spline /> Create 3 × 3 mesh
              </Button>
            )}

            {layer.mesh ? (
              <div className="space-y-2 border-t border-border/60 pt-3">
                <div className="grid grid-cols-[58px_1fr] items-center gap-2">
                  <Label className="text-[10px] font-normal text-muted-foreground">Bone</Label>
                  <NativeSelect
                    size="sm"
                    value={weightBrush.boneId ?? ''}
                    onChange={(event) => onWeightBrushChange({ boneId: event.target.value })}
                  >
                    {bones.map((bone) => (
                      <NativeSelectOption key={bone.id} value={bone.id}>
                        {bone.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <PhysicsSlider
                  label="Radius"
                  value={weightBrush.radius}
                  max={250}
                  onChange={(radius) => onWeightBrushChange({ radius })}
                />
                <PhysicsSlider
                  label="Strength"
                  value={Math.round(weightBrush.strength * 100)}
                  onChange={(strength) => onWeightBrushChange({ strength: strength / 100 })}
                />
                {selectedVertex && weightBrush.boneId ? (
                  <div className="rounded-md border border-border/60 bg-background/35 p-2">
                    <div className="mb-1.5 flex items-center justify-between text-[9px]">
                      <span className="text-muted-foreground">Selected vertex influence</span>
                      <span>{Math.round(activeWeight * 100)}%</span>
                    </div>
                    <Slider
                      min={0}
                      max={1}
                      step={0.01}
                      value={[activeWeight]}
                      onValueChange={(value) =>
                        onVertexWeightChange(
                          layer.id,
                          selectedVertex.id,
                          weightBrush.boneId!,
                          value[0] ?? 0
                        )
                      }
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2 border-t border-border/60 pt-3">
              {layer.clipping ? (
                <>
                  <ToggleRow
                    icon={Crop}
                    title="Clipping enabled"
                    description="Restrict this layer to the editable polygon"
                    checked={layer.clipping.enabled}
                    onCheckedChange={(enabled) => onClippingChange(layer.id, { enabled })}
                  />
                  <ToggleRow
                    icon={Crop}
                    title="Inverse clipping"
                    description="Cut the polygon out instead of keeping it"
                    checked={layer.clipping.inverted}
                    onCheckedChange={(inverted) => onClippingChange(layer.id, { inverted })}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => onCreateClipping(layer.id)}
                  >
                    Reset clipping polygon
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => onCreateClipping(layer.id)}
                >
                  <Crop />
                  Create clipping polygon
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background/25 p-3">
            <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium">
              <ImageIcon className="size-3.5 text-primary" /> Layer path
            </div>
            <p className="wrap-break-word text-[10px] leading-4 text-muted-foreground">
              {layer.groupPath.length > 0
                ? `${layer.groupPath.join(' / ')} / ${layer.name}`
                : layer.name}
            </p>
          </div>
        </div>
      </ScrollArea>

      <div className="flex h-8 shrink-0 items-center gap-2 border-t border-border/70 px-3 text-[9px] text-muted-foreground">
        <ImageIcon className="size-3 text-primary" />
        <span className="truncate">Imported from {layer.sourceFileName}</span>
      </div>
    </section>
  )
}

function NumberField({
  label,
  value,
  suffix,
  onChange
}: {
  label: string
  value: number
  suffix?: string
  onChange: (value: number) => void
}): React.JSX.Element {
  return (
    <label className="grid grid-cols-[42px_1fr] items-center gap-2">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <div className="relative">
        <Input
          type="number"
          value={Number.isInteger(value) ? value : Number(value.toFixed(2))}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-7 border-border/70 bg-background/45 pr-7 text-right text-[11px] tabular-nums"
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
    </label>
  )
}

function ToggleRow({
  icon: Icon,
  title,
  description,
  checked,
  onCheckedChange
}: {
  icon: typeof Bone
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <div className="grid size-7 shrink-0 place-items-center rounded-md border border-border/70 bg-background/40">
        <Icon className="size-3.5 text-[#8ba5b1]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium">{title}</p>
        <p className="truncate text-[9px] text-muted-foreground">{description}</p>
      </div>
      <Switch size="sm" checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function PhysicsSlider({
  label,
  value,
  max = 100,
  onChange
}: {
  label: string
  value: number
  max?: number
  onChange: (value: number) => void
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[55px_1fr_34px] items-center gap-2 py-1">
      <Label className="text-[10px] font-normal text-muted-foreground">{label}</Label>
      <Slider
        min={0}
        max={max}
        step={max <= 10 ? 0.1 : 1}
        value={[value]}
        onValueChange={(next) => onChange(next[0] ?? value)}
        className="**:data-[slot=slider-range]:bg-primary **:data-[slot=slider-thumb]:size-3"
      />
      <span className="text-right text-[10px] tabular-nums text-foreground/75">{value}</span>
    </div>
  )
}

function ConstraintInspector({
  constraint,
  onChange
}: {
  constraint: Constraint
  onChange: (patch: Partial<Constraint>) => void
}): React.JSX.Element {
  const typeLabel =
    constraint.type === 'ik'
      ? 'Inverse kinematics'
      : constraint.type === 'transform'
        ? 'Transform mapping'
        : constraint.type === 'path'
          ? 'Bezier path following'
          : 'Dynamic constraint'

  return (
    <section className="panel-sheen flex h-full min-h-0 flex-col">
      <PanelHeader title="Constraint" eyebrow={constraint.type} />
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border/70 px-3">
        <div className="grid size-9 place-items-center rounded-lg border border-primary/20 bg-primary/10">
          {constraint.type === 'ik' ? (
            <Target className="size-4 text-[#86a9ff]" />
          ) : constraint.type === 'transform' ? (
            <GitBranch className="size-4 text-[#f4b85a]" />
          ) : (
            <Spline className="size-4 text-[#d987e6]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{constraint.name}</p>
          <p className="truncate text-[9px] text-muted-foreground">{typeLabel}</p>
        </div>
        <Switch
          size="sm"
          checked={constraint.enabled !== false}
          onCheckedChange={(enabled) => onChange({ enabled })}
        />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-3">
          <div className="rounded-lg border border-border/70 bg-background/25 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-medium">Constraint mix</p>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {Math.round(constraint.mix * 100)}%
              </span>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[constraint.mix]}
              onValueChange={(value) => onChange({ mix: value[0] ?? constraint.mix })}
            />
          </div>

          {constraint.type === 'ik' ? (
            <div className="space-y-3 rounded-lg border border-[#86a9ff]/25 bg-[#86a9ff]/5 p-3">
              <div>
                <p className="text-[11px] font-medium">Target position</p>
                <p className="mt-0.5 text-[9px] text-muted-foreground">
                  Drag the target with the Pose tool or enter exact coordinates.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="X"
                  value={constraint.targetPosition?.x ?? 476}
                  onChange={(x) =>
                    onChange({ targetPosition: { x, y: constraint.targetPosition?.y ?? 510 } })
                  }
                />
                <NumberField
                  label="Y"
                  value={constraint.targetPosition?.y ?? 510}
                  onChange={(y) =>
                    onChange({ targetPosition: { x: constraint.targetPosition?.x ?? 476, y } })
                  }
                />
              </div>
              <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                <Label className="text-[10px] font-normal text-muted-foreground">Bend</Label>
                <NativeSelect
                  size="sm"
                  value={String(constraint.bendDirection ?? 1)}
                  onChange={(event) =>
                    onChange({ bendDirection: Number(event.target.value) as 1 | -1 })
                  }
                >
                  <NativeSelectOption value="1">Clockwise</NativeSelectOption>
                  <NativeSelectOption value="-1">Counter-clockwise</NativeSelectOption>
                </NativeSelect>
              </div>
            </div>
          ) : null}

          {constraint.type === 'transform' ? (
            <div className="space-y-3 rounded-lg border border-[#f4b85a]/25 bg-[#f4b85a]/5 p-3">
              <NumberField
                label="Offset"
                value={constraint.offsetRotation ?? 0}
                suffix="°"
                onChange={(offsetRotation) => onChange({ offsetRotation })}
              />
              <PhysicsSlider
                label="Rotate"
                value={Math.round((constraint.rotateMix ?? constraint.mix) * 100)}
                onChange={(value) => onChange({ rotateMix: value / 100 })}
              />
              <PhysicsSlider
                label="Move"
                value={Math.round((constraint.translateMix ?? 0) * 100)}
                onChange={(value) => onChange({ translateMix: value / 100 })}
              />
              <PhysicsSlider
                label="Scale"
                value={Math.round((constraint.scaleMix ?? 0) * 100)}
                onChange={(value) => onChange({ scaleMix: value / 100 })}
              />
            </div>
          ) : null}

          {constraint.type === 'path' ? (
            <div className="space-y-3 rounded-lg border border-[#d987e6]/25 bg-[#d987e6]/5 p-3">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-[10px] font-normal text-muted-foreground">Position</Label>
                  <span className="text-[10px] tabular-nums">
                    {Math.round((constraint.pathPosition ?? 0) * 100)}%
                  </span>
                </div>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={[constraint.pathPosition ?? 0]}
                  onValueChange={(value) => onChange({ pathPosition: value[0] ?? 0 })}
                />
              </div>
              <NumberField
                label="Spacing"
                value={constraint.pathSpacing ?? 0}
                suffix="px"
                onChange={(pathSpacing) => onChange({ pathSpacing })}
              />
              <ToggleRow
                icon={Spline}
                title="Follow tangent"
                description="Rotate constrained bones along the curve"
                checked={constraint.pathRotate !== false}
                onCheckedChange={(pathRotate) => onChange({ pathRotate })}
              />
            </div>
          ) : null}

          {constraint.type === 'physics' ? (
            <div className="space-y-1 rounded-lg border border-primary/25 bg-primary/5 p-3">
              <PhysicsSlider
                label="Inertia"
                value={constraint.physics?.inertia ?? 0}
                onChange={(inertia) =>
                  onChange({ physics: { ...constraint.physics, inertia } as Constraint['physics'] })
                }
              />
              <PhysicsSlider
                label="Strength"
                value={constraint.physics?.strength ?? 0}
                onChange={(strength) =>
                  onChange({
                    physics: { ...constraint.physics, strength } as Constraint['physics']
                  })
                }
              />
              <PhysicsSlider
                label="Damping"
                value={constraint.physics?.damping ?? 0}
                onChange={(damping) =>
                  onChange({ physics: { ...constraint.physics, damping } as Constraint['physics'] })
                }
              />
              <PhysicsSlider
                label="Mass"
                value={constraint.physics?.mass ?? 1}
                max={5}
                onChange={(mass) =>
                  onChange({ physics: { ...constraint.physics, mass } as Constraint['physics'] })
                }
              />
              <PhysicsSlider
                label="Wind"
                value={constraint.physics?.wind ?? 0}
                onChange={(wind) =>
                  onChange({ physics: { ...constraint.physics, wind } as Constraint['physics'] })
                }
              />
              <PhysicsSlider
                label="Gravity"
                value={constraint.physics?.gravity ?? 0}
                onChange={(gravity) =>
                  onChange({ physics: { ...constraint.physics, gravity } as Constraint['physics'] })
                }
              />
            </div>
          ) : null}

          <div className="rounded-lg border border-border/70 bg-background/25 p-3 text-[10px] text-muted-foreground">
            Drives {constraint.boneIds.length} bone{constraint.boneIds.length === 1 ? '' : 's'}
            {constraint.targetId ? ` from ${constraint.targetId}` : ''}.
          </div>
        </div>
      </ScrollArea>
    </section>
  )
}

function AudioTrackInspector({
  track,
  onChange,
  onRemove
}: {
  track: AudioTrack
  onChange: (changes: Partial<AudioTrack>) => void
  onRemove: () => void
}): React.JSX.Element {
  return (
    <section className="panel-sheen flex h-full min-h-0 flex-col">
      <PanelHeader title="Audio" eyebrow="timeline clip" />
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border/70 px-3">
        <div className="grid size-9 place-items-center rounded-lg border border-primary/20 bg-primary/10">
          <AudioLines className="size-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{track.name}</p>
          <p className="truncate text-[9px] text-muted-foreground">{track.sourceFileName}</p>
        </div>
        <Button variant="ghost" size="icon-xs" aria-label="Remove audio" onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Duration', `${track.durationSeconds.toFixed(2)} s`],
              ['Sample rate', `${(track.sampleRate / 1000).toFixed(1)} kHz`],
              ['Channels', track.channels === 1 ? 'Mono' : `${track.channels} channels`],
              ['Start frame', String(track.startFrame)]
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg border border-border/70 bg-background/25 p-2.5"
              >
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 text-[11px] font-medium">{value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-border/70 bg-background/25 p-3">
            <PhysicsSlider
              label="Volume"
              value={Math.round(track.volume * 100)}
              onChange={(volume) => onChange({ volume: volume / 100 })}
            />
            <NumberField
              label="Start"
              value={track.startFrame}
              onChange={(startFrame) =>
                onChange({ startFrame: Math.max(0, Math.round(startFrame)) })
              }
            />
            <ToggleRow
              icon={AudioLines}
              title="Muted"
              description="Keep the clip on the timeline without playback"
              checked={track.muted}
              onCheckedChange={(muted) => onChange({ muted })}
            />
          </div>
        </div>
      </ScrollArea>
    </section>
  )
}

export function InspectorPanel({
  selectedId,
  selectedName,
  transform,
  flags,
  frame,
  artworkLayer,
  tool,
  bones,
  constraints,
  geometrySelection,
  weightBrush,
  selectedConstraint,
  selectedAudioTrack,
  onTransformChange,
  onToggle,
  onResetTransform,
  onArtworkLayerVisibilityChange,
  onArtworkLayerBoneChange,
  onCreateArtworkMesh,
  onResetArtworkDeformation,
  onWeightBrushChange,
  onVertexWeightChange,
  onCreateArtworkClipping,
  onArtworkClippingChange,
  onConstraintChange,
  onConstraintSelect,
  onAudioTrackChange,
  onAudioTrackRemove,
  onFeatureNotImplemented
}: InspectorPanelProps): React.JSX.Element {
  const [compensation, setCompensation] = useState(true)

  if (artworkLayer) {
    return (
      <ArtworkLayerInspector
        layer={artworkLayer}
        tool={tool}
        bones={bones}
        geometrySelection={geometrySelection}
        weightBrush={weightBrush}
        onVisibilityChange={onArtworkLayerVisibilityChange}
        onBoneChange={onArtworkLayerBoneChange}
        onCreateMesh={onCreateArtworkMesh}
        onResetDeformation={onResetArtworkDeformation}
        onWeightBrushChange={onWeightBrushChange}
        onVertexWeightChange={onVertexWeightChange}
        onCreateClipping={onCreateArtworkClipping}
        onClippingChange={onArtworkClippingChange}
        onFeatureNotImplemented={onFeatureNotImplemented}
      />
    )
  }

  if (selectedConstraint) {
    return (
      <ConstraintInspector
        constraint={selectedConstraint}
        onChange={(patch) => onConstraintChange(selectedConstraint.id, patch)}
      />
    )
  }

  if (selectedAudioTrack) {
    return (
      <AudioTrackInspector
        track={selectedAudioTrack}
        onChange={(changes) => onAudioTrackChange(selectedAudioTrack.id, changes)}
        onRemove={() => onAudioTrackRemove(selectedAudioTrack.id)}
      />
    )
  }

  if (!selectedId) {
    return (
      <section className="panel-sheen flex h-full min-h-0 flex-col">
        <PanelHeader title="Inspector" eyebrow={`frame ${frame}`} />
        <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
          <div>
            <div className="mx-auto grid size-11 place-items-center rounded-xl border border-border/70 bg-muted/30">
              <Bone className="size-5 text-muted-foreground" />
            </div>
            <p className="mt-3 text-xs font-medium">Nothing selected</p>
            <p className="mt-1 max-w-52 text-[10px] leading-4 text-muted-foreground">
              Import artwork or create a bone, then select it to edit its properties.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="panel-sheen flex h-full min-h-0 flex-col">
      <PanelHeader
        title="Inspector"
        eyebrow={`frame ${frame}`}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Reset transform"
              onClick={onResetTransform}
            >
              <RefreshCw />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Inspector options"
              onClick={() => onFeatureNotImplemented('Inspector options')}
            >
              <MoreHorizontal />
            </Button>
          </>
        }
      />

      <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border/70 px-3">
        <div className="grid size-8 place-items-center rounded-lg border border-primary/20 bg-primary/10">
          <Bone className="size-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{selectedName}</p>
          <p className="truncate text-[9px] text-muted-foreground">{selectedId}</p>
        </div>
        <Badge variant="outline" className="h-5 border-border/70 text-[9px] text-muted-foreground">
          Bone
        </Badge>
      </div>

      <Tabs defaultValue="properties" className="min-h-0 flex-1 gap-0">
        <TabsList
          variant="line"
          className="h-9 w-full shrink-0 justify-start gap-2 border-b border-border/70 px-2"
        >
          <TabsTrigger value="properties" className="text-[11px]">
            Properties
          </TabsTrigger>
          <TabsTrigger value="constraints" className="text-[11px]">
            Constraints
          </TabsTrigger>
        </TabsList>

        <TabsContent value="properties" className="min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <Accordion
              defaultValue={['transform', 'display', 'compensation']}
              multiple
              className="px-3"
            >
              <AccordionItem value="transform" className="border-border/70">
                <AccordionTrigger className="py-3 text-[11px] hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Target className="size-3.5 text-primary" /> Transform
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pb-3">
                  <div className="grid grid-cols-2 gap-2">
                    <NumberField
                      label="X"
                      value={transform.x}
                      onChange={(x) => onTransformChange({ x })}
                    />
                    <NumberField
                      label="Y"
                      value={transform.y}
                      onChange={(y) => onTransformChange({ y })}
                    />
                  </div>
                  <NumberField
                    label="Rotate"
                    value={transform.rotation}
                    suffix="°"
                    onChange={(rotation) => onTransformChange({ rotation })}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <NumberField
                      label="Scale X"
                      value={Math.round(transform.scaleX * 100)}
                      suffix="%"
                      onChange={(scaleX) => onTransformChange({ scaleX: scaleX / 100 })}
                    />
                    <NumberField
                      label="Scale Y"
                      value={Math.round(transform.scaleY * 100)}
                      suffix="%"
                      onChange={(scaleY) => onTransformChange({ scaleY: scaleY / 100 })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <NumberField
                      label="Shear X"
                      value={transform.shearX ?? 0}
                      suffix="°"
                      onChange={(shearX) => onTransformChange({ shearX })}
                    />
                    <NumberField
                      label="Shear Y"
                      value={transform.shearY ?? 0}
                      suffix="°"
                      onChange={(shearY) => onTransformChange({ shearY })}
                    />
                  </div>
                  <NumberField
                    label="Opacity"
                    value={Math.round(transform.opacity * 100)}
                    suffix="%"
                    onChange={(opacity) => onTransformChange({ opacity: opacity / 100 })}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="display" className="border-border/70">
                <AccordionTrigger className="py-3 text-[11px] hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Sparkles className="size-3.5 text-primary" /> Geometry overlays
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <ToggleRow
                    icon={Spline}
                    title="Mesh vertices"
                    description="Polygon geometry and deformation handles"
                    checked={flags.showMesh}
                    onCheckedChange={() => onToggle('showMesh')}
                  />
                  <ToggleRow
                    icon={Weight}
                    title="Weight heatmap"
                    description="Bone influence per mesh vertex"
                    checked={flags.showWeights}
                    onCheckedChange={() => onToggle('showWeights')}
                  />
                  <ToggleRow
                    icon={Crop}
                    title="Clipping polygon"
                    description="Preview inverse attachment clipping"
                    checked={flags.showClipping}
                    onCheckedChange={() => onToggle('showClipping')}
                  />
                  <ToggleRow
                    icon={Box}
                    title="Bounding boxes"
                    description="Runtime hit and interaction regions"
                    checked={flags.showBounds}
                    onCheckedChange={() => onToggle('showBounds')}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="compensation" className="border-border/70">
                <AccordionTrigger className="py-3 text-[11px] hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Unlink className="size-3.5 text-primary" /> Compensation
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pb-3">
                  <ToggleRow
                    icon={Bone}
                    title="Bone compensation"
                    description="Hold child bones in world space"
                    checked={compensation}
                    onCheckedChange={setCompensation}
                  />
                  <ToggleRow
                    icon={Scaling}
                    title="Image compensation"
                    description="Preserve attachment scale while editing parent"
                    checked={compensation}
                    onCheckedChange={setCompensation}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="appearance" className="border-border/70">
                <AccordionTrigger className="py-3 text-[11px] hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Blend className="size-3.5 text-primary" /> Attachment
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pb-3">
                  <div className="grid grid-cols-[72px_1fr] items-center gap-2">
                    <Label className="text-[10px] font-normal text-muted-foreground">
                      Blend mode
                    </Label>
                    <NativeSelect
                      size="sm"
                      value="normal"
                      onChange={() => onFeatureNotImplemented('Blend modes')}
                      className="w-full"
                    >
                      <NativeSelectOption value="normal">Normal</NativeSelectOption>
                      <NativeSelectOption value="multiply">Multiply</NativeSelectOption>
                      <NativeSelectOption value="screen">Screen</NativeSelectOption>
                      <NativeSelectOption value="additive">Additive</NativeSelectOption>
                    </NativeSelect>
                  </div>
                  <div className="grid grid-cols-[72px_1fr] items-center gap-2">
                    <Label className="text-[10px] font-normal text-muted-foreground">
                      Draw order
                    </Label>
                    <Input
                      type="number"
                      value={6}
                      readOnly
                      onFocus={() => onFeatureNotImplemented('Draw order editing')}
                      className="h-7 text-right text-[11px]"
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="constraints" className="min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-3 p-3">
              {constraints.map((constraint) => {
                const Icon =
                  constraint.type === 'ik'
                    ? Target
                    : constraint.type === 'transform'
                      ? GitBranch
                      : constraint.type === 'physics'
                        ? Waves
                        : Spline
                return (
                  <button
                    key={constraint.id}
                    type="button"
                    onClick={() => onConstraintSelect(constraint.id)}
                    className="flex w-full items-center gap-2 rounded-lg border border-border/70 bg-background/25 p-2.5 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
                  >
                    <Icon className="size-4 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium">
                        {constraint.name}
                      </span>
                      <span className="block truncate text-[9px] text-muted-foreground">
                        {constraint.type} · {constraint.boneIds.length} bone
                        {constraint.boneIds.length === 1 ? '' : 's'} ·{' '}
                        {Math.round(constraint.mix * 100)}%
                      </span>
                    </span>
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  </button>
                )
              })}
              {constraints.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center text-[10px] text-muted-foreground">
                  This project has no constraints.
                </p>
              ) : null}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <div className="flex h-8 shrink-0 items-center gap-2 border-t border-border/70 px-3 text-[9px] text-muted-foreground">
        <BadgeCheck className="size-3 text-primary" />
        <span>No rig problems</span>
      </div>
    </section>
  )
}
