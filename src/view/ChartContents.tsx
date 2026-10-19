import { memo, useMemo } from 'react'
import type { Relationship } from '../domain/labels.ts'
import type { Person } from '../domain/schema.ts'
import { formatList } from '../i18n/format.ts'
import { DIRECTION, useLanguageStore } from '../i18n/language.ts'
import { msg, renderMessage } from '../i18n/messageRef.ts'
import { useT } from '../i18n/useT.ts'
import { useLabeler } from '../ui/useLabeler.ts'
import { type ChartScene, selectVisibleChart } from './chartScene.ts'
import { CARD_H, ROW_STEP } from './geometry.ts'
import type { LodBucket } from './lod.ts'
import { CHART } from './palette.ts'
import { ChartDefs, type Kin, PersonCard } from './PersonCard.tsx'
import type { PhotoUrlFor } from './TreeCanvas.tsx'
import { directionOf, displayName, initialOf, lifeSpan, personAriaLabel } from './text.ts'
import type { Rect } from './viewport.ts'

interface Drawn {
  bucket: LodBucket
  rect: Rect
}

export interface ChartContentsProps {
  scene: ChartScene
  persons: Person[]
  relationships: ReadonlyMap<string, Relationship>
  focusIndex: number
  selectedIndex: number
  cursorIndex: number
  /** While a Person is open: their kin and themself. Everyone else is drawn faint. `null`: nobody is dimmed. */
  brightIds: ReadonlySet<string> | null
  /** How the others are related to the open Person. */
  ancestors: ReadonlySet<string>
  descendants: ReadonlySet<string>
  partners: ReadonlySet<string>
  photoUrlFor?: PhotoUrlFor
  photoVersion: number
  drawn: Drawn
}

const BAND_PAD_TOP = 30
const BAND_PAD_BOTTOM = 24

/** The rows behind the cards: one band per generation, labelled with its number and how many people are on it. */
const Bands = memo(function Bands({ scene }: { scene: ChartScene }) {
  const t = useT()
  // the label sits at the start of the band: its left end, or its right end when the page reads right to left
  const rtl = DIRECTION[useLanguageStore((s) => s.language)] === 'rtl'
  const { layout } = scene
  const counts = useMemo(() => {
    const result = new Array<number>(layout.count > 0 ? layout.maxGeneration + 1 : 0).fill(0)
    for (let i = 0; i < layout.count; i++) result[layout.generation[i]!]!++
    return result
  }, [layout])
  const { x0, x1 } = layout.bounds
  return (
    <g aria-hidden="true">
      {counts.map((count, g) => {
        const top = g * ROW_STEP - CARD_H / 2 - BAND_PAD_TOP
        return (
          <g key={g}>
            <rect
              x={x0}
              y={top}
              width={x1 - x0}
              height={CARD_H + BAND_PAD_TOP + BAND_PAD_BOTTOM}
              fill={g % 2 === 0 ? CHART.bandA : CHART.bandB}
              stroke={CHART.bandLine}
              strokeWidth={1}
            />
            <text x={rtl ? x1 - 16 : x0 + 16} y={top + 16} textAnchor="start" direction={rtl ? 'rtl' : 'ltr'} fontSize={12} fontWeight={700} letterSpacing={rtl ? 0 : 0.5} fill={CHART.soft}>
              {t('tree.generationRow', { n: g + 1, people: renderMessage(t, msg('common.people', { count })) })}
            </text>
          </g>
        )
      })}
    </g>
  )
})

/** The button on a family's connector: "−" collapses the branch, "+N" shows how many people it hides. */
const BranchChip = memo(function BranchChip({ groupKey, x, y, collapsed, hidden, label }: { groupKey: string; x: number; y: number; collapsed: boolean; hidden: number; label: string }) {
  return (
    <g transform={`translate(${x} ${y})`} data-chip-key={groupKey} role="button" aria-label={label} aria-expanded={!collapsed} tabIndex={-1} style={{ cursor: 'pointer' }}>
      {/* a 44 px target around the drawn button (spec section 8) */}
      <rect x={-26} y={-22} width={52} height={44} fill="transparent" />
      {collapsed ? (
        <>
          <rect x={-21} y={-12} width={42} height={24} rx={12} fill="#ffffff" stroke={CHART.borderStrong} strokeWidth={1.5} />
          <text textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700} fill={CHART.ink} pointerEvents="none">
            {`+${hidden}`}
          </text>
        </>
      ) : (
        <>
          <circle r={12} fill="#ffffff" stroke={CHART.borderStrong} strokeWidth={1.5} />
          <path d="M-5,0H5" stroke={CHART.ink} strokeWidth={2.2} strokeLinecap="round" pointerEvents="none" />
        </>
      )}
    </g>
  )
})

interface CardText {
  name: string
  direction: 'ltr' | 'rtl'
  initial: string
  life: string
  aria: string
}

