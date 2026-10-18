import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Profiler } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deriveRelationships } from '../domain/labels.ts'
import type { Tree } from '../domain/schema.ts'
import { addParentLink, addPartnership, addPerson, emptyTree } from '../domain/tree.ts'
import { useLanguageStore } from '../i18n/language.ts'
import { generateTree } from '../layout/fixtures.ts'
import { layoutTree } from '../layout/layoutTree.ts'
import { NODE_RADIUS, ROOTS_DEPTH, TRUNK_HEIGHT } from './geometry.ts'
import { TreeCanvas } from './TreeCanvas.tsx'
import { MAX_ZOOM, READABLE_ZOOM, fitZoom } from './viewport.ts'

const size = { width: 400, height: 300 }

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    ...size,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: size.width,
    bottom: size.height,
    toJSON: () => ({}),
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  delete (window as { matchMedia?: unknown }).matchMedia
})

function mount(count: number, options: { focus?: boolean } = {}) {
  return mountTree(generateTree(count, 1), options)
}

function mountTree(tree: Tree, options: { focus?: boolean } = {}) {
  const layout = layoutTree(tree, { nodeRadius: NODE_RADIUS, trunkHeight: TRUNK_HEIGHT, rootsDepth: ROOTS_DEPTH })
  const focusPersonId = options.focus === false ? null : tree.focusPersonId
  const relationships = deriveRelationships({ ...tree, focusPersonId })
  const commits = vi.fn()
  const onSetFocusPerson = vi.fn()
  const onSelectPerson = vi.fn()
  render(
    <Profiler id="canvas" onRender={commits}>
      <TreeCanvas
        layout={layout}
        persons={tree.persons}
        focusPersonId={focusPersonId}
        links={{ parentLinks: tree.parentLinks, partnerships: tree.partnerships }}
        relationships={relationships}
        onSetFocusPerson={onSetFocusPerson}
        onSelectPerson={onSelectPerson}
      />
    </Profiler>,
  )
  settle()
  const frame = screen.getByRole('group', { name: 'Family tree' })
  return {
    tree,
    layout,
    commits,
    frame,
    surface: frame.firstElementChild as HTMLElement,
    focusPersonId,
    onSetFocusPerson,
    onSelectPerson,
  }
}

/** Runs the animation frames and effects a user interaction triggers. */
const settle = (ms = 40) => act(() => void vi.advanceTimersByTime(ms))

const zoomOf = (frame: HTMLElement) => Number(frame.dataset.zoom)
const viewOf = (frame: HTMLElement) => {
  const transform = frame.querySelector('svg > g')!.getAttribute('transform')!
  const [, x, y, k] = /translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\)/.exec(transform)!
  return { x: Number(x), y: Number(y), k: Number(k) }
}
const personNodes = (frame: HTMLElement) => frame.querySelectorAll('[data-person-id]')

/** jsdom has no PointerEvent: a MouseEvent with a pointer id is what React reads. */
function pointer(type: string, target: Element, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  act(() => void target.dispatchEvent(event))
}

describe('opening view (spec section 12)', () => {
  it('opens a 15-person Tree fit-all, with everybody drawn', () => {
    const { layout, frame } = mount(15)
    expect(zoomOf(frame)).toBeCloseTo(fitZoom(layout.bounds, size), 3)
    expect(personNodes(frame)).toHaveLength(15)
  })

  it('opens a 150-person Tree fit-all', () => {
    const { layout, frame } = mount(150)
    expect(zoomOf(frame)).toBeCloseTo(fitZoom(layout.bounds, size), 3)
  })

  it('opens a 500-person Tree on the Focus person at a readable zoom, not fit-all', () => {
    const { layout, frame, tree } = mount(500)
    expect(zoomOf(frame)).toBeCloseTo(READABLE_ZOOM, 3)
    expect(zoomOf(frame)).toBeGreaterThan(fitZoom(layout.bounds, size))
    const focus = frame.querySelector(`[data-person-id="${tree.focusPersonId}"]`)
    expect(focus).not.toBeNull()
    // the Focus person is in the middle of the screen
    const index = layout.ids.indexOf(tree.focusPersonId!)
    const view = viewOf(frame)
    expect(layout.x[index]! * view.k + view.x).toBeCloseTo(size.width / 2, 0)
    expect(layout.y[index]! * view.k + view.y).toBeCloseTo(size.height / 2, 0)
  })

  it('culls: far fewer than 500 Persons are in the DOM on a big Tree', () => {
    const { frame } = mount(500)
    expect(personNodes(frame).length).toBeGreaterThan(0)
    expect(personNodes(frame).length).toBeLessThan(120)
  })
})

