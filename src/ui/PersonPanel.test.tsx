import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tree } from '../domain/schema.ts'
import { useTreeStore } from '../domain/store.ts'
import { msg } from '../i18n/messageRef.ts'
import { renderEnglish } from '../i18n/testing.ts'
import { addParentLink, addPartnership, addPerson, emptyTree } from '../domain/tree.ts'
import { PersonPanel } from './PersonPanel.tsx'
import { useUiStore } from './uiStore.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

function treeOf(names: string[]): Tree {
  return names.reduce((tree, firstName, i) => addPerson(tree, { id: id(i + 1), firstName }), emptyTree())
}

/** Ben (1) with birth parents Karl (2) and Maria (3); Karl also has Max (5) with Eva (6). */
function benWithParents(): Tree {
  let tree = treeOf(['Ben', 'Karl', 'Maria', 'Anna', 'Max', 'Eva'])
  for (const [child, parent] of [[1, 2], [1, 3], [4, 2], [4, 3], [5, 2], [5, 6]] as const) {
    tree = addParentLink(tree, id(child), id(parent))
  }
  return tree
}

function open(tree: Tree, personId = id(1)) {
  useTreeStore.getState().loadTree(tree)
  const onClose = vi.fn()
  const user = userEvent.setup()
  render(<PersonPanel key={personId} personId={personId} onClose={onClose} />)
  return { user, onClose }
}

const people = () => useTreeStore.getState().persons.map((p) => p.firstName)

beforeEach(() => {
  useTreeStore.getState().loadTree(emptyTree())
  useUiStore.setState({ selectedId: null, toast: null })
})
afterEach(cleanup)

