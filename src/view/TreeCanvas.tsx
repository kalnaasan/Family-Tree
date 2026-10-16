import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import { type NavKey, type NavMemory, describeMove, freshMemory, move } from '../domain/navigation.ts'
import type { ParentLink, Partnership, Person } from '../domain/schema.ts'
import type { TreeLayout } from '../layout/layoutTree.ts'
import { HEART_PATH, rootPaths, trunkPath } from './geometry.ts'
import { type LodBucket, lodBucket } from './lod.ts'
import { PALETTE } from './palette.ts'
import { PersonNode } from './PersonNode.tsx'
import { type Scene, buildScene, selectVisible } from './scene.ts'
import { displayName, initialOf, lifeSpan, personAriaLabel } from './text.ts'
import { ViewController } from './viewController.ts'
import {
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
  labels: ReadonlyMap<string, string | null>
  focusIndex: number
  selectedIndex: number
  /** The keyboard's Person: always drawn, even outside the drawn area, because it is the tab stop. */
  cursorIndex: number
  drawn: Drawn
}

/** Everything that depends on what is on screen. Re-rendered only when `drawn` changes, never per pan frame. */
const SceneContents = memo(function SceneContents({
  scene,
  persons,
  labels,
  focusIndex,
  selectedIndex,
  cursorIndex,
  drawn,
}: SceneContentsProps) {
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
        return (
          <PersonNode
            key={person.id}
            id={person.id}
            x={layout.x[i]!}
            y={layout.y[i]!}
            bucket={bucket}
            name={displayName(person)}
            initial={initialOf(person)}
            life={lifeSpan(person)}
            ariaLabel={personAriaLabel(person, labels.get(person.id) ?? null, i === focusIndex)}
            gender={person.gender}
            deceased={person.deceased}
            isFocus={i === focusIndex}
            isSelected={i === selectedIndex}
            isCurrent={i === cursorIndex}
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
  links?: { parentLinks: ParentLink[]; partnerships: Partnership[] }
  /** Relationship labels by Person id, for the names screen readers read. */
  labels?: ReadonlyMap<string, string | null>
  /** `F` on a Person makes them the Focus person. */
  onSetFocusPerson?: (id: string) => void
  /** The open Person, drawn with a ring. */
  selectedPersonId?: string | null
  /** A click or tap (little movement) on a Person, or on empty space (`null`). */
  onSelectPerson?: (id: string | null) => void
}

/** Movement under this many pixels between press and release is a click, not a drag. */
const CLICK_SLOP_PX = 8

/**
 * The pan/zoom canvas. The view lives in a `ViewController` and is written straight onto one `<g>`, so dragging
 * and zooming never re-render React. React re-renders only when the level of detail changes or the screen leaves
 * the part of the Tree that is drawn (spec section 9).
 */
const NO_LABELS: ReadonlyMap<string, string | null> = new Map()

const NAV_KEYS: Record<string, NavKey> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  p: 'partner',
  P: 'partner',
}

export function TreeCanvas({
  layout,
  persons,
  focusPersonId,
  links,
  labels = NO_LABELS,
  onSetFocusPerson,
  selectedPersonId = null,
  onSelectPerson,
}: TreeCanvasProps) {
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
  const drag = useRef<{
    pointerId: number
    x: number
    y: number
    startX: number
    startY: number
    /** The Person under the pointer when it went down, read before pointer capture redirects events. */
    personId: string | null
  } | null>(null)
  const [drawn, setDrawn] = useState<Drawn | null>(null)

  const scene = useMemo(() => buildScene(layout), [layout])
  const focusIndex = useMemo(() => (focusPersonId ? layout.ids.indexOf(focusPersonId) : -1), [layout, focusPersonId])
  const selectedIndex = useMemo(
    () => (selectedPersonId ? layout.ids.indexOf(selectedPersonId) : -1),
    [layout, selectedPersonId],
  )

  // The keyboard's place in the tree: the one Person in the tab order. It starts at the Focus person.
  const [cursorId, setCursorId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const navMemory = useRef<NavMemory>(freshMemory())
  const focusCursorAfterRender = useRef(false)
  const cursorIndex = useMemo(() => {
    const own = cursorId ? layout.ids.indexOf(cursorId) : -1
    if (own >= 0) return own
    if (focusIndex >= 0) return focusIndex
    return layout.count > 0 ? 0 : -1
  }, [layout, cursorId, focusIndex])
  const cursorPersonId = cursorIndex >= 0 ? layout.ids[cursorIndex]! : null

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
      const bucket = lodBucket(view.k)
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
    syncRef.current()
  }, [layout, focusPersonId])

  /** Keeps a Person in view: if they are off screen, or near its edge, the view moves to them at the same zoom. */
  const ensureVisible = (personId: string) => {
    const controller = controllerRef.current
    if (!controller || !controller.ready) return
    const index = layoutRef.current.ids.indexOf(personId)
    if (index < 0) return
    const x = layoutRef.current.x[index]!
    const y = layoutRef.current.y[index]!
    const safe = growRect(visibleRect(controller.view, sizeRef.current), -0.15)
    if (x < safe.x0 || x > safe.x1 || y < safe.y0 || y > safe.y1) controller.show({ x, y })
  }

  useEffect(() => {
    if (selectedPersonId) ensureVisible(selectedPersonId)
  }, [selectedPersonId])

  // After a key moved the cursor, real focus follows it (without scrolling the frame, which is only panned by the view).
  useEffect(() => {
    if (!focusCursorAfterRender.current || !cursorPersonId) return
    focusCursorAfterRender.current = false
    frameRef.current?.querySelector<SVGElement>(`[data-person-id="${cursorPersonId}"]`)?.focus({ preventScroll: true })
  }, [cursorPersonId, drawn])

  const showFocus = () => {
    const controller = controllerRef.current
    if (!controller || focusIndex < 0) return
    controller.show({ x: layout.x[focusIndex]!, y: layout.y[focusIndex]! }, Math.max(controller.view.k, READABLE_ZOOM))
    setCursorId(focusPersonId)
  }

  const treeForKeys = () => links && { focusPersonId, persons, parentLinks: links.parentLinks, partnerships: links.partnerships }

  const moveCursor = (key: NavKey) => {
    const tree = treeForKeys()
    if (!tree || !cursorPersonId) return
    const result = move(tree, cursorPersonId, key, navMemory.current)
    navMemory.current = result.memory
    if (result.kind === 'none') {
      announce(result.message)
      return
    }
    announce(describeMove(tree, result))
    setCursorId(result.target.id)
    focusCursorAfterRender.current = true
    ensureVisible(result.target.id)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const controller = controllerRef.current
    if (!controller || event.altKey || event.ctrlKey || event.metaKey) return
    const target = event.target instanceof Element ? event.target : null
    // The buttons on the right keep Enter and Space for themselves.
    if (target?.closest('[data-controls]')) return
    const onPerson = target?.closest('[data-person-id]') ?? null

    // Shift with an arrow pans; Shift with a letter is just a capital letter.
    const navKey = NAV_KEYS[event.key]
    if (navKey && (!event.shiftKey || navKey === 'partner')) moveCursor(navKey)
    else if ((event.key === 'Enter' || event.key === ' ') && onPerson) {
      const id = onPerson.getAttribute('data-person-id')!
      setCursorId(id)
      onSelectPerson?.(id)
    } else if ((event.key === 'f' || event.key === 'F') && cursorPersonId) {
      onSetFocusPerson?.(cursorPersonId)
      announce(`${persons[cursorIndex]?.firstName ?? 'This person'} is now the Focus person`)
    } else if (event.key === '+' || event.key === '=') controller.zoomBy(KEY_ZOOM)
    else if (event.key === '-' || event.key === '_') controller.zoomBy(1 / KEY_ZOOM)
    else if (event.key === '0') controller.fit()
    else if (event.key === 'Home') {
      showFocus()
      focusCursorAfterRender.current = true
      const name = focusIndex >= 0 ? persons[focusIndex]?.firstName : undefined
      announce(name ? `${name}, Focus person` : 'No Focus person')
    } else if (event.shiftKey && event.key === 'ArrowLeft') controller.panBy(KEY_PAN_PX, 0)
    else if (event.shiftKey && event.key === 'ArrowRight') controller.panBy(-KEY_PAN_PX, 0)
    else if (event.shiftKey && event.key === 'ArrowUp') controller.panBy(0, KEY_PAN_PX)
    else if (event.shiftKey && event.key === 'ArrowDown') controller.panBy(0, -KEY_PAN_PX)
    else return
    event.preventDefault()
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || drag.current) return
    // A Person is their button, or the name and dates drawn beside it.
    const target =
      event.target instanceof Element
        ? (event.target.closest('[data-person-id]') ??
          event.target.closest('[data-person-wrapper]')?.querySelector('[data-person-id]') ??
          null)
        : null
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      personId: target?.getAttribute('data-person-id') ?? null,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.currentTarget.dataset.dragging = ''
  }
  const onPointerMove = (event: React.PointerEvent) => {
    const start = drag.current
    if (!start || start.pointerId !== event.pointerId) return
    controllerRef.current?.panBy(event.clientX - start.x, event.clientY - start.y)
    start.x = event.clientX
    start.y = event.clientY
  }
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    delete event.currentTarget.dataset.dragging
  }
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (start?.pointerId === event.pointerId) {
      const moved = Math.hypot(event.clientX - start.startX, event.clientY - start.startY)
      if (moved < CLICK_SLOP_PX) {
        if (start.personId) setCursorId(start.personId)
        navMemory.current = { ...navMemory.current, lastKey: null, origin: null }
        onSelectPerson?.(start.personId)
      }
    }
    endDrag(event)
  }

  return (
    <div
      ref={frameRef}
      role="group"
      aria-label="Family tree"
      aria-describedby={hintId}
      // One tab stop: the keyboard's Person once there is one, else the tree itself.
      tabIndex={cursorPersonId ? -1 : 0}
      data-lod={drawn?.bucket}
      onKeyDown={onKeyDown}
      className="relative h-full min-h-0 w-full select-none overflow-hidden outline-offset-[-3px] focus-visible:outline-3 focus-visible:outline-sky-800"
      style={{ background: PALETTE.background }}
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
            <Decor />
            {drawn && (
              <SceneContents
                scene={scene}
                persons={persons}
                labels={labels}
                focusIndex={focusIndex}
                selectedIndex={selectedIndex}
                cursorIndex={cursorIndex}
                drawn={drawn}
              />
            )}
          </g>
        </svg>
      </div>
      <p id={hintId} className="sr-only">
        Arrow keys move to a parent, child or sibling. P moves to a partner. Enter opens a person. F makes them the
        Focus person. Home returns to the Focus person. Plus and minus zoom, 0 shows the whole tree, Shift with an arrow
        pans.
      </p>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      <div data-controls className="absolute top-1/2 right-2 flex -translate-y-1/2 flex-col gap-2">
        <ControlButton label="Zoom in" onClick={() => controllerRef.current?.zoomBy(KEY_ZOOM)}>
          <path d="M12 5v14M5 12h14" />
        </ControlButton>
        <ControlButton label="Zoom out" onClick={() => controllerRef.current?.zoomBy(1 / KEY_ZOOM)}>
          <path d="M5 12h14" />
        </ControlButton>
        <ControlButton label="Show whole tree" onClick={() => controllerRef.current?.fit()}>
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </ControlButton>
        <ControlButton label="Back to Focus person" disabled={focusIndex < 0} onClick={showFocus}>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        </ControlButton>
      </div>
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
      className="grid size-11 place-items-center rounded-full border border-stone-500 bg-white/90 text-stone-900 shadow-sm hover:bg-white disabled:opacity-50"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        {props.children}
      </svg>
    </button>
  )
}