describe('level of detail', () => {
  it('shows dots when a big Tree is fit-all, and full medallions with leaves when zoomed in', () => {
    const { frame, surface } = mount(150)
    expect(frame).toHaveAttribute('data-lod', 'dot')
    expect(frame.querySelectorAll('text')).toHaveLength(0)

    act(() => void surface.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -50000 })))
    fireEvent.click(screen.getByRole('button', { name: 'Back to Focus person' }))
    settle(300)
    expect(zoomOf(frame)).toBe(MAX_ZOOM)
    expect(frame).toHaveAttribute('data-lod', 'full')
    expect(frame.querySelectorAll('text').length).toBeGreaterThan(0)
    expect(frame.querySelectorAll('ellipse[rx="9"]').length).toBeGreaterThan(0)
  })
})

describe('no React render per pan frame', () => {
  it('dragging within the drawn area changes the transform but commits nothing', () => {
    const { frame, surface, commits } = mount(15)
    const before = viewOf(frame)
    const commitsBefore = commits.mock.calls.length

    pointer('pointerdown', surface, 200, 150)
    for (let i = 1; i <= 20; i++) {
      pointer('pointermove', surface, 200 + i, 150 + i)
      settle(16)
    }
    pointer('pointerup', surface, 220, 170)

    const after = viewOf(frame)
    expect(after.x).not.toBe(before.x)
    expect(after.k).toBe(before.k)
    expect(commits.mock.calls.length).toBe(commitsBefore)
  })

  it('panning far enough to leave the drawn area draws the new part', () => {
    const { frame, surface, commits, layout } = mount(500)
    const first = new Set([...personNodes(frame)].map((n) => n.getAttribute('data-person-id')))
    const commitsBefore = commits.mock.calls.length

    pointer('pointerdown', surface, 200, 150)
    for (let i = 1; i <= 10; i++) {
      pointer('pointermove', surface, 200 - i * 60, 150)
      settle(16)
    }
    pointer('pointerup', surface, -400, 150)
    settle()

    expect(commits.mock.calls.length).toBeGreaterThan(commitsBefore)
    const now = new Set([...personNodes(frame)].map((n) => n.getAttribute('data-person-id')))
    expect([...now].some((id) => !first.has(id))).toBe(true)
    expect(now.size).toBeLessThan(layout.count)
  })
})

describe('mouse', () => {
  it('the wheel zooms about the pointer and stops the page from scrolling', () => {
    const { frame, surface } = mount(150)
    const before = viewOf(frame)
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -200, clientX: 100, clientY: 100 })
    act(() => void surface.dispatchEvent(event))
    const after = viewOf(frame)
    expect(event.defaultPrevented).toBe(true)
    expect(after.k).toBeGreaterThan(before.k)
    // the world point under the pointer did not move
    expect((100 - after.x) / after.k).toBeCloseTo((100 - before.x) / before.k, 3)
  })

  it('cannot zoom out past fit-all or in past 250%', () => {
    const { frame, surface } = mount(150)
    const min = zoomOf(frame)
    act(() => void surface.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 5000 })))
    expect(zoomOf(frame)).toBeCloseTo(min, 4)
    act(() => void surface.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -50000 })))
    expect(zoomOf(frame)).toBe(MAX_ZOOM)
  })
})

