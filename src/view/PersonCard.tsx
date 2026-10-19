import { type ReactNode, memo } from 'react'
import { CARD_H, CARD_W } from './geometry.ts'
import type { LodBucket } from './lod.ts'
import { CHART } from './palette.ts'

const HALF_W = CARD_W / 2
const HALF_H = CARD_H / 2
const AVATAR_R = 18
const AVATAR_X = -HALF_W + 12 + AVATAR_R
const TEXT_START = -HALF_W + 12 + 2 * AVATAR_R + 10
const TEXT_END = HALF_W - 10
/** The clip every card's text sits in, so a long name stops at the edge of its card. Defined once by `ChartDefs`. */
export const CARD_TEXT_CLIP = 'chart-card-text'

/** Radius of the dot a Person shrinks to when zoomed far out, and of the initial's circle. */
const DOT_RADIUS = 48
const INITIAL_RADIUS = 32

export type Kin = 'ancestor' | 'descendant' | null

export interface PersonCardProps {
  id: string
  x: number
  y: number
  bucket: LodBucket
  name: string
  /** The direction the name reads, from its own first letter: the Person's, not the page's. */
  nameDirection?: 'ltr' | 'rtl'
  initial: string
  life: string
  /** The direction the dates line reads: the page's (the Language's). */
  lifeDirection?: 'ltr' | 'rtl'
  /** What a screen reader says: "Maria, mother, born 1962". */
  ariaLabel: string
  deceased: boolean
  isFocus: boolean
  isSelected: boolean
  /** The keyboard's place in the tree: the one Person in the tab order (spec section 7). */
  isCurrent: boolean
  /** Someone else is open and this Person is not one of their kin: drawn faint (spec section 8). */
  isDimmed?: boolean
  /** How this Person is related to the open one, drawn as an outline and a word, never a colour alone. */
  kin?: Kin
  /** The word under the dates: Selected, Ancestor, Descendant, Partner, or Focus person. Empty: none. */
  tag?: string
  photoUrl?: string
}

/** The keyboard focus ring: white under dark, so it shows on any background. Drawn only while focused (index.css). */
function CardCursorRing({ pad }: { pad: number }) {
  const box = { x: -HALF_W - pad, y: -HALF_H - pad, width: CARD_W + 2 * pad, height: CARD_H + 2 * pad, rx: 16 + pad }
  return (
    <g className="cursor-ring" aria-hidden="true" fill="none">
      <rect {...box} stroke="#ffffff" strokeWidth={10} />
      <rect {...box} stroke="#111111" strokeWidth={4} />
    </g>
  )
}

/** The clip path every card uses; drawn once inside the chart's `<defs>`. */
export function ChartDefs() {
  return (
    <defs>
      <clipPath id={CARD_TEXT_CLIP}>
        <rect x={TEXT_START - 4} y={-HALF_H} width={TEXT_END - TEXT_START + 8} height={CARD_H} />
      </clipPath>
    </defs>
  )
}

/**
 * One Person as a card on the chart: an avatar or initial, the name, the years, and a word when they are related to
 * the open Person. All props are primitives, so a card is re-rendered only when something about them changed. It is a
 * button that opens the Person; only the keyboard's current Person is in the tab order. As zoom falls it shrinks: the
 * card, then the name without the tag, then the initial in a circle, then a dot.
 */
