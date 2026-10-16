import { memo } from 'react'
import type { Gender } from '../domain/schema.ts'
import { NODE_RADIUS } from './geometry.ts'
import type { LodBucket } from './lod.ts'
import { PALETTE } from './palette.ts'
import { hashId } from './text.ts'

/** Radius of the dot a Person shrinks to when zoomed far out. */
export const DOT_RADIUS = 48

export interface PersonNodeProps {
  id: string
  x: number
  y: number
  bucket: LodBucket
  name: string
  initial: string
  life: string
  gender: Gender
  deceased: boolean
  isFocus: boolean
  /** Object URL of the Person's photo. Set by the Photos ticket; without it the default figure is drawn. */
  photoUrl?: string
}

const ringColor = (gender: Gender, deceased: boolean) =>
  deceased ? PALETTE.ringDeceased[gender] : PALETTE.ring[gender]

/** Two decorative leaves near the medallion, placed from the id so they stay put when the Tree changes. */
function leavesFor(id: string) {
  const hash = hashId(id)
  return [0, 1].map((n) => {
    const angle = (((hash >>> (n * 8)) & 255) / 255) * Math.PI * 2
    const distance = NODE_RADIUS + 6 + (((hash >>> (n * 8 + 4)) & 15) / 15) * 10
    return {
      cx: Math.cos(angle) * distance,
      cy: Math.sin(angle) * distance,
      rotate: (angle * 180) / Math.PI,
    }
  })
}

function Figure({ gender }: { gender: Gender }) {
  return (
    <g fill={PALETTE.figure} aria-hidden="true">
      <circle cy={-9} r={7} />
      {gender === 'female' ? (
        <path d="M0,-2L-11,18H11Z" />
      ) : gender === 'male' ? (
        <rect x={-8} y={-2} width={16} height={19} rx={5} />
      ) : (
        <ellipse cy={9} rx={10} ry={8} />
      )}
    </g>
  )
}

/**
 * One Person's medallion. All props are primitives, so a Person is re-rendered only when something about them
 * changed, not when anyone else did.
 */
export const PersonNode = memo(function PersonNode(props: PersonNodeProps) {
  const { id, x, y, bucket, name, initial, life, gender, deceased, isFocus, photoUrl } = props
  const ring = ringColor(gender, deceased)

  if (bucket === 'dot') {
    return <circle data-person-id={id} cx={x} cy={y} r={DOT_RADIUS} fill={ring} />
  }

  if (bucket === 'initial') {
    return (
      <g data-person-id={id} transform={`translate(${x} ${y})`}>
        {isFocus && <circle r={NODE_RADIUS + 10} fill="none" stroke={PALETTE.focus} strokeWidth={4} />}
        <circle r={NODE_RADIUS} fill={PALETTE.medallion} stroke={ring} strokeWidth={6} />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={30}
          fontWeight={600}
          fill={PALETTE.name}
          aria-hidden="true"
        >
          {initial}
        </text>
      </g>
    )
  }

  return (
    <g data-person-id={id} transform={`translate(${x} ${y})`}>
      {bucket === 'full' && (
        <g aria-hidden="true" fill={PALETTE.leaf}>
          {leavesFor(id).map((leaf, n) => (
            <ellipse key={n} cx={leaf.cx} cy={leaf.cy} rx={9} ry={4.5} transform={`rotate(${leaf.rotate} ${leaf.cx} ${leaf.cy})`} />
          ))}
        </g>
      )}
      {isFocus && <circle r={NODE_RADIUS + 10} fill="none" stroke={PALETTE.focus} strokeWidth={4} />}
      <circle r={NODE_RADIUS} fill={PALETTE.medallion} stroke={ring} strokeWidth={6} />
      {photoUrl ? (
        <>
          <clipPath id={`photo-${id}`}>
            <circle r={NODE_RADIUS - 3} />
          </clipPath>
          <image
            href={photoUrl}
            x={-(NODE_RADIUS - 3)}
            y={-(NODE_RADIUS - 3)}
            width={2 * (NODE_RADIUS - 3)}
            height={2 * (NODE_RADIUS - 3)}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#photo-${id})`}
            aria-hidden="true"
          />
        </>
      ) : (
        <Figure gender={gender} />
      )}
      {deceased && (
        <g transform={`translate(${NODE_RADIUS - 6} ${NODE_RADIUS - 6})`} aria-hidden="true">
          <circle r={9} fill={PALETTE.ringDeceased[gender]} stroke={PALETTE.medallion} strokeWidth={2} />
          <path d="M0,-5V5M-3.5,-2H3.5" stroke={PALETTE.medallion} strokeWidth={2} fill="none" />
        </g>
      )}
      <text y={NODE_RADIUS + 20} textAnchor="middle" fontSize={15} fontWeight={600} fill={PALETTE.name}>
        {name}
      </text>
      {life && (
        <text y={NODE_RADIUS + 37} textAnchor="middle" fontSize={12.5} fill={PALETTE.dates}>
          {life}
        </text>
      )}
    </g>
  )
})