describe('keyboard', () => {
  it('+ and - zoom, 0 fits, Shift+arrows pan', () => {
    const { frame } = mount(150)
    const fit = zoomOf(frame)

    fireEvent.keyDown(frame, { key: '+' })
    settle(300)
    expect(zoomOf(frame)).toBeCloseTo(fit * 1.25, 3)

    fireEvent.keyDown(frame, { key: '-' })
    settle(300)
    expect(zoomOf(frame)).toBeCloseTo(fit, 3)

    fireEvent.keyDown(frame, { key: '+' })
    settle(300)
    fireEvent.keyDown(frame, { key: '+' })
    settle(300)
    fireEvent.keyDown(frame, { key: '0' })
    settle(300)
    expect(zoomOf(frame)).toBeCloseTo(fit, 3)

    fireEvent.keyDown(frame, { key: '+' })
    settle(300)
    const start = viewOf(frame)
    fireEvent.keyDown(frame, { key: 'ArrowRight', shiftKey: true })
    expect(viewOf(frame).x - start.x).toBeCloseTo(-80)
    fireEvent.keyDown(frame, { key: 'ArrowDown', shiftKey: true })
    expect(viewOf(frame).y - start.y).toBeCloseTo(-80)
  })

  it('browser zoom shortcuts and unrelated keys are left alone', () => {
    const { frame } = mount(150)
    const before = viewOf(frame)
    expect(fireEvent.keyDown(frame, { key: 'x' })).toBe(true)
    expect(fireEvent.keyDown(frame, { key: '+', ctrlKey: true })).toBe(true)
    settle(300)
    expect(viewOf(frame)).toEqual(before)
  })

  it('the tree is one tab stop with a name and instructions', () => {
    const { frame } = mount(15)
    // the tab stop is the keyboard's Person; the frame itself is only reachable by click or script
    expect(frame).toHaveAttribute('tabindex', '-1')
    expect(frame.querySelectorAll('[data-person-id][tabindex="0"]')).toHaveLength(1)
    expect(frame.querySelectorAll('[data-person-id][tabindex="-1"]')).toHaveLength(14)
    expect(frame).toHaveAccessibleDescription(/Arrow keys move to a parent, child or sibling/)
  })

  it('an empty tree is itself the tab stop', () => {
    const layout = layoutTree({ focusPersonId: null, persons: [], parentLinks: [], partnerships: [] })
    render(<TreeCanvas layout={layout} persons={[]} focusPersonId={null} />)
    expect(screen.getByRole('group', { name: 'Family tree' })).toHaveAttribute('tabindex', '0')
  })
})

describe('buttons', () => {
  it('Zoom in, Zoom out and Show whole tree work without a mouse wheel or keyboard', () => {
    const { frame } = mount(150)
    const fit = zoomOf(frame)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    settle(300)
    expect(zoomOf(frame)).toBeGreaterThan(fit)
    fireEvent.click(screen.getByRole('button', { name: 'Show whole tree' }))
    settle(300)
    expect(zoomOf(frame)).toBeCloseTo(fit, 3)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    settle(300)
    expect(zoomOf(frame)).toBeCloseTo(fit, 3)
  })

  it('Back to Focus person centres them at a readable zoom', () => {
    const { frame, layout, focusPersonId } = mount(150)
    fireEvent.click(screen.getByRole('button', { name: 'Back to Focus person' }))
    settle(300)
    const index = layout.ids.indexOf(focusPersonId!)
    const view = viewOf(frame)
    expect(view.k).toBeGreaterThanOrEqual(READABLE_ZOOM - 1e-6)
    expect(layout.x[index]! * view.k + view.x).toBeCloseTo(size.width / 2, 0)
  })

  it('Back to Focus person is disabled when nobody is the Focus person', () => {
    mount(15, { focus: false })
    expect(screen.getByRole('button', { name: 'Back to Focus person' })).toBeDisabled()
  })

  it('every control is at least 44 px', () => {
    const { frame } = mount(15)
    const controls = frame.querySelectorAll('[data-controls] button')
    expect(controls).toHaveLength(4)
    for (const button of controls) expect(button.className).toContain('size-11')
  })
})