export const PersonCard = memo(function PersonCard(props: PersonCardProps) {
  const { id, x, y, bucket, name, initial, life, ariaLabel, deceased, isFocus, isSelected, isCurrent, isDimmed, kin, tag, photoUrl } = props
  const { nameDirection = 'ltr', lifeDirection = 'ltr' } = props
  const button = {
    'data-person-id': id,
    role: 'button',
    'aria-label': ariaLabel,
    'aria-current': isSelected ? ('true' as const) : undefined,
    tabIndex: isCurrent ? 0 : -1,
  }
  const outline = isSelected ? CHART.selected : kin === 'ancestor' ? CHART.ancestor : kin === 'descendant' ? CHART.descendant : CHART.border
  const outlineWidth = isSelected || kin ? 3 : 1.5
  const fill = isSelected ? CHART.selected : CHART.card
  const ink = isSelected ? '#ffffff' : CHART.ink
  const soft = isSelected ? '#ffffff' : CHART.soft
  const place = (children: ReactNode) => (
    <g transform={`translate(${x} ${y})`} data-person-wrapper="" opacity={isDimmed ? 0.35 : undefined}>
      {children}
    </g>
  )

  if (bucket === 'dot') {
    return place(
      <g {...button}>
        <circle r={DOT_RADIUS} fill={isSelected ? CHART.selected : CHART.avatarInk} />
        <CardCursorRing pad={14} />
      </g>,
    )
  }

  if (bucket === 'initial') {
    return place(
      <>
        <g {...button}>
          {isFocus && <circle r={INITIAL_RADIUS + 9} fill="none" stroke={CHART.focus} strokeWidth={4} aria-hidden="true" />}
          <circle r={INITIAL_RADIUS} fill={fill} stroke={outline} strokeWidth={outlineWidth + 1.5} strokeDasharray={deceased ? '8 5' : undefined} />
          <CardCursorRing pad={14} />
        </g>
        <text textAnchor="middle" dominantBaseline="central" fontSize={30} fontWeight={600} fill={ink} aria-hidden="true" pointerEvents="none">
          {initial}
        </text>
      </>,
    )
  }

  // `start` follows the text's own direction: for a right-to-left name it is the right edge, so that is where it is anchored
  const rtl = nameDirection === 'rtl'
  const anchorX = rtl ? TEXT_END : TEXT_START
  const withTag = bucket === 'full' && Boolean(tag)
  const nameY = withTag ? -11 : life ? -6 : 0
  return place(
    <>
      <g {...button}>
        {isFocus && (
          <rect x={-HALF_W - 6} y={-HALF_H - 6} width={CARD_W + 12} height={CARD_H + 12} rx={18} fill="none" stroke={CHART.focus} strokeWidth={4} aria-hidden="true" />
        )}
        <rect
          x={-HALF_W}
          y={-HALF_H}
          width={CARD_W}
          height={CARD_H}
          rx={12}
          fill={fill}
          stroke={outline}
          strokeWidth={outlineWidth}
          strokeDasharray={deceased && !isSelected ? '7 5' : undefined}
        />
        <CardCursorRing pad={7} />
      </g>
      <g aria-hidden="true" pointerEvents="none">
        {photoUrl ? (
          <>
            <clipPath id={`photo-${id}`}>
              <circle cx={AVATAR_X} r={AVATAR_R} />
            </clipPath>
            <image
              href={photoUrl}
              x={AVATAR_X - AVATAR_R}
              y={-AVATAR_R}
              width={2 * AVATAR_R}
              height={2 * AVATAR_R}
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#photo-${id})`}
            />
          </>
        ) : (
          <>
            <circle cx={AVATAR_X} r={AVATAR_R} fill={isSelected ? 'rgba(255,255,255,0.22)' : CHART.avatar} />
            <text x={AVATAR_X} textAnchor="middle" dominantBaseline="central" fontSize={17} fontWeight={600} fill={isSelected ? '#ffffff' : CHART.avatarInk}>
              {initial}
            </text>
          </>
        )}
        <g clipPath={`url(#${CARD_TEXT_CLIP})`}>
          {/* each line is embedded in its own direction: the name's is the Person's own, the dates follow the page */}
          <text x={anchorX} y={nameY} textAnchor="start" dominantBaseline="central" direction={nameDirection} unicodeBidi="embed" fontSize={14} fontWeight={600} fill={ink}>
            {name}
          </text>
          {life && (
            <text x={anchorX} y={nameY + 17} textAnchor="start" dominantBaseline="central" direction={lifeDirection} unicodeBidi="embed" fontSize={12} fill={soft}>
              {life}
            </text>
          )}
          {withTag && (
            <text x={anchorX} y={nameY + 32} textAnchor="start" dominantBaseline="central" fontSize={10.5} fontWeight={700} letterSpacing={0.4} fill={soft}>
              {tag}
            </text>
          )}
        </g>
        {deceased && (
          <path d={`M${HALF_W - 14},${-HALF_H + 8}v10M${HALF_W - 19},${-HALF_H + 12}h10`} stroke={soft} strokeWidth={2} strokeLinecap="round" fill="none" />
        )}
      </g>
    </>,
  )
})