describe('overview', () => {
  it('focuses the heading and groups relatives with their labels', () => {
    open(benWithParents())
    expect(screen.getByRole('heading', { name: 'Ben' })).toHaveFocus()
    const parents = screen.getByRole('region', { name: 'Parents' })
    expect(within(parents).getByRole('button', { name: /Karl · father|Karl/ })).toBeInTheDocument()
    const siblings = screen.getByRole('region', { name: 'Siblings' })
    expect(within(siblings).getByRole('button', { name: /Anna/ })).toBeInTheDocument()
    expect(within(siblings).getByRole('button', { name: /Max.*half/ })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Children' })).getByText('None recorded')).toBeInTheDocument()
  })

  it('shows the Focus person as such and offers "Make Focus person" to everyone else', async () => {
    const { user } = open(benWithParents())
    expect(screen.getByText(/Focus person/, { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make Focus person' })).toBeNull()
    cleanup()
    render(<PersonPanel key={id(2)} personId={id(2)} onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Make Focus person' }))
    expect(useTreeStore.getState().focusPersonId).toBe(id(2))
  })

  it('clicking a relative selects them', async () => {
    const { user } = open(benWithParents())
    await user.click(screen.getByRole('button', { name: /Karl/ }))
    expect(useUiStore.getState().selectedId).toBe(id(2))
  })

  it('Escape closes the panel', async () => {
    const { user, onClose } = open(benWithParents())
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})

describe('add relative: parents', () => {
  it('a third birth parent is blocked with a message and no form', async () => {
    const { user } = open(benWithParents())
    await user.click(screen.getByRole('button', { name: 'Add father' }))
    expect(screen.getByRole('alert')).toHaveTextContent('already has two birth parents')
    expect(screen.queryByRole('button', { name: /^Add father$/ })).toBeNull()
    expect(people()).toHaveLength(6)
  })

  it('with one parent asks about the partnership, defaulting to current, and previews it', async () => {
    let tree = treeOf(['Ben', 'Karl'])
    tree = addParentLink(tree, id(1), id(2))
    const { user } = open(tree)
    await user.click(screen.getByRole('button', { name: 'Add mother' }))
    expect(screen.getByRole('radio', { name: 'Current partner' })).toBeChecked()
    await user.type(screen.getByLabelText('First name'), 'Maria')
    expect(screen.getByText('Maria, mother of Ben')).toBeInTheDocument()
    expect(screen.getByText('A current partnership with Karl')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Former partner (ended)' }))
    expect(screen.getByText('An ended partnership with Karl')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add mother' }))
    expect(useTreeStore.getState().partnerships.map((p) => p.status)).toEqual(['ended'])
  })
})

describe('add relative: siblings', () => {
  it('with two parents offers both or only one, and creates a half-sibling in one store update', async () => {
    const { user } = open(benWithParents())
    const updates = vi.fn()
    useTreeStore.subscribe(updates)
    await user.click(screen.getByRole('button', { name: 'Add brother' }))
    expect(screen.getByRole('radio', { name: 'Both: Karl and Maria' })).toBeChecked()
    await user.type(screen.getByLabelText('First name'), 'Tom')
    await user.click(screen.getByRole('radio', { name: 'Only Karl (half-sibling)' }))
    expect(screen.getByText('Half-sibling: shares only Karl as parent')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add brother' }))
    expect(updates).toHaveBeenCalledTimes(1)
    const tom = useTreeStore.getState().persons.find((p) => p.firstName === 'Tom')!
    expect(useTreeStore.getState().parentLinks.filter((l) => l.childId === tom.id)).toHaveLength(1)
    expect(useUiStore.getState().selectedId).toBe(tom.id)
  })

  it('with one parent asks nothing; with none it announces the unnamed parent', async () => {
    let tree = treeOf(['Ben', 'Karl'])
    tree = addParentLink(tree, id(1), id(2))
    const first = open(tree)
    await first.user.click(screen.getByRole('button', { name: 'Add sister' }))
    expect(screen.queryByRole('group')).toBeNull()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('with no parents the preview names the unnamed parent', async () => {
    const { user } = open(treeOf(['Ben']))
    await user.click(screen.getByRole('button', { name: 'Add sister' }))
    expect(screen.getByText(/A new parent, "Unnamed parent", of both/)).toBeInTheDocument()
  })
})

describe('add relative: children and partners', () => {
  it('a child with no partners asks nothing', async () => {
    const { user } = open(treeOf(['Ben']))
    await user.click(screen.getByRole('button', { name: 'Add son' }))
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    await user.type(screen.getByLabelText('First name'), 'Leo')
    await user.click(screen.getByRole('button', { name: 'Add son' }))
    expect(people()).toEqual(['Ben', 'Leo'])
  })

  it('a child with partners defaults to the latest current partner and always offers nobody', async () => {
    let tree = treeOf(['Ben', 'Old', 'Eva'])
    tree = addPartnership(tree, { personIds: [id(1), id(2)], status: 'ended' })
    tree = addPartnership(tree, { personIds: [id(1), id(3)], status: 'current' })
    const { user } = open(tree)
    await user.click(screen.getByRole('button', { name: 'Add daughter' }))
    expect(screen.getByRole('radio', { name: 'Eva (current partner)' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Old (former partner)' })).not.toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Nobody / not recorded' }))
    await user.type(screen.getByLabelText('First name'), 'Mia')
    expect(screen.getByText('Mia, daughter of Ben')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add daughter' }))
    const mia = useTreeStore.getState().persons.find((p) => p.firstName === 'Mia')!
    expect(useTreeStore.getState().parentLinks.filter((l) => l.childId === mia.id)).toHaveLength(1)
  })

  it('a partner is current by default and can be ended', async () => {
    const { user } = open(treeOf(['Ben']))
    await user.click(screen.getByRole('button', { name: 'Add wife' }))
    expect(screen.getByRole('radio', { name: 'Current' })).toBeChecked()
    expect(screen.getByLabelText('Gender')).toHaveValue('female')
    await user.type(screen.getByLabelText('First name'), 'Eva')
    await user.click(screen.getByRole('radio', { name: 'Ended' }))
    await user.click(screen.getByRole('button', { name: 'Add wife' }))
    expect(useTreeStore.getState().partnerships.map((p) => p.status)).toEqual(['ended'])
  })

  it('needs a first name and says so', async () => {
    const { user } = open(treeOf(['Ben']))
    await user.click(screen.getByRole('button', { name: 'Add son' }))
    await user.click(screen.getByRole('button', { name: 'Add son' }))
    expect(screen.getByText('Enter a first name')).toBeInTheDocument()
    expect(people()).toEqual(['Ben'])
  })

  it('Cancel goes back to the overview without adding anyone', async () => {
    const { user } = open(treeOf(['Ben']))
    await user.click(screen.getByRole('button', { name: 'Add son' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('region', { name: 'Children' })).toBeInTheDocument()
    expect(people()).toEqual(['Ben'])
  })
})

describe('edit and delete', () => {
  it('edits a Person, with date validation', async () => {
    const { user } = open(treeOf(['Ben']))
    await user.click(screen.getByRole('button', { name: 'Edit details' }))
    await user.clear(screen.getByLabelText('First name'))
    await user.type(screen.getByLabelText('First name'), 'Benno')
    await user.type(screen.getByLabelText('Born (optional)'), 'nonsense')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getAllByText('Use YYYY, YYYY-MM or YYYY-MM-DD').length).toBeGreaterThan(0)
    expect(people()).toEqual(['Ben'])
    await user.clear(screen.getByLabelText('Born (optional)'))
    await user.type(screen.getByLabelText('Born (optional)'), '1962-04')
    await user.type(screen.getByLabelText('Died (optional)'), '2001')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const ben = useTreeStore.getState().persons[0]!
    expect(ben).toMatchObject({ firstName: 'Benno', birthDate: '1962-04', deathDate: '2001', deceased: true })
  })

  it('delete needs no confirmation, names what went with the Person, offers Undo, and closes', async () => {
    const { user, onClose } = open(benWithParents())
    await user.click(screen.getByRole('button', { name: 'Delete Ben' }))
    expect(people()).not.toContain('Ben')
    const toast = useUiStore.getState().toast!
    expect(renderEnglish(toast.message)).toBe('Deleted Ben, with 2 parent links')
    // what went with Ben is a message too, so the toast is worded in the language in use when it is drawn
    expect(toast.message).toEqual(msg('toast.deletedWith', { name: 'Ben', parts: msg('toast.parentLinks', { count: 2 }) }))
    expect(toast.undoStepId).toBe(useTreeStore.getState().past.at(-1)!.id)
    expect(onClose).toHaveBeenCalled()
  })
})
