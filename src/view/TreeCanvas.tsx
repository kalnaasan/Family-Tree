import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import { relativesOf } from '../domain/groups.ts'
import { kinOf } from '../domain/kin.ts'
import type { Relationship } from '../domain/labels.ts'
import { type NavKey, type NavMemory, describeMove, freshMemory, move } from '../domain/navigation.ts'
import type { ParentLink, Partnership, Person } from '../domain/schema.ts'
import { DIRECTION, useLanguageStore } from '../i18n/language.ts'
import { msg, renderMessage } from '../i18n/messageRef.ts'
import { useT } from '../i18n/useT.ts'
import type { TreeLayout } from '../layout/layoutTree.ts'
import { useLabeler } from '../ui/useLabeler.ts'
import { type ChartScene, type GroupInfo, buildChartScene } from './chartScene.ts'
import { ChartContents } from './ChartContents.tsx'
import { HEART_PATH, rootPaths, trunkPath } from './geometry.ts'
import { GestureTracker, ZOOM_OUT_OF_DOT, resolveTap } from './gestures.ts'
import { type LodBucket, lodBucket } from './lod.ts'
import { CHART, PALETTE } from './palette.ts'
import { PersonNode } from './PersonNode.tsx'
import { type Scene, buildScene, selectVisible } from './scene.ts'
import { directionOf, displayName, initialOf, lifeSpan, personAriaLabel } from './text.ts'
import { ViewController } from './viewController.ts'
import {
  CHART_MIN_OPEN_ZOOM,
  READABLE_ZOOM,
  type Rect,
  type Size,
  growRect,
  openingView,
  rectContains,
  visibleRect,
} from './viewport.ts'

/** The part of the world that is drawn, as a multiple of the screen, and when to redraw it. */
const DRAW_MARGIN = 0.6
const REDRAW_MARGIN = 0.25
const KEY_ZOOM = 1.25
const KEY_PAN_PX = 80

interface Drawn {
  bucket: LodBucket
  rect: Rect
}

const TRUNK = trunkPath()
const ROOTS = rootPaths()

