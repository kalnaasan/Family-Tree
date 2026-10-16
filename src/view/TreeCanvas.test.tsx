import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Profiler } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  const tree = generateTree(count, 1)
  const layout = layoutTree(tree, { nodeRadius: NODE_RADIUS, trunkHeight: TRUNK_HEIGHT, rootsDepth: ROOTS_DEPTH })
  const focusPersonId = options.focus === false ? null : tree.focusPersonId
  const commits = vi.fn()
  render(
    <Profiler id="canvas" onRender={commits}>
      <TreeCanvas layout={layout} persons={tree.persons} focusPersonId={focusPersonId} />
    </Profiler>,
  )
  settle()
  const frame = screen.getByRole('group', { name: 'Family tree' })
  return { tree, layout, commits, frame, surface: frame.firstElementChild as HTMLElement, focusPersonId }
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

  it('Arrows without Shift and browser zoom shortcuts are left alone', () => {
    const { frame } = mount(150)
    const before = viewOf(frame)
    expect(fireEvent.keyDown(frame, { key: 'ArrowLeft' })).toBe(true)
    expect(fireEvent.keyDown(frame, { key: '+', ctrlKey: true })).toBe(true)
    settle(300)
    expect(viewOf(frame)).toEqual(before)
  })

  it('the tree is one tab stop with a name', () => {
    const { frame } = mount(15)
    expect(frame).toHaveAttribute('tabindex', '0')
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
    mount(15)
    for (const button of screen.getAllByRole('button')) expect(button.className).toContain('size-11')
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
