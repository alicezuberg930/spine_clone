import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'

import type { Bone, EditorTool, Matrix2D, Point, Transform } from '@/@types'
import {
  invertAffineMatrix,
  resolveBoneWorldMatrices,
  transformPointByMatrix,
  transformVectorByMatrix
} from '@/lib/skeleton-geometry'

interface ArtworkBoneTransformGizmoProps {
  bones: Bone[]
  selectedBoneId: string
  tool: EditorTool
  viewportScale: number
  onTransformChange: (patch: Partial<Transform>) => void
}

type DragMode =
  | 'translate-free'
  | 'translate-x'
  | 'translate-y'
  | 'rotate'
  | 'scale-x'
  | 'scale-y'
  | 'scale-uniform'
  | 'shear-x'
  | 'shear-y'

interface GizmoDrag {
  pointerId: number
  captureTarget: SVGElement
  mode: DragMode
  inverseParent: Matrix2D
  origin: Point
  start: Point
  initial: Transform
  xAxis: Point
  yAxis: Point
  reference: number
}

const IDENTITY_MATRIX: Matrix2D = [1, 0, 0, 1, 0, 0]
const EPSILON = 1e-6

const normalize = (vector: Point, fallback: Point = { x: 1, y: 0 }): Point => {
  const length = Math.hypot(vector.x, vector.y)
  return length <= EPSILON
    ? fallback
    : {
        x: vector.x / length,
        y: vector.y / length
      }
}

const add = (left: Point, right: Point): Point => ({
  x: left.x + right.x,
  y: left.y + right.y
})

const subtract = (left: Point, right: Point): Point => ({
  x: left.x - right.x,
  y: left.y - right.y
})

const multiply = (point: Point, scalar: number): Point => ({
  x: point.x * scalar,
  y: point.y * scalar
})

const dot = (left: Point, right: Point): number => left.x * right.x + left.y * right.y

const angle = (origin: Point, point: Point): number =>
  (Math.atan2(point.y - origin.y, point.x - origin.x) * 180) / Math.PI

const normalizeDegrees = (degrees: number): number => {
  const normalized = ((((degrees + 180) % 360) + 360) % 360) - 180
  return Object.is(normalized, -0) ? 0 : normalized
}

const snap = (value: number, step: number): number => Math.round(value / step) * step

const clampScale = (value: number): number => {
  if (!Number.isFinite(value)) return 1
  if (Math.abs(value) >= 0.01) return value
  return value < 0 ? -0.01 : 0.01
}

const worldDirection = (matrix: Matrix2D, vector: Point): Point =>
  normalize(transformVectorByMatrix(matrix, vector), vector)

/**
 * Viewport handles for editing a selected artwork bone. Pointer coordinates
 * are converted back through the parent's affine matrix, so edits remain in
 * the bone's local transform space under rotated, scaled, or sheared parents.
 */
