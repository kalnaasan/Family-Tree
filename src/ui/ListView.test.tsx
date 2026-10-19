import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useTreeStore } from '../domain/store.ts'
import { addParentLink, addPartnership, addPerson, emptyTree } from '../domain/tree.ts'
import { ListView } from './ListView.tsx'
import { useUiStore } from './uiStore.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

/**
 * Karl (1) + Maria (2): Ben (3, Focus person, 1962) and Anna (4). Ben + Eva (5, current) and Zoe (6, ended): Leo (7).
 * Leo + Nina (8): Max (9).
 */
function load() {
  const people = ['Karl', 'Maria', 'Ben', 'Anna', 'Eva', 'Zoe', 'Leo', 'Nina', 'Max']
  let tree = people.reduce(
    (t, firstName, i) => addPerson(t, { id: id(i + 1), firstName, ...(firstName === 'Ben' ? { birthDate: '1962' } : {}) }),
    emptyTree(),
  )
  for (const [child, parent] of [[3, 1], [3, 2], [4, 1], [4, 2], [7, 3], [7, 5], [9, 7], [9, 8]] as const) {
    tree = addParentLink(tree, id(child), id(parent))
  }
  tree = addPartnership(tree, { personIds: [id(3), id(5)], status: 'current' })
  tree = addPartnership(tree, { personIds: [id(3), id(6)], status: 'ended' })
  useTreeStore.getState().loadTree({ ...tree, focusPersonId: id(3) })
}

beforeEach(() => {
  load()
  useUiStore.setState({ selectedId: null })
})
afterEach(cleanup)

/** The button of a Person's own entry, not the "Also listed under" pointer to them under a second parent. */
const item = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}(?! · Also)( |$)`) })

describe('ListView', () => {
  it('lists the Persons with no parents at the top, nested by descent', () => {
    render(<ListView />)
    const top = screen.getAllByRole('list')[0]!
    const roots = [...top.children].map((li) => li.querySelector('button:not([aria-expanded])')!.textContent)
    expect(roots.map((t) => t!.split(' · ')[0])).toEqual(['Karl', 'Maria', 'Eva', 'Zoe', 'Nina'])
    expect(item('Ben')).toHaveTextContent(/^Ben · Focus person · 1962/)
    expect(item('Anna')).toBeInTheDocument()
  })

  it('shows Relationship labels, dates and partners', () => {
    render(<ListView />)
    expect(item('Karl')).toHaveTextContent(/^Karl · parent/)
    expect(item('Ben')).toHaveTextContent('with Eva, Zoe (former)')
    expect(item('Anna')).toHaveTextContent(/^Anna · sibling/)
  })

  it('opens the first two generations and collapses deeper ones', () => {
    render(<ListView />)
    expect(item('Leo')).toBeInTheDocument() // Ben's child: generation 2, shown
    expect(screen.queryByRole('button', { name: /^Max(?! · Also)/ })).toBeNull() // Leo's child: collapsed
    expect(screen.getByRole('button', { name: "Collapse Karl's family" })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: "Expand Leo's family" })).toHaveAttribute('aria-expanded', 'false')
  })

  it('expands and collapses', async () => {
    const user = userEvent.setup()
    render(<ListView />)
    await user.click(screen.getByRole('button', { name: "Expand Leo's family" }))
    expect(item('Max')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: "Collapse Leo's family" }))
    expect(screen.queryByRole('button', { name: /^Max(?! · Also)/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: "Collapse Karl's family" }))
    expect(screen.queryByRole('button', { name: /^Ben ·(?! Also)/ })).toBeNull()
  })

  it('opens the way to whoever is open in the panel, even when they sit in a collapsed branch', () => {
    render(<ListView />)
    expect(screen.queryByRole('button', { name: /^Max(?! · Also)/ })).toBeNull() // Leo's child, collapsed
    act(() => useUiStore.getState().select(id(9)))
    expect(item('Max')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: "Collapse Leo's family" })).toBeInTheDocument()
  })

  it('a branch holding the open Person can still be collapsed by hand', async () => {
    const user = userEvent.setup()
    render(<ListView />)
    act(() => useUiStore.getState().select(id(4))) // Anna, under Karl
    await user.click(screen.getByRole('button', { name: "Collapse Karl's family" }))
    expect(screen.queryByRole('button', { name: /^Anna ·(?! Also)/ })).toBeNull()
  })

  it('lists a Person once in full, and points to them from the second parent', () => {
    render(<ListView />)
    expect(screen.getAllByRole('button', { name: /^Ben ·(?! Also)/ })).toHaveLength(1)
    const pointers = screen.getAllByRole('button', { name: /Also listed under Karl/ })
    expect(pointers.map((p) => p.textContent)).toEqual(['Ben · Also listed under Karl', 'Anna · Also listed under Karl'])
  })

  it('opens a Person in the same panel the tree uses, and marks them as current', async () => {
    const user = userEvent.setup()
    render(<ListView />)
    await user.click(item('Anna'))
    expect(useUiStore.getState().selectedId).toBe(id(4))
    expect(item('Anna')).toHaveAttribute('aria-current', 'true')
    // the first pointer is Maria's entry for Ben, who is listed in full under Karl
    const pointers = within(screen.getByRole('region', { name: 'Family list' })).getAllByRole('button', { name: /Also listed under/ })
    await user.click(pointers[0]!)
    expect(useUiStore.getState().selectedId).toBe(id(3))
  })

  it('says how many children each Person has', () => {
    render(<ListView />)
    expect(item('Karl')).toHaveTextContent('2 children')
    expect(item('Leo')).toHaveTextContent('1 child')
    expect(item('Anna')).not.toHaveTextContent('child')
  })

  it('Expand all opens every branch and Collapse all closes them', async () => {
    const user = userEvent.setup()
    render(<ListView />)
    await user.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(item('Max')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Collapse all' }))
    expect(screen.queryByRole('button', { name: /^Ben/ })).toBeNull()
    // one branch can still be opened by hand afterwards
    await user.click(screen.getByRole('button', { name: "Expand Karl's family" }))
    expect(item('Anna')).toBeInTheDocument()
  })

  it('follows the Tree: a new relative appears', () => {
    render(<ListView />)
    expect(screen.queryByRole('button', { name: /^Tom/ })).toBeNull()
    act(() => void useTreeStore.getState().addRelative({ unnamedParentName: 'Unnamed parent', anchorId: id(3), relation: 'son', person: { firstName: 'Tom' } }))
    expect(item('Tom')).toBeInTheDocument() // Ben's child: generation 2, so shown
  })
})
