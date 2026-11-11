import { useId, type CSSProperties, type PointerEventHandler } from 'react'

import type { ArtworkLayer } from '@/@types/artwork'
import type { Point } from '@/@types/geometry'
import type { ArtworkGeometry, Matrix2D, MeshDeformValue } from '@/@types/mesh'
import { artworkLayerMatrix } from '@/lib/artwork-bone-binding'
import { affineFromTriangles, resolveMeshTriangles, svgMatrix } from '@/lib/mesh-geometry'

export type RenderableArtworkLayer = ArtworkLayer & ArtworkGeometry

export interface ArtworkLayerRendererProps {
  layer: RenderableArtworkLayer
  deformation?: MeshDeformValue['offsets'] | null
  boneWorldMatrix?: Matrix2D | null
  className?: string
  interactive?: boolean
  onPointerDown?: PointerEventHandler<SVGGElement>
}

const polygonPoints = (points: Point[]): string =>
  points.map((point) => `${point.x},${point.y}`).join(' ')

/**
 * Renders a regular artwork layer or a triangle-warped mesh. Clipping is
 * applied in layer-local coordinates and supports both normal and inverse
 * masks.
 */
export function ArtworkLayerRenderer({
  layer,
  deformation,
  boneWorldMatrix,
  className,
  interactive = true,
  onPointerDown
}: ArtworkLayerRendererProps): React.JSX.Element {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const idPrefix = `artwork-layer-${reactId}`
  const clipping = layer.clipping
  const hasClipping = Boolean(clipping?.enabled && clipping.vertices.length >= 3)
  const clippingPoints = clipping ? polygonPoints(clipping.vertices) : ''
  const clipId = `${idPrefix}-clip`
  const maskId = `${idPrefix}-mask`
  const triangles = layer.mesh ? resolveMeshTriangles(layer.mesh, deformation) : []
  const hasRenderableMesh = Boolean(layer.mesh && triangles.length > 0)
  const blendStyle: CSSProperties = {
    mixBlendMode: layer.blendMode as CSSProperties['mixBlendMode']
  }
  const layerMatrix = artworkLayerMatrix(layer, boneWorldMatrix)

  const image = (
    <image
      href={layer.dataUrl}
      x={0}
      y={0}
      width={layer.width}
      height={layer.height}
      preserveAspectRatio="none"
      pointerEvents={interactive ? 'visiblePainted' : 'none'}
    />
  )

  const content = hasRenderableMesh ? (
    <>
      {triangles.map((triangle, index) => {
        const matrix = affineFromTriangles(triangle.source, triangle.destination)
        if (!matrix) return null
        const triangleClipId = `${idPrefix}-triangle-${index}`
        return (
          <g key={triangle.id}>
            <defs>
              <clipPath id={triangleClipId} clipPathUnits="userSpaceOnUse">
                <polygon points={polygonPoints(triangle.destination)} />
              </clipPath>
            </defs>
            <g clipPath={`url(#${triangleClipId})`}>
              <image
                href={layer.dataUrl}
                x={0}
                y={0}
                width={layer.width}
                height={layer.height}
                preserveAspectRatio="none"
                transform={svgMatrix(matrix)}
                pointerEvents={interactive ? 'visiblePainted' : 'none'}
              />
            </g>
          </g>
        )
      })}
    </>
  ) : (
    image
  )

  return (
    <g
      className={className}
      transform={svgMatrix(layerMatrix)}
      opacity={layer.opacity}
      style={blendStyle}
      pointerEvents={interactive ? 'visiblePainted' : 'none'}
      onPointerDown={onPointerDown}
    >
      {hasClipping ? (
        <defs>
          {clipping?.inverted ? (
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              x={0}
              y={0}
              width={layer.width}
              height={layer.height}
            >
              <rect x={0} y={0} width={layer.width} height={layer.height} fill="white" />
              <polygon points={clippingPoints} fill="black" />
            </mask>
          ) : (
            <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
              <polygon points={clippingPoints} />
            </clipPath>
          )}
        </defs>
      ) : null}
      <g
        clipPath={hasClipping && !clipping?.inverted ? `url(#${clipId})` : undefined}
        mask={hasClipping && clipping?.inverted ? `url(#${maskId})` : undefined}
      >
        {content}
      </g>
    </g>
  )
}