export function ArtworkBoneTransformGizmo({
  bones,
  selectedBoneId,
  tool,
  viewportScale,
  onTransformChange
}: ArtworkBoneTransformGizmoProps): React.JSX.Element | null {
  const groupRef = useRef<SVGGElement | null>(null)
  const dragRef = useRef<GizmoDrag | null>(null)
  const safeScale = Math.max(0.001, viewportScale)

  const geometry = useMemo(() => {
    const bone = bones.find((candidate) => candidate.id === selectedBoneId)
    if (!bone) return null

    const worldMatrices = resolveBoneWorldMatrices(bones)
    const boneMatrix = worldMatrices.get(bone.id) ?? IDENTITY_MATRIX
    const parentMatrix = bone.parentId
      ? (worldMatrices.get(bone.parentId) ?? IDENTITY_MATRIX)
      : IDENTITY_MATRIX
    const inverseParent = invertAffineMatrix(parentMatrix) ?? IDENTITY_MATRIX
    const originParent = { x: bone.transform.x, y: bone.transform.y }
    const origin = transformPointByMatrix(parentMatrix, originParent)
    const xRadians = ((bone.transform.rotation + (bone.transform.shearX ?? 0)) * Math.PI) / 180
    const yRadians = ((bone.transform.rotation + 90 + (bone.transform.shearY ?? 0)) * Math.PI) / 180
    const xAxis = { x: Math.cos(xRadians), y: Math.sin(xRadians) }
    const yAxis = { x: Math.cos(yRadians), y: Math.sin(yRadians) }
    const xDirection = worldDirection(parentMatrix, xAxis)
    const yDirection = worldDirection(parentMatrix, yAxis)
    const parentXDirection = worldDirection(parentMatrix, { x: 1, y: 0 })
    const parentYDirection = worldDirection(parentMatrix, { x: 0, y: 1 })
    const boneEnd = transformPointByMatrix(boneMatrix, { x: bone.length, y: 0 })

    return {
      bone,
      inverseParent,
      origin,
      originParent,
      xAxis,
      yAxis,
      xDirection,
      yDirection,
      parentXDirection,
      parentYDirection,
      boneEnd
    }
  }, [bones, selectedBoneId])

  if (!geometry || !['translate', 'rotate', 'scale', 'shear'].includes(tool)) return null

  const axisLength = 52 / safeScale
  const secondaryLength = 38 / safeScale
  const handleRadius = 4.5 / safeScale
  const hitWidth = 14 / safeScale
  const lineWidth = 1.5 / safeScale
  const originRadius = 4 / safeScale
  const xEnd = add(geometry.origin, multiply(geometry.xDirection, axisLength))
  const yEnd = add(geometry.origin, multiply(geometry.yDirection, axisLength))
  const parentXEnd = add(geometry.origin, multiply(geometry.parentXDirection, axisLength))
  const parentYEnd = add(geometry.origin, multiply(geometry.parentYDirection, axisLength))
  const uniformDirection = normalize(add(geometry.xDirection, geometry.yDirection), {
    x: Math.SQRT1_2,
    y: Math.SQRT1_2
  })
  const uniformEnd = add(geometry.origin, multiply(uniformDirection, secondaryLength))
  const directDragMode: DragMode =
    tool === 'translate'
      ? 'translate-free'
      : tool === 'rotate'
        ? 'rotate'
        : tool === 'scale'
          ? 'scale-x'
          : 'shear-x'
  const directDragCursor =
    tool === 'translate'
      ? 'cursor-move'
      : tool === 'scale'
        ? 'cursor-ew-resize'
        : 'cursor-grab active:cursor-grabbing'

  const pointerInArtwork = (
    event: Pick<ReactPointerEvent<SVGElement>, 'clientX' | 'clientY'>
  ): Point => {
    const matrix = groupRef.current?.getScreenCTM()
    if (!matrix) return { x: event.clientX, y: event.clientY }
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    return { x: point.x, y: point.y }
  }

  const handlePointerDown = (event: ReactPointerEvent<SVGElement>): void => {
    if (event.button !== 0) return
    const mode = event.currentTarget.dataset.dragMode as DragMode | undefined
    if (!mode) return
    event.preventDefault()
    event.stopPropagation()

    const startWorld = pointerInArtwork(event)
    const start = transformPointByMatrix(geometry.inverseParent, startWorld)
    const startVector = subtract(start, geometry.originParent)
    const reference =
      mode === 'scale-x'
        ? dot(startVector, geometry.xAxis)
        : mode === 'scale-y'
          ? dot(startVector, geometry.yAxis)
          : Math.hypot(startVector.x, startVector.y)

    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      mode,
      inverseParent: geometry.inverseParent,
      origin: geometry.originParent,
      start,
      initial: { ...geometry.bone.transform },
      xAxis: geometry.xAxis,
      yAxis: geometry.yAxis,
      reference
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<SVGGElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()

    const worldPoint = pointerInArtwork(event)
    const point = transformPointByMatrix(drag.inverseParent, worldPoint)
    const delta = subtract(point, drag.start)
    const vector = subtract(point, drag.origin)

    if (drag.mode.startsWith('translate')) {
      let x = drag.initial.x + (drag.mode === 'translate-y' ? 0 : delta.x)
      let y = drag.initial.y + (drag.mode === 'translate-x' ? 0 : delta.y)
      if (event.shiftKey) {
        x = snap(x, 10)
        y = snap(y, 10)
      }
      onTransformChange({ x, y })
      return
    }

    if (drag.mode === 'rotate') {
      const deltaAngle = normalizeDegrees(
        angle(drag.origin, point) - angle(drag.origin, drag.start)
      )
      let rotation = normalizeDegrees(drag.initial.rotation + deltaAngle)
      if (event.shiftKey) rotation = snap(rotation, 15)
      onTransformChange({ rotation })
      return
    }

    if (drag.mode === 'scale-x' || drag.mode === 'scale-y') {
      const axis = drag.mode === 'scale-x' ? drag.xAxis : drag.yAxis
      const projection = dot(vector, axis)
      const ratio = Math.abs(drag.reference) <= EPSILON ? 1 : projection / drag.reference
      const property = drag.mode === 'scale-x' ? 'scaleX' : 'scaleY'
      let value = clampScale(drag.initial[property] * ratio)
      if (event.shiftKey) value = clampScale(snap(value, 0.1))
      onTransformChange({ [property]: value })
      return
    }

    if (drag.mode === 'scale-uniform') {
      const distance = Math.hypot(vector.x, vector.y)
      const ratio = Math.abs(drag.reference) <= EPSILON ? 1 : distance / drag.reference
      let scaleX = clampScale(drag.initial.scaleX * ratio)
      let scaleY = clampScale(drag.initial.scaleY * ratio)
      if (event.shiftKey) {
        scaleX = clampScale(snap(scaleX, 0.1))
        scaleY = clampScale(snap(scaleY, 0.1))
      }
      onTransformChange({ scaleX, scaleY })
      return
    }

    const deltaAngle = normalizeDegrees(angle(drag.origin, point) - angle(drag.origin, drag.start))
    if (drag.mode === 'shear-x') {
      let shearX = normalizeDegrees((drag.initial.shearX ?? 0) + deltaAngle)
      if (event.shiftKey) shearX = snap(shearX, 15)
      onTransformChange({ shearX })
    } else {
      let shearY = normalizeDegrees((drag.initial.shearY ?? 0) + deltaAngle)
      if (event.shiftKey) shearY = snap(shearY, 15)
      onTransformChange({ shearY })
    }
  }

  const stopDrag = (event: ReactPointerEvent<SVGGElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = null
    if (drag.captureTarget.hasPointerCapture(event.pointerId)) {
      drag.captureTarget.releasePointerCapture(event.pointerId)
    }
  }

  const originHandle = (
    <circle
      cx={geometry.origin.x}
      cy={geometry.origin.y}
      r={originRadius}
      fill="#0a1217"
      stroke="#f7c860"
      strokeWidth={lineWidth}
      pointerEvents="none"
    />
  )

  return (
    <g
      ref={groupRef}
      data-editor-only="bone-transform-gizmo"
      pointerEvents="none"
      onPointerMove={handlePointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
    >
      <line
        x1={geometry.origin.x}
        y1={geometry.origin.y}
        x2={geometry.boneEnd.x}
        y2={geometry.boneEnd.y}
        stroke="transparent"
        strokeWidth={hitWidth}
        strokeLinecap="round"
        pointerEvents="stroke"
        className={directDragCursor}
        aria-label={`${tool[0].toUpperCase()}${tool.slice(1)} selected bone`}
        data-drag-mode={directDragMode}
        onPointerDown={handlePointerDown}
      />
      {tool === 'translate' ? (
        <>
          <line
            x1={geometry.origin.x}
            y1={geometry.origin.y}
            x2={parentXEnd.x}
            y2={parentXEnd.y}
            stroke="transparent"
            strokeWidth={hitWidth}
            pointerEvents="stroke"
            className="cursor-ew-resize"
            aria-label="Translate bone on X axis"
            data-drag-mode="translate-x"
            onPointerDown={handlePointerDown}
          />
          <line
            x1={geometry.origin.x}
            y1={geometry.origin.y}
            x2={parentYEnd.x}
            y2={parentYEnd.y}
            stroke="transparent"
            strokeWidth={hitWidth}
            pointerEvents="stroke"
            className="cursor-ns-resize"
            aria-label="Translate bone on Y axis"
            data-drag-mode="translate-y"
            onPointerDown={handlePointerDown}
          />
          <line
            x1={geometry.origin.x}
            y1={geometry.origin.y}
            x2={parentXEnd.x}
            y2={parentXEnd.y}
            stroke="#ef6461"
            strokeWidth={lineWidth}
            pointerEvents="none"
          />
          <line
            x1={geometry.origin.x}
            y1={geometry.origin.y}
            x2={parentYEnd.x}
            y2={parentYEnd.y}
            stroke="#45d6bd"
            strokeWidth={lineWidth}
            pointerEvents="none"
          />
          <circle
            cx={parentXEnd.x}
            cy={parentXEnd.y}
            r={handleRadius}
            fill="#ef6461"
            stroke="#081116"
            strokeWidth={lineWidth}
            pointerEvents="all"
            className="cursor-ew-resize"
            aria-label="Translate bone on X axis"
            data-drag-mode="translate-x"
            onPointerDown={handlePointerDown}
          />
          <circle
            cx={parentYEnd.x}
            cy={parentYEnd.y}
            r={handleRadius}
            fill="#45d6bd"
            stroke="#081116"
            strokeWidth={lineWidth}
            pointerEvents="all"
            className="cursor-ns-resize"
            aria-label="Translate bone on Y axis"
            data-drag-mode="translate-y"
            onPointerDown={handlePointerDown}
          />
          <circle
            cx={geometry.origin.x}
            cy={geometry.origin.y}
            r={handleRadius * 1.35}
            fill="#f7c860"
            stroke="#081116"
            strokeWidth={lineWidth}
            pointerEvents="all"
            className="cursor-move"
            aria-label="Translate bone freely"
            data-drag-mode="translate-free"
            onPointerDown={handlePointerDown}
          />
        </>
      ) : null}

      {tool === 'rotate' ? (
        <>
          <circle
            cx={geometry.origin.x}
            cy={geometry.origin.y}
            r={axisLength}
            fill="none"
            stroke="transparent"
            strokeWidth={hitWidth}
            pointerEvents="stroke"
            className="cursor-grab active:cursor-grabbing"
            aria-label="Rotate bone"
            data-drag-mode="rotate"
            onPointerDown={handlePointerDown}
          />
          <circle
            cx={geometry.origin.x}
            cy={geometry.origin.y}
            r={axisLength}
            fill="none"
            stroke="#f7c860"
            strokeDasharray={`${4 / safeScale} ${3 / safeScale}`}
            strokeWidth={lineWidth}
            pointerEvents="none"
          />
          <line
            x1={geometry.origin.x}
            y1={geometry.origin.y}
            x2={xEnd.x}
            y2={xEnd.y}
            stroke="#f7c860"
            strokeWidth={lineWidth}
            pointerEvents="none"
          />
          {originHandle}
        </>
      ) : null}

      {tool === 'scale' ? (
        <>
          <line
            x1={geometry.origin.x}
            y1={geometry.origin.y}
            x2={xEnd.x}
            y2={xEnd.y}
            stroke="#ef6461"
            strokeWidth={lineWidth}
            pointerEvents="none"
          />
          <line
            x1={geometry.origin.x}
            y1={geometry.origin.y}
            x2={yEnd.x}
            y2={yEnd.y}
            stroke="#45d6bd"
            strokeWidth={lineWidth}
            pointerEvents="none"
          />
          <line
            x1={geometry.origin.x}
            y1={geometry.origin.y}
            x2={uniformEnd.x}
            y2={uniformEnd.y}
            stroke="#f7c860"
            strokeDasharray={`${3 / safeScale} ${2 / safeScale}`}
            strokeWidth={lineWidth}
            pointerEvents="none"
          />
          <circle
            cx={xEnd.x}
            cy={xEnd.y}
            r={handleRadius * 1.6}
            fill="transparent"
            pointerEvents="all"
            className="cursor-ew-resize"
            aria-label="Scale bone on X axis"
            data-drag-mode="scale-x"
            onPointerDown={handlePointerDown}
          />
          <rect
            x={xEnd.x - handleRadius}
            y={xEnd.y - handleRadius}
            width={handleRadius * 2}
            height={handleRadius * 2}
            fill="#ef6461"
            stroke="#081116"
            strokeWidth={lineWidth}
            pointerEvents="none"
          />
          <circle
            cx={yEnd.x}
            cy={yEnd.y}
            r={handleRadius * 1.6}
            fill="transparent"
            pointerEvents="all"
            className="cursor-ns-resize"
            aria-label="Scale bone on Y axis"
            data-drag-mode="scale-y"
            onPointerDown={handlePointerDown}
          />
          <rect
            x={yEnd.x - handleRadius}
            y={yEnd.y - handleRadius}
            width={handleRadius * 2}
            height={handleRadius * 2}
            fill="#45d6bd"
            stroke="#081116"
            strokeWidth={lineWidth}
            pointerEvents="none"
          />
          <circle
            cx={uniformEnd.x}
            cy={uniformEnd.y}
            r={handleRadius * 1.75}
            fill="transparent"
            pointerEvents="all"
            className="cursor-nwse-resize"
            aria-label="Scale bone uniformly"
            data-drag-mode="scale-uniform"
            onPointerDown={handlePointerDown}
          />
          <rect
            x={uniformEnd.x - handleRadius}
            y={uniformEnd.y - handleRadius}
            width={handleRadius * 2}
            height={handleRadius * 2}
            fill="#f7c860"
            stroke="#081116"
            strokeWidth={lineWidth}
            transform={`rotate(45 ${uniformEnd.x} ${uniformEnd.y})`}
            pointerEvents="none"
          />
          {originHandle}
        </>
      ) : null}

      {tool === 'shear' ? (
        <>
          <line
            x1={geometry.origin.x}
            y1={geometry.origin.y}
            x2={xEnd.x}
            y2={xEnd.y}
            stroke="#e578dc"
            strokeWidth={lineWidth}
            pointerEvents="none"
          />
          <line
            x1={geometry.origin.x}
            y1={geometry.origin.y}
            x2={yEnd.x}
            y2={yEnd.y}
            stroke="#79a9ff"
            strokeWidth={lineWidth}
            pointerEvents="none"
          />
          <circle
            cx={xEnd.x}
            cy={xEnd.y}
            r={handleRadius * 1.8}
            fill="transparent"
            pointerEvents="all"
            className="cursor-grab active:cursor-grabbing"
            aria-label="Shear bone X axis"
            data-drag-mode="shear-x"
            onPointerDown={handlePointerDown}
          />
          <rect
            x={xEnd.x - handleRadius}
            y={xEnd.y - handleRadius}
            width={handleRadius * 2}
            height={handleRadius * 2}
            fill="#e578dc"
            stroke="#081116"
            strokeWidth={lineWidth}
            transform={`rotate(45 ${xEnd.x} ${xEnd.y})`}
            pointerEvents="none"
          />
          <circle
            cx={yEnd.x}
            cy={yEnd.y}
            r={handleRadius * 1.8}
            fill="transparent"
            pointerEvents="all"
            className="cursor-grab active:cursor-grabbing"
            aria-label="Shear bone Y axis"
            data-drag-mode="shear-y"
            onPointerDown={handlePointerDown}
          />
          <rect
            x={yEnd.x - handleRadius}
            y={yEnd.y - handleRadius}
            width={handleRadius * 2}
            height={handleRadius * 2}
            fill="#79a9ff"
            stroke="#081116"
            strokeWidth={lineWidth}
            transform={`rotate(45 ${yEnd.x} ${yEnd.y})`}
            pointerEvents="none"
          />
          {originHandle}
        </>
      ) : null}
    </g>
  )
}
