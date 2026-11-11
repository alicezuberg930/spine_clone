import { useMemo } from 'react'

import type { Bone } from '@/@types'
import { resolveBoneSegments } from '@/lib/skeleton-geometry'

interface ArtworkSkeletonOverlayProps {
  bones: Bone[]
  selectedBoneId: string
  viewportScale: number
  interactive?: boolean
  onSelectBone?: (id: string) => void
}

export function ArtworkSkeletonOverlay({
  bones,
  selectedBoneId,
  viewportScale,
  interactive = false,
  onSelectBone
}: ArtworkSkeletonOverlayProps): React.JSX.Element | null {
  const segments = useMemo(() => resolveBoneSegments(bones), [bones])

  if (segments.length === 0) return null

  const scale = Math.max(0.001, viewportScale)
  const lineWidth = 3 / scale
  const jointRadius = 4.5 / scale
  const hitWidth = Math.max(lineWidth * 6, 14 / scale)

  return (
    <g data-editor-only="bones" pointerEvents="none">
      {segments.map((segment) => {
        const selected = segment.id === selectedBoneId
        const color = selected ? '#fff2a8' : segment.color || '#f7c860'
        return (
          <g
            key={segment.id}
            aria-label={`Bone ${segment.name}`}
            data-selection-id={interactive ? segment.id : undefined}
            data-bone-selection-id={interactive ? segment.id : undefined}
            onPointerDown={
              interactive && onSelectBone
                ? (event) => {
                    if (event.button !== 0) return
                    event.stopPropagation()
                    onSelectBone(segment.id)
                  }
                : undefined
            }
          >
            {interactive ? (
              <>
                <line
                  x1={segment.start.x}
                  y1={segment.start.y}
                  x2={segment.end.x}
                  y2={segment.end.y}
                  stroke="transparent"
                  strokeWidth={hitWidth}
                  strokeLinecap="round"
                  pointerEvents="stroke"
                  className="cursor-pointer"
                />
                <circle
                  cx={segment.start.x}
                  cy={segment.start.y}
                  r={hitWidth / 2}
                  fill="transparent"
                  pointerEvents="all"
                  className="cursor-pointer"
                />
                <circle
                  cx={segment.end.x}
                  cy={segment.end.y}
                  r={hitWidth / 2}
                  fill="transparent"
                  pointerEvents="all"
                  className="cursor-pointer"
                />
              </>
            ) : null}
            <line
              x1={segment.start.x}
              y1={segment.start.y}
              x2={segment.end.x}
              y2={segment.end.y}
              stroke="#081116"
              strokeWidth={lineWidth * 2.25}
              strokeLinecap="round"
              pointerEvents="none"
            />
            <line
              x1={segment.start.x}
              y1={segment.start.y}
              x2={segment.end.x}
              y2={segment.end.y}
              stroke={color}
              strokeWidth={selected ? lineWidth * 1.35 : lineWidth}
              strokeLinecap="round"
              pointerEvents="none"
            />
            <circle
              cx={segment.start.x}
              cy={segment.start.y}
              r={selected ? jointRadius * 1.25 : jointRadius}
              fill="#0d171d"
              stroke={color}
              strokeWidth={lineWidth * 0.65}
              pointerEvents="none"
            />
            <circle
              cx={segment.end.x}
              cy={segment.end.y}
              r={jointRadius * 0.75}
              fill="#0d171d"
              stroke={color}
              strokeWidth={lineWidth * 0.55}
              pointerEvents="none"
            />
          </g>
        )
      })}
    </g>
  )
}