describe('reduced motion', () => {
  it('view changes jump: the new zoom is there with no animation frame', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    })
    const { frame } = mount(150)
    const fit = zoomOf(frame)
    fireEvent.keyDown(frame, { key: '+' })
    expect(zoomOf(frame)).toBeCloseTo(fit * 1.25, 3)
    fireEvent.click(screen.getByRole('button', { name: 'Show whole tree' }))
    expect(zoomOf(frame)).toBeCloseTo(fit, 3)
  })

  it('without the preference the same key animates', () => {
    const { frame } = mount(150)
    const fit = zoomOf(frame)
    fireEvent.keyDown(frame, { key: '+' })
    expect(zoomOf(frame)).toBeCloseTo(fit, 3)
    settle(300)
    expect(zoomOf(frame)).toBeCloseTo(fit * 1.25, 3)
  })
})

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

/** Karl (1) + Maria (2) have Ben (3, the Focus person) and Anna (4); Ben + Eva (5) have Leo (6). */
function smallFamily(): Tree {
  const people: [string, 'male' | 'female'][] = [
    ['Karl', 'male'], ['Maria', 'female'], ['Ben', 'male'], ['Anna', 'female'], ['Eva', 'female'], ['Leo', 'male'],
  ]
  let tree = people.reduce((t, [firstName, gender], i) => addPerson(t, { id: id(i + 1), firstName, gender }), emptyTree())
  for (const [child, parent] of [[3, 1], [3, 2], [4, 1], [4, 2], [6, 3], [6, 5]] as const) {
    tree = addParentLink(tree, id(child), id(parent))
  }
  tree = addPartnership(tree, { personIds: [id(1), id(2)], status: 'current' })
  tree = addPartnership(tree, { personIds: [id(3), id(5)], status: 'current' })
  return { ...tree, focusPersonId: id(3) }
}

const cursor = (frame: HTMLElement) => frame.querySelector<SVGElement>('[data-person-id][tabindex="0"]')!
const active = () => document.activeElement?.getAttribute('data-person-id') ?? null
const spoken = (frame: HTMLElement) => frame.querySelector('[aria-live]')!.textContent!.replace('​', '')
const press = (key: string, init: KeyboardEventInit = {}) => {
  fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init })
  settle(300)
}

/** Karl and Maria's three children in the order they were added: Ben (the Focus person), Anna, Zoe. */
function threeSiblings(): Tree {
  let tree = smallFamily()
  tree = addPerson(tree, { id: id(7), firstName: 'Zoe', gender: 'female' })
  tree = addParentLink(tree, id(7), id(1))
  return addParentLink(tree, id(7), id(2))
}

describe('names drawn in their own direction (spec section 13.3)', () => {
  afterEach(() => useLanguageStore.setState({ language: 'en' }))

  /** Zooms right in on the Focus person, so the names and dates are drawn. */
  function zoomIn(surface: HTMLElement) {
    act(() => void surface.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -50000 })))
    fireEvent.click(screen.getByRole('button', { name: 'Back to Focus person' }))
    settle(300)
  }

  it('draws each name the way it reads, and the dates the way the Language reads', () => {
    useLanguageStore.setState({ language: 'ar' })
    let tree = addPerson(emptyTree(), { id: id(1), firstName: 'محمد', lastName: 'الأحمد', birthDate: '1930', deathDate: '2001' })
    tree = addPerson(tree, { id: id(2), firstName: 'Maria', lastName: 'Keller' })
    const { frame, surface } = mountTree({ ...tree, focusPersonId: id(1) })
    zoomIn(surface)
    const text = (words: string) => [...frame.querySelectorAll('text')].find((line) => line.textContent?.includes(words))
    expect(text('محمد')).toHaveAttribute('direction', 'rtl')
    expect(text('Maria')).toHaveAttribute('direction', 'ltr')
    expect(text('1930–2001')).toHaveAttribute('direction', 'rtl') // the page reads right to left
  })

  it('reads the dates left to right in English, and a name by its own letters whatever the language', () => {
    let tree = addPerson(emptyTree(), { id: id(1), firstName: 'محمد', birthDate: '1930' })
    tree = addPerson(tree, { id: id(2), firstName: 'Maria', birthDate: '1962' })
    const { frame, surface } = mountTree({ ...tree, focusPersonId: id(1) })
    zoomIn(surface)
    const text = (words: string) => [...frame.querySelectorAll('text')].find((line) => line.textContent?.includes(words))
    expect(text('محمد')).toHaveAttribute('direction', 'rtl')
    expect(text('1930')).toHaveAttribute('direction', 'ltr')
  })
})