/** Everything of the chart that depends on what is on screen. Re-rendered only when `drawn` changes, never per pan frame. */
export const ChartContents = memo(function ChartContents({
  scene,
  persons,
  relationships,
  focusIndex,
  selectedIndex,
  cursorIndex,
  brightIds,
  ancestors,
  descendants,
  partners,
  photoUrlFor,
  drawn,
}: ChartContentsProps) {
  const t = useT()
  const language = useLanguageStore((s) => s.language)
  const labelOf = useLabeler(relationships)
  const { layout } = scene
  const { bucket, rect } = drawn
  // a card looks the same from full to "no leaves" (there are no leaves on the chart), so crossing that edge redraws nothing
  const cardBucket: LodBucket = bucket === 'noLeaves' ? 'full' : bucket
  const visible = useMemo(() => {
    const picked = selectVisibleChart(scene, rect)
    if (cursorIndex >= 0 && !picked.persons.includes(cursorIndex)) {
      picked.persons = [...picked.persons, cursorIndex].sort((a, b) => a - b)
    }
    return picked
  }, [scene, rect, cursorIndex])

  const lines = useMemo(() => {
    let solid = ''
    let dashed = ''
    for (const group of visible.groups) {
      solid += group.solid
      dashed += group.dashed
    }
    let steps = ''
    for (const step of visible.steps) steps += step.path
    let current = ''
    let ended = ''
    for (const e of visible.partners) {
      if (layout.partnerEnded[e]) ended += scene.partnerPaths[e]
      else current += scene.partnerPaths[e]
    }
    return { solid, dashed, steps, current, ended }
  }, [scene, layout, visible])

  // The words of a card and of a branch button are made once for as long as the Tree, the labels and the Language stay
  // the same, not at every redraw (the lists and plurals behind them are not free, and a redraw runs while zooming).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the dependencies are what the cached words are made from
  const cardText = useMemo(() => new Map<number, CardText>(), [persons, relationships, language, t, focusIndex, labelOf])
  const textOf = (i: number): CardText => {
    let text = cardText.get(i)
    if (!text) {
      const person = persons[i]!
      const name = displayName(person)
      text = {
        name,
        direction: directionOf(name),
        initial: initialOf(person),
        life: lifeSpan(person, t),
        aria: personAriaLabel(person, labelOf(person), i === focusIndex, { t, language }),
      }
      cardText.set(i, text)
    }
    return text
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- as above
  const chipLabel = useMemo(() => new Map<string, string>(), [persons, scene, language, t])
  const labelOfChip = (group: ChartScene['groups'][number]): string => {
    const key = `${group.key}:${group.collapsed ? group.hiddenCount : 'open'}`
    let label = chipLabel.get(key)
    if (label === undefined) {
      const names = formatList(
        group.parents.map((i) => persons[i]?.firstName ?? ''),
        language,
      )
      label = group.collapsed
        ? t('tree.chipExpand', { names, hidden: renderMessage(t, msg('common.people', { count: group.hiddenCount })) })
        : t('tree.chipCollapse', { names })
      chipLabel.set(key, label)
    }
    return label
  }

  return (
    <>
      <ChartDefs />
      <Bands scene={scene} />
      <g aria-hidden="true" fill="none" strokeLinecap="round">
        <path d={lines.solid} stroke={CHART.line} strokeWidth={2} />
        <path d={lines.dashed} stroke={CHART.line} strokeWidth={2} strokeDasharray="8 6" />
        <path d={lines.steps} stroke={CHART.line} strokeWidth={2} strokeDasharray="2 6" />
        <path d={lines.current} stroke={CHART.partner} strokeWidth={4} />
        <path d={lines.ended} stroke={CHART.partnerEnded} strokeWidth={3.5} strokeDasharray="8 7" />
      </g>
      {visible.persons.map((i) => {
        const person = persons[i]
        if (!person) return null
        const text = textOf(i)
        const isSelected = i === selectedIndex
        const kin: Kin = ancestors.has(person.id) ? 'ancestor' : descendants.has(person.id) ? 'descendant' : null
        const tag = isSelected
          ? t('tree.tag.selected')
          : kin === 'ancestor'
            ? t('tree.tag.ancestor')
            : kin === 'descendant'
              ? t('tree.tag.descendant')
              : partners.has(person.id)
                ? t('tree.tag.partner')
                : i === focusIndex
                  ? t('person.focus')
                  : ''
        return (
          <PersonCard
            key={person.id}
            id={person.id}
            x={layout.x[i]!}
            y={layout.y[i]!}
            bucket={cardBucket}
            name={text.name}
            nameDirection={text.direction}
            initial={text.initial}
            life={text.life}
            lifeDirection={DIRECTION[language]}
            ariaLabel={text.aria}
            deceased={person.deceased}
            isFocus={i === focusIndex}
            isSelected={isSelected}
            isCurrent={i === cursorIndex}
            isDimmed={brightIds !== null && !brightIds.has(person.id)}
            kin={kin}
            tag={tag}
            photoUrl={person.photoId && (bucket === 'full' || bucket === 'noLeaves') ? photoUrlFor?.(person.photoId, bucket === 'full' ? 'full' : 'thumb') : undefined}
          />
        )
      })}
      {(bucket === 'full' || bucket === 'noLeaves') &&
        visible.groups.map((group) => (
          <BranchChip
            key={group.key}
            groupKey={group.key}
            x={group.chip.x}
            y={group.chip.y}
            collapsed={group.collapsed}
            hidden={group.hiddenCount}
            label={labelOfChip(group)}
          />
        ))}
    </>
  )
})