const Decor = memo(function Decor() {
  return (
    <g aria-hidden="true">
      <g fill={PALETTE.root}>
        {ROOTS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <path d={TRUNK} fill={PALETTE.trunk} />
    </g>
  )
})

interface SceneContentsProps {
  scene: Scene
  persons: Person[]
  relationships: ReadonlyMap<string, Relationship>
  focusIndex: number
  selectedIndex: number
  /** The keyboard's Person: always drawn, even outside the drawn area, because it is the tab stop. */
  cursorIndex: number
  /** While a Person is open: their relatives and themself. Everyone else is drawn faint. `null`: nobody is dimmed. */
  brightIds: ReadonlySet<string> | null
  photoUrlFor?: PhotoUrlFor
  /** Changes when a photo becomes ready, so the Persons are drawn again with it. */
  photoVersion: number
  drawn: Drawn
}

/** The object URL of a Person's photo at the detail level asked for, once it is loaded (see `photoCache`). */
export type PhotoUrlFor = (photoId: string, variant: 'full' | 'thumb') => string | undefined

/** Everything that depends on what is on screen. Re-rendered only when `drawn` changes, never per pan frame. */
const SceneContents = memo(function SceneContents({
  scene,
  persons,
  relationships,
  focusIndex,
  selectedIndex,
  cursorIndex,
  brightIds,
  photoUrlFor,
  drawn,
}: SceneContentsProps) {
  const t = useT()
  const language = useLanguageStore((s) => s.language)
  // only the people drawn are worded, and in the language in use
  const labelOf = useLabeler(relationships)
  const { layout } = scene
  const { bucket, rect } = drawn
  const visible = useMemo(() => {
    const selected = selectVisible(scene, rect)
    if (cursorIndex >= 0 && !selected.persons.includes(cursorIndex)) {
      selected.persons = [...selected.persons, cursorIndex].sort((a, b) => a - b)
    }
    return selected
  }, [scene, rect, cursorIndex])

  const lines = useMemo(() => {
    let branches = ''
    for (const e of visible.branches) branches += scene.branchPath(e)
    for (const p of visible.roots) branches += scene.rootBranchPath(p)
    let steps = ''
    for (const e of visible.stepBranches) {
      const child = layout.parentEdges[2 * e]!
      const parent = layout.parentEdges[2 * e + 1]!
      steps += `M${layout.x[parent]},${layout.y[parent]}L${layout.x[child]},${layout.y[child]}`
    }
    let current = ''
    let ended = ''
    const hearts: { key: number; x: number; y: number }[] = []
    for (const e of visible.partners) {
      const a = layout.partnerEdges[2 * e]!
      const b = layout.partnerEdges[2 * e + 1]!
      const segment = `M${layout.x[a]},${layout.y[a]}L${layout.x[b]},${layout.y[b]}`
      if (layout.partnerEnded[e]) {
        ended += segment
      } else {
        current += segment
        hearts.push({ key: e, x: (layout.x[a]! + layout.x[b]!) / 2, y: (layout.y[a]! + layout.y[b]!) / 2 })
      }
    }
    return { branches, steps, current, ended, hearts }
  }, [scene, layout, visible])

  const showHearts = bucket === 'full' || bucket === 'noLeaves'
  return (
    <>
      <g aria-hidden="true">
        <path d={lines.branches} fill={PALETTE.branch} />
        {lines.steps && <path d={lines.steps} fill="none" stroke={PALETTE.branch} strokeWidth={2.5} strokeDasharray="3 7" />}
        {lines.current && <path d={lines.current} fill="none" stroke={PALETTE.partner} strokeWidth={4} />}
        {lines.ended && (
          <path d={lines.ended} fill="none" stroke={PALETTE.partnerEnded} strokeWidth={3.5} strokeDasharray="8 7" />
        )}
        {showHearts &&
          lines.hearts.map((heart) => (
            <path key={heart.key} d={HEART_PATH} fill={PALETTE.heart} transform={`translate(${heart.x} ${heart.y})`} />
          ))}
      </g>
      {visible.persons.map((i) => {
        const person = persons[i]
        if (!person) return null
        const name = displayName(person) // once: cutting a name at whole letters is not free
        return (
          <PersonNode
            key={person.id}
            id={person.id}
            x={layout.x[i]!}
            y={layout.y[i]!}
            bucket={bucket}
            name={name}
            nameDirection={directionOf(name)}
            initial={initialOf(person)}
            life={lifeSpan(person, t)}
            lifeDirection={DIRECTION[language]}
            ariaLabel={personAriaLabel(person, labelOf(person), i === focusIndex, { t, language })}
            gender={person.gender}
            deceased={person.deceased}
            isFocus={i === focusIndex}
            isSelected={i === selectedIndex}
            isCurrent={i === cursorIndex}
            isDimmed={brightIds !== null && !brightIds.has(person.id)}
            // photos are drawn from the "no leaves" level up; the 192 px copy does for the smaller medallions
            photoUrl={
              person.photoId && (bucket === 'full' || bucket === 'noLeaves')
                ? photoUrlFor?.(person.photoId, bucket === 'full' ? 'full' : 'thumb')
                : undefined
            }
          />
        )
      })}
    </>
  )
})

export interface TreeCanvasProps {
  layout: TreeLayout
  /** In the same order as `layout.ids`. */
  persons: Person[]
  focusPersonId: string | null
  /** The links the arrow keys follow. Without them the keys only zoom and pan. */
  links?: { parentLinks: ParentLink[]; partnerships: Partnership[]; /** Everyone, also those inside collapsed branches: the keys can lead there. Default: `persons`. */ persons?: Person[] }
  /** Each Person's Relationship descriptor, worded for the names screen readers read when they are drawn. */
  relationships?: ReadonlyMap<string, Relationship>
  /** `F` on a Person makes them the Focus person. */
  onSetFocusPerson?: (id: string) => void
  /** The open Person, drawn with a ring. */
  selectedPersonId?: string | null
  /** A click or tap (little movement) on a Person, or on empty space (`null`). */
  onSelectPerson?: (id: string | null) => void
  /** Pixels at the bottom of the canvas that a sheet covers: the open Person is kept in the part that is left. */
  coveredBottom?: number
  /** Hides the zoom and fit buttons, for when the expanded sheet leaves no room for them. */
  hideControls?: boolean
  /** Pan to this Person, at the same zoom, each time `seq` changes (picking a search result). */
  revealRequest?: { id: string; seq: number } | null
  /** Where the Persons' photos come from. Without it everyone is drawn with the default figure. */
  photoUrlFor?: PhotoUrlFor
  photoVersion?: number
  /** Draws no decorative detail at any zoom: for a Tree at the hard limit (spec section 9). */
  reducedDetail?: boolean
  /** The chart: the whole Tree's branch groups, with which are collapsed, for the buttons on the connectors. */
  groups?: GroupInfo[]
  onToggleBranch?: (key: string) => void
  onExpandAll?: () => void
  onCollapseAll?: () => void
  /** A Person the keyboard moved to may be inside a collapsed branch: this asks for the way to them to be opened. */
  onEnsureShown?: (personId: string) => void
}

/**
 * The pan/zoom canvas. The view lives in a `ViewController` and is written straight onto one `<g>`, so dragging
 * and zooming never re-render React. React re-renders only when the level of detail changes or the screen leaves
 * the part of the Tree that is drawn (spec section 9).
 */
const NO_RELATIONSHIPS: ReadonlyMap<string, Relationship> = new Map()
const EMPTY_IDS: ReadonlySet<string> = new Set()

/**
 * What a key means for moving along family links. Up and down are a parent and a child whatever the page reads like;
 * left and right are the previous and next sibling in the direction it reads, so under right-to-left the arrow
 * pointing the way Arabic reads (left) is "next" (spec section 13.2). Shift with an arrow pans, and stays physical.
 */
function navKeyFor(key: string, direction: 'ltr' | 'rtl'): NavKey | undefined {
  switch (key) {
    case 'ArrowUp':
      return 'up'
    case 'ArrowDown':
      return 'down'
    case 'ArrowRight':
      return direction === 'rtl' ? 'previous' : 'next'
    case 'ArrowLeft':
      return direction === 'rtl' ? 'next' : 'previous'
    case 'p':
    case 'P':
      return 'partner'
    default:
      return undefined
  }
}

export function TreeCanvas({
  layout,
  persons,
  focusPersonId,
  links,
  relationships = NO_RELATIONSHIPS,
  onSetFocusPerson,
  selectedPersonId = null,
  onSelectPerson,
  coveredBottom = 0,
  hideControls = false,
  revealRequest = null,
  photoUrlFor,
  photoVersion = 0,
  reducedDetail = false,
  groups,
  onToggleBranch,
  onExpandAll,
  onCollapseAll,
  onEnsureShown,
}: TreeCanvasProps) {
  const reducedRef = useRef(reducedDetail)
  const hintId = useId()
  const frameRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<SVGGElement>(null)
  const controllerRef = useRef<ViewController | null>(null)
  const syncRef = useRef<() => void>(() => {})
  const sizeRef = useRef<Size>({ width: 0, height: 0 })
  const layoutRef = useRef(layout)
  const focusRef = useRef(focusPersonId)
  const openedRef = useRef(false)
  const coveredRef = useRef(coveredBottom)
  const gestures = useRef(new GestureTracker())
  /** The Person under the first finger when it went down, read before pointer capture redirects events. */
  const pressedPerson = useRef<string | null>(null)
  /** The branch button under the first finger when it went down: a press on it toggles the branch instead of selecting. */
  const pressedChip = useRef<string | null>(null)
  /** A Person the keyboard moved to who was inside a collapsed branch: shown and focused once the layout has them. */
  const pendingShown = useRef<string | null>(null)
  const [drawn, setDrawn] = useState<Drawn | null>(null)

  const rows = layout.shape === 'rows'
  const scene = useMemo(() => buildScene(layout), [layout])
  const chartScene = useMemo<ChartScene | null>(() => (rows ? buildChartScene(layout, groups ?? []) : null), [rows, layout, groups])
  const focusIndex = useMemo(() => (focusPersonId ? layout.ids.indexOf(focusPersonId) : -1), [layout, focusPersonId])
  const selectedIndex = useMemo(
    () => (selectedPersonId ? layout.ids.indexOf(selectedPersonId) : -1),
    [layout, selectedPersonId],
  )

  const kin = useMemo(() => {
    if (!selectedPersonId || !links) return null
    return kinOf(links, selectedPersonId)
  }, [selectedPersonId, links])

  const brightIds = useMemo(() => {
    if (!selectedPersonId || !links || selectedIndex < 0) return null
    const relatives = relativesOf(
      { focusPersonId, persons: links.persons ?? persons, parentLinks: links.parentLinks, partnerships: links.partnerships },
      selectedPersonId,
    )
    const bright = new Set([
      selectedPersonId,
      ...relatives.parents.map((p) => p.id),
      ...relatives.partners.map((p) => p.person.id),
      ...relatives.siblings.map((s) => s.person.id),
      ...relatives.children.map((p) => p.id),
    ])
    // on the chart every ancestor and descendant is marked, so they are not dimmed either
    if (rows && kin) for (const id of [...kin.ancestors, ...kin.descendants]) bright.add(id)
    return bright
  }, [selectedPersonId, selectedIndex, links, persons, focusPersonId, rows, kin])

  const t = useT()
  // The keyboard's place in the tree: the one Person in the tab order. It starts at the Focus person.
  const [cursorId, setCursorId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const navMemory = useRef<NavMemory>(freshMemory())
  // the Person that real focus should go to once drawn: named, since an effect of an earlier render may still be waiting
  // to run when a key sets it, and must not take it for its own (it would focus the cursor it was rendered with)
  const focusAfterRender = useRef<string | null>(null)
  const cursorIndex = useMemo(() => {
    const own = cursorId ? layout.ids.indexOf(cursorId) : -1
    if (own >= 0) return own
    if (focusIndex >= 0) return focusIndex
    return layout.count > 0 ? 0 : -1
  }, [layout, cursorId, focusIndex])
  const cursorPersonId = cursorIndex >= 0 ? layout.ids[cursorIndex]! : null

  /** Puts real focus on a Person once the cursor is there: at once if it already is, else after the render that moves it. */
  const focusWhenCursor = (personId: string | null) => {
    if (personId && personId === cursorPersonId) {
      focusAfterRender.current = null
      frameRef.current?.querySelector<SVGElement>(`[data-person-id="${personId}"]`)?.focus({ preventScroll: true })
    } else focusAfterRender.current = personId
  }

  /** Screen readers only hear a live region when its text changes, so a repeated message gets an invisible tail. */
  const announce = (text: string) => setAnnouncement((previous) => (previous === text ? `${text}​` : text))

  useEffect(() => {
    const frame = frameRef.current!
    const surface = surfaceRef.current!
    const world = worldRef.current!
    const reducedMotion = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
    let drawnNow: Drawn | null = null
    let checkFrame = 0

    const check = () => {
      const size = sizeRef.current
      if (!size.width || !size.height) return
      const view = controller.view
      const bucket = lodBucket(view.k, reducedRef.current)
      const screen = visibleRect(view, size)
      if (drawnNow && drawnNow.bucket === bucket && rectContains(drawnNow.rect, growRect(screen, REDRAW_MARGIN))) return
      drawnNow = { bucket, rect: growRect(screen, DRAW_MARGIN) }
      setDrawn(drawnNow)
    }
    const scheduleCheck = () => {
      if (!checkFrame) {
        checkFrame = requestAnimationFrame(() => {
          checkFrame = 0
          check()
        })
      }
    }

    const controller = new ViewController({
      onChange(view) {
        world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`)
        frame.dataset.zoom = view.k.toFixed(4)
        scheduleCheck()
      },
      prefersReducedMotion: () => reducedMotion?.matches ?? false,
    })
    controllerRef.current = controller

    syncRef.current = () => {
      const size = sizeRef.current
      if (!size.width || !size.height) return
      const current = layoutRef.current
      controller.configure(size, current.bounds)
      if (!openedRef.current) {
        const focus = focusRef.current ? current.ids.indexOf(focusRef.current) : -1
        controller.jump(
          openingView({
            count: current.count,
            bounds: current.bounds,
            focus: focus >= 0 ? { x: current.x[focus]!, y: current.y[focus]! } : undefined,
            size,
            minFitZoom: current.shape === 'rows' ? CHART_MIN_OPEN_ZOOM : 0,
          }),
        )
        // An empty Tree keeps re-fitting until the first Person arrives, then the view is left to the user.
        openedRef.current = current.count > 0
      }
      scheduleCheck()
    }

    const measure = () => {
      const box = frame.getBoundingClientRect()
      sizeRef.current = { width: box.width, height: box.height }
      syncRef.current()
    }
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    observer?.observe(frame)
    measure()

    // A non-passive listener: React's onWheel is passive and cannot stop the page from scrolling.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1
      const speed = event.ctrlKey ? 0.01 : 0.0015
      const box = surface.getBoundingClientRect()
      controller.zoomAtPoint(Math.exp(-event.deltaY * unit * speed), {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      })
    }
    surface.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      surface.removeEventListener('wheel', onWheel)
      observer?.disconnect()
      if (checkFrame) cancelAnimationFrame(checkFrame)
      controller.dispose()
      controllerRef.current = null
      syncRef.current = () => {}
    }
  }, [])

  useEffect(() => {
    layoutRef.current = layout
    focusRef.current = focusPersonId
    reducedRef.current = reducedDetail
    syncRef.current()
  }, [layout, focusPersonId, reducedDetail])

  /** Keeps a Person in view: if they are off screen, or near its edge, the view moves to them at the same zoom. */
  const ensureVisible = (personId: string) => {
    const controller = controllerRef.current
    if (!controller || !controller.ready) return
    const index = layoutRef.current.ids.indexOf(personId)
    if (index < 0) return
    const x = layoutRef.current.x[index]!
    const y = layoutRef.current.y[index]!
    // Only the part of the screen above a sheet counts as visible.
    const covered = coveredRef.current
    const size = sizeRef.current
    const free = { width: size.width, height: Math.max(1, size.height - covered) }
    // judged from where a running pan ends, not from where it is now: a key pressed in the middle of one may need its own
    const safe = growRect(visibleRect(controller.destination, free), -0.15)
    if (x < safe.x0 || x > safe.x1 || y < safe.y0 || y > safe.y1) controller.show({ x, y }, controller.destination.k, covered)
  }

  // The view moves so the open Person is never hidden behind the sheet, also when the sheet grows or shrinks.
  useEffect(() => {
    coveredRef.current = coveredBottom
    controllerRef.current?.setCoveredBottom(coveredBottom)
    if (selectedPersonId) ensureVisible(selectedPersonId)
  }, [selectedPersonId, coveredBottom, layout])

  // Picking a search result pans to the Person, centred above any sheet, keeping the zoom. A request made before this
  // canvas existed (the List view was showing) is not replayed.
  const handledReveal = useRef(revealRequest?.seq ?? 0)
  useEffect(() => {
    if (!revealRequest || revealRequest.seq === handledReveal.current) return
    const index = layoutRef.current.ids.indexOf(revealRequest.id)
    const controller = controllerRef.current
    // a Person inside a collapsed branch is not in the layout yet: the request waits for the layout that opens the way
    if (index < 0 || !controller?.ready) return
    handledReveal.current = revealRequest.seq
    setCursorId(revealRequest.id)
    navMemory.current = freshMemory()
    controller.show({ x: layoutRef.current.x[index]!, y: layoutRef.current.y[index]! }, controller.view.k, coveredRef.current)
  }, [revealRequest, layout])

  // After a key moved the cursor, real focus follows it (without scrolling the frame, which is only panned by the view).
  // The keyboard moved to a Person inside a collapsed branch: once the way is open and laid out, show them and focus them.
  useEffect(() => {
    const pending = pendingShown.current
    if (pending && layout.ids.includes(pending)) {
      pendingShown.current = null
      focusAfterRender.current = pending
      ensureVisible(pending)
    }
    if (!cursorPersonId || focusAfterRender.current !== cursorPersonId) return
    const card = frameRef.current?.querySelector<SVGElement>(`[data-person-id="${cursorPersonId}"]`)
    // not drawn yet (the view is still moving to them): the next draw tries again
    if (!card) return
    focusAfterRender.current = null
    card.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the cursor, the drawn part or the layout changes
  }, [cursorPersonId, drawn, layout])

  const showFocus = () => {
    const controller = controllerRef.current
    if (!controller || focusIndex < 0) return
    controller.show({ x: layout.x[focusIndex]!, y: layout.y[focusIndex]! }, Math.max(controller.view.k, READABLE_ZOOM))
    setCursorId(focusPersonId)
  }

  const treeForKeys = () => links && { focusPersonId, persons: links.persons ?? persons, parentLinks: links.parentLinks, partnerships: links.partnerships }

  const moveCursor = (key: NavKey) => {
    const tree = treeForKeys()
    if (!tree || !cursorPersonId) return
    const result = move(tree, cursorPersonId, key, navMemory.current)
    navMemory.current = result.memory
    if (result.kind === 'none') {
      announce(renderMessage(t, result.message))
      return
    }
    announce(renderMessage(t, describeMove(tree, result)))
    setCursorId(result.target.id)
    if (!layoutRef.current.ids.includes(result.target.id)) {
      pendingShown.current = result.target.id
      onEnsureShown?.(result.target.id)
      return
    }
    focusWhenCursor(result.target.id)
    ensureVisible(result.target.id)
  }

  /** `C`: collapse the branches under the keyboard's Person, or open them if they are all collapsed. */
  const toggleBranchesOfCursor = () => {
    if (!cursorPersonId || !onToggleBranch) return
    const own = (groups ?? []).filter((group) => group.parents.includes(cursorPersonId))
    const person = persons[cursorIndex]
    if (own.length === 0) {
      announce(t('tree.noBranch', { name: person?.firstName ?? t('tree.thisPerson') }))
      return
    }
    const collapse = own.some((group) => !group.collapsed)
    for (const group of own) if (group.collapsed !== collapse) onToggleBranch(group.key)
    const hidden = own.reduce((sum, group) => sum + group.hiddenCount, 0)
    announce(
      collapse
        ? t('tree.branchCollapsed', { names: person?.firstName ?? '', hidden: renderMessage(t, msg('common.people', { count: hidden })) })
        : t('tree.branchExpanded', { names: person?.firstName ?? '' }),
    )
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const controller = controllerRef.current
    if (!controller || event.altKey || event.ctrlKey || event.metaKey) return
    const target = event.target instanceof Element ? event.target : null
    // The buttons on the right keep Enter and Space for themselves.
    if (target?.closest('[data-controls]')) return
    const onPerson = target?.closest('[data-person-id]') ?? null

    // Shift with an arrow pans; Shift with a letter is just a capital letter.
    // the direction the page reads is the `dir` it has now (the Language sets it on <html>), not a copy of the setting
    const direction = frameRef.current?.closest('[dir]')?.getAttribute('dir') === 'rtl' ? 'rtl' : 'ltr'
    const navKey = navKeyFor(event.key, direction)
    if (navKey && (!event.shiftKey || navKey === 'partner')) moveCursor(navKey)
    else if ((event.key === 'Enter' || event.key === ' ') && onPerson) {
      const id = onPerson.getAttribute('data-person-id')!
      setCursorId(id)
      onSelectPerson?.(id)
    } else if ((event.key === 'f' || event.key === 'F') && cursorPersonId) {
      onSetFocusPerson?.(cursorPersonId)
      announce(t('tree.nowFocus', { name: persons[cursorIndex]?.firstName ?? t('tree.thisPerson') }))
    } else if ((event.key === 'c' || event.key === 'C') && rows && !event.shiftKey) toggleBranchesOfCursor()
    else if (event.key === '+' || event.key === '=') controller.zoomBy(KEY_ZOOM)
    else if (event.key === '-' || event.key === '_') controller.zoomBy(1 / KEY_ZOOM)
    else if (event.key === '0') controller.fit()
    else if (event.key === 'Home') {
      showFocus()
      focusWhenCursor(focusPersonId)
      const name = focusIndex >= 0 ? persons[focusIndex]?.firstName : undefined
      announce(name ? t('tree.homeFocus', { name }) : t('tree.noFocus'))
    } else if (event.shiftKey && event.key === 'ArrowLeft') controller.panBy(KEY_PAN_PX, 0)
    else if (event.shiftKey && event.key === 'ArrowRight') controller.panBy(-KEY_PAN_PX, 0)
    else if (event.shiftKey && event.key === 'ArrowUp') controller.panBy(0, KEY_PAN_PX)
    else if (event.shiftKey && event.key === 'ArrowDown') controller.panBy(0, -KEY_PAN_PX)
    else return
    event.preventDefault()
  }

  // One finger drags, two pinch, a press that barely moves is a tap, two quick touch taps a double-tap (GestureTracker).
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if (!gestures.current.active) {
      // A Person is their button, or the name and dates drawn beside it.
      const target =
        event.target instanceof Element
          ? (event.target.closest('[data-person-id]') ??
            event.target.closest('[data-person-wrapper]')?.querySelector('[data-person-id]') ??
            null)
          : null
      pressedPerson.current = target?.getAttribute('data-person-id') ?? null
      pressedChip.current = event.target instanceof Element ? (event.target.closest('[data-chip-key]')?.getAttribute('data-chip-key') ?? null) : null
    }
    const kind = event.pointerType === 'touch' || event.pointerType === 'pen' ? event.pointerType : 'mouse'
    gestures.current.down(event.pointerId, { x: event.clientX, y: event.clientY }, kind)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.currentTarget.dataset.dragging = ''
  }
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const controller = controllerRef.current
    const action = gestures.current.move(event.pointerId, { x: event.clientX, y: event.clientY })
    if (!controller || !action) return
    if (action.type === 'pan') controller.panBy(action.dx, action.dy)
    else if (action.type === 'pinch') {
      const box = event.currentTarget.getBoundingClientRect()
      controller.zoomAtPoint(action.factor, { x: action.anchor.x - box.left, y: action.anchor.y - box.top })
      controller.panBy(action.dx, action.dy)
    }
  }
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    gestures.current.cancel(event.pointerId)
    if (!gestures.current.active) delete event.currentTarget.dataset.dragging
  }
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const surface = event.currentTarget
    const action = gestures.current.up(event.pointerId, { x: event.clientX, y: event.clientY }, event.timeStamp)
    if (!gestures.current.active) delete surface.dataset.dragging
    const controller = controllerRef.current
    if (action?.type !== 'tap' || !controller) return
    if (pressedChip.current) {
      // a tap on a branch button opens or closes the branch; a double tap on it does nothing more
      const key = pressedChip.current
      pressedChip.current = null
      if (!action.double) onToggleBranch?.(key)
      return
    }
    const box = surface.getBoundingClientRect()
    const screen = { x: action.at.x - box.left, y: action.at.y - box.top }
    if (action.double) {
      // Toggles between the whole tree and a readable size, about the tap.
      if (controller.view.k < READABLE_ZOOM) controller.zoomTowardPoint(READABLE_ZOOM, screen)
      else controller.fit()
      return
    }
    const target = resolveTap({
      drawnPersonId: pressedPerson.current,
      screen,
      view: controller.view,
      layout: layoutRef.current,
      bucket: lodBucket(controller.view.k, reducedRef.current),
    })
    if (target.type === 'zoom') {
      controller.zoomTowardPoint(ZOOM_OUT_OF_DOT, screen)
      return
    }
    const id = target.type === 'person' ? target.id : null
    if (id) setCursorId(id)
    navMemory.current = { ...navMemory.current, lastKey: null, origin: null }
    onSelectPerson?.(id)
  }

  return (
    <div
      ref={frameRef}
      role="group"
      data-tree-frame=""
      aria-label={t('tree.label')}
      aria-describedby={hintId}
      // One tab stop: the keyboard's Person once there is one, else the tree itself.
      tabIndex={cursorPersonId ? -1 : 0}
      data-lod={drawn?.bucket}
      data-shape={layout.shape}
      onKeyDown={onKeyDown}
      className="relative h-full min-h-0 w-full select-none overflow-hidden outline-offset-[-3px] focus-visible:outline-3 focus-visible:outline-sky-800"
      style={{ background: rows ? CHART.background : PALETTE.background }}
    >
      <div
        ref={surfaceRef}
        className="absolute inset-0 cursor-grab touch-none data-[dragging]:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={endDrag}
      >
        {/* role="presentation": otherwise the SVG itself is announced as an image, with the people inside it as its parts */}
        <svg width="100%" height="100%" className="block" focusable="false" role="presentation">
          <g ref={worldRef}>
            {chartScene ? (
              drawn && (
                <ChartContents
                  scene={chartScene}
                  persons={persons}
                  relationships={relationships}
                  focusIndex={focusIndex}
                  selectedIndex={selectedIndex}
                  cursorIndex={cursorIndex}
                  brightIds={brightIds}
                  ancestors={kin?.ancestors ?? EMPTY_IDS}
                  descendants={kin?.descendants ?? EMPTY_IDS}
                  partners={kin?.partners ?? EMPTY_IDS}
                  photoUrlFor={photoUrlFor}
                  photoVersion={photoVersion}
                  drawn={drawn}
                />
              )
            ) : (
              <>
                <Decor />
                {drawn && (
                  <SceneContents
                    scene={scene}
                    persons={persons}
                    relationships={relationships}
                    focusIndex={focusIndex}
                    selectedIndex={selectedIndex}
                    cursorIndex={cursorIndex}
                    brightIds={brightIds}
                    photoUrlFor={photoUrlFor}
                    photoVersion={photoVersion}
                    drawn={drawn}
                  />
                )}
              </>
            )}
          </g>
        </svg>
      </div>
      <p id={hintId} className="sr-only">
        {t('tree.hint')}
      </p>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      <div
        data-controls
        hidden={hideControls}
        // centred in the part of the screen a sheet leaves free
        style={{ top: `calc((100% - ${coveredBottom}px) / 2)` }}
        className="absolute end-2 flex -translate-y-1/2 flex-col gap-2"
      >
        <ControlButton label={t('tree.zoomIn')} onClick={() => controllerRef.current?.zoomBy(KEY_ZOOM)}>
          <path d="M12 5v14M5 12h14" />
        </ControlButton>
        <ControlButton label={t('tree.zoomOut')} onClick={() => controllerRef.current?.zoomBy(1 / KEY_ZOOM)}>
          <path d="M5 12h14" />
        </ControlButton>
        <ControlButton label={t('tree.fit')} onClick={() => controllerRef.current?.fit()}>
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </ControlButton>
        <ControlButton label={t('tree.backToFocus')} disabled={focusIndex < 0} onClick={showFocus}>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        </ControlButton>
      </div>
      {rows && (
        <div data-controls hidden={hideControls} role="group" aria-label={t('tree.branches')} className="absolute start-2 top-2 flex gap-2">
          <button
            type="button"
            onClick={onExpandAll}
            disabled={!(groups ?? []).some((group) => group.collapsed)}
            className="btn bg-white/90 px-3 text-sm font-medium shadow-sm disabled:opacity-50"
          >
            {t('tree.expandAll')}
          </button>
          <button
            type="button"
            onClick={onCollapseAll}
            disabled={(groups ?? []).every((group) => group.collapsed)}
            className="btn bg-white/90 px-3 text-sm font-medium shadow-sm disabled:opacity-50"
          >
            {t('tree.collapseAll')}
          </button>
        </div>
      )}
    </div>
  )
}

function ControlButton(props: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="grid size-11 place-items-center rounded-full border border-line-strong bg-white/90 text-ink shadow-sm hover:bg-white disabled:opacity-50"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        {props.children}
      </svg>
    </button>
  )
}