describe('the sibling keys follow the direction the page reads (spec section 13.2)', () => {
  // the page's own `dir`, which is what the Language sets on <html>
  const readRightToLeft = () => document.documentElement.setAttribute('dir', 'rtl')
  afterEach(() => document.documentElement.setAttribute('dir', 'ltr'))

  it('left to right: ArrowRight is the next sibling, ArrowLeft the previous', () => {
    const { frame } = mountTree(threeSiblings())
    cursor(frame).focus()
    press('ArrowRight')
    expect(active()).toBe(id(4)) // Anna, after Ben
    press('ArrowLeft')
    press('ArrowLeft')
    expect(active()).toBe(id(7)) // back past Ben, round to Zoe
  })

  it('right to left: the arrow pointing the way Arabic reads, ArrowLeft, is the next sibling', () => {
    readRightToLeft()
    const { frame } = mountTree(threeSiblings())
    cursor(frame).focus()
    press('ArrowLeft')
    expect(active()).toBe(id(4)) // Anna, after Ben
    press('ArrowRight')
    press('ArrowRight')
    expect(active()).toBe(id(7)) // back past Ben, round to Zoe
  })

  it('panning with Shift and an arrow stays physical in both directions', () => {
    readRightToLeft()
    const { frame } = mountTree(threeSiblings())
    cursor(frame).focus()
    const before = frame.getAttribute('data-zoom')
    press('ArrowRight', { shiftKey: true })
    expect(active()).toBe(id(3)) // the cursor did not move: Shift + arrow pans
    expect(frame.getAttribute('data-zoom')).toBe(before)
  })
})

describe('keyboard navigation along family links (spec section 7)', () => {
  it('starts at the Focus person, named for a screen reader', () => {
    const { frame } = mountTree(smallFamily())
    expect(cursor(frame).getAttribute('data-person-id')).toBe(id(3))
    expect(cursor(frame)).toHaveAccessibleName('Ben, Focus person')
    expect(frame.querySelector(`[data-person-id="${id(1)}"]`)).toHaveAccessibleName('Karl, father')
    expect(frame.querySelector(`[data-person-id="${id(4)}"]`)).toHaveAccessibleName('Anna, sister')
  })

  it.each([
    ['ArrowUp', 'Karl, father of Ben, 2 children', 1],
    ['ArrowDown', 'Leo, son of Ben', 6],
    ['ArrowRight', 'Anna, sister of Ben', 4],
    ['ArrowLeft', 'Anna, sister of Ben', 4],
    ['p', 'Eva, wife of Ben, 1 child', 5],
    ['P', 'Eva, wife of Ben, 1 child', 5],
  ])('%s moves focus, and the move is announced', (key, said, target) => {
    const { frame } = mountTree(smallFamily())
    cursor(frame).focus()
    press(key)
    expect(active()).toBe(id(target))
    expect(spoken(frame)).toBe(said)
    // roving tab stop: the one tab stop moved with the focus
    expect(frame.querySelectorAll('[data-person-id][tabindex="0"]')).toHaveLength(1)
    expect(cursor(frame).getAttribute('data-person-id')).toBe(id(target))
  })

  it('says so, and stays put, when there is nobody that way', () => {
    const { frame } = mountTree(smallFamily())
    cursor(frame).focus()
    press('ArrowUp') // Karl
    press('ArrowUp')
    expect(spoken(frame)).toBe('Karl has no recorded parents')
    expect(active()).toBe(id(1))
  })

  it('siblings wrap round, and down returns the way we came up', () => {
    const { frame } = mountTree(smallFamily())
    cursor(frame).focus()
    press('ArrowRight') // Anna
    press('ArrowRight') // wraps to Ben
    expect(active()).toBe(id(3))
    press('ArrowUp') // Karl
    press('ArrowDown') // back to Ben, the child we came from
    expect(active()).toBe(id(3))
  })

  it('Enter and Space open the Person under the keyboard', () => {
    const { frame, onSelectPerson } = mountTree(smallFamily())
    cursor(frame).focus()
    press('ArrowUp')
    press('Enter')
    expect(onSelectPerson).toHaveBeenLastCalledWith(id(1))
    press(' ')
    expect(onSelectPerson).toHaveBeenCalledTimes(2)
  })

  it('F makes the Person under the keyboard the Focus person and says so', () => {
    const { frame, onSetFocusPerson } = mountTree(smallFamily())
    cursor(frame).focus()
    press('ArrowUp')
    press('f')
    expect(onSetFocusPerson).toHaveBeenCalledWith(id(1))
    expect(spoken(frame)).toBe('Karl is now the Focus person')
  })

  it('Home returns to the Focus person', () => {
    const { frame } = mountTree(smallFamily())
    cursor(frame).focus()
    press('ArrowUp')
    press('ArrowUp')
    press('Home')
    expect(active()).toBe(id(3))
    expect(spoken(frame)).toBe('Ben, Focus person')
  })

  it('Shift+arrows still pan and do not move between people', () => {
    const { frame } = mountTree(smallFamily())
    cursor(frame).focus()
    press('ArrowUp', { shiftKey: true })
    expect(active()).toBe(id(3))
  })

  it('the buttons beside the tree keep their own keys', () => {
    const { frame, onSelectPerson } = mountTree(smallFamily())
    screen.getByRole('button', { name: 'Zoom in' }).focus()
    press('ArrowUp')
    press('f')
    press('Enter')
    expect(cursor(frame).getAttribute('data-person-id')).toBe(id(3))
    expect(onSelectPerson).not.toHaveBeenCalled()
  })

  it('a click puts the keyboard where the pointer went', () => {
    const { frame, onSelectPerson } = mountTreeAndClick()
    expect(onSelectPerson).toHaveBeenCalledWith(id(4))
    expect(cursor(frame).getAttribute('data-person-id')).toBe(id(4))
  })

  function mountTreeAndClick() {
    const mounted = mountTree(smallFamily())
    const anna = mounted.frame.querySelector(`[data-person-id="${id(4)}"]`)!
    pointer('pointerdown', anna, 100, 100)
    pointer('pointerup', anna, 100, 100)
    return mounted
  }

  it('the keyboard Person stays drawn when the view is panned far away from them', () => {
    const { frame, surface, layout } = mount(500)
    const before = cursor(frame).getAttribute('data-person-id')
    pointer('pointerdown', surface, 200, 150)
    for (let i = 1; i <= 12; i++) {
      pointer('pointermove', surface, 200 - i * 80, 150)
      settle(16)
    }
    pointer('pointerup', surface, -800, 150)
    settle()
    expect(frame.querySelectorAll('[data-person-id]').length).toBeLessThan(layout.count)
    expect(cursor(frame).getAttribute('data-person-id')).toBe(before)
  })

  it('moving keeps the Person on screen', () => {
    const { frame, layout } = mount(500)
    cursor(frame).focus()
    for (let i = 0; i < 4; i++) press('ArrowUp')
    const index = layout.ids.indexOf(active()!)
    const view = viewOf(frame)
    const x = layout.x[index]! * view.k + view.x
    const y = layout.y[index]! * view.k + view.y
    expect(x).toBeGreaterThan(0)
    expect(x).toBeLessThan(size.width)
    expect(y).toBeGreaterThan(0)
    expect(y).toBeLessThan(size.height)
  })
})

describe('empty Tree', () => {
  it('shows the trunk and roots and does not crash', () => {
    const layout = layoutTree({ focusPersonId: null, persons: [], parentLinks: [], partnerships: [] })
    render(<TreeCanvas layout={layout} persons={[]} focusPersonId={null} />)
    settle()
    const frame = screen.getByRole('group', { name: 'Family tree' })
    expect(frame.querySelectorAll('path').length).toBeGreaterThan(5)
    expect(personNodes(frame)).toHaveLength(0)
  })
})
