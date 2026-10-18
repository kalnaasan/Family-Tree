import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tree } from '../domain/schema.ts'
import { useTreeStore } from '../domain/store.ts'
import { addParentLink, addPartnership, addPerson, emptyTree } from '../domain/tree.ts'
import { PersonPanel } from './PersonPanel.tsx'
import { useUiStore } from './uiStore.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

function treeOf(names: string[]): Tree {
  return names.reduce((tree, firstName, i) => addPerson(tree, { id: id(i + 1), firstName }), emptyTree())
}

function open(tree: Tree, personId = id(1)) {
  useTreeStore.getState().loadTree(tree)
  const user = userEvent.setup()
  render(<PersonPanel key={personId} personId={personId} onClose={vi.fn()} />)
  return user
}

const choose = (user: ReturnType<typeof userEvent.setup>, relation: string) =>
  user.click(screen.getByRole('button', { name: `Choose ${relation} from the people already in the tree` }))
const rowNames = () => screen.queryAllByRole('option').map((o) => o.textContent)

beforeEach(() => {
  useTreeStore.getState().loadTree(emptyTree())
  useUiStore.setState({ selectedId: null, toast: null })
})
afterEach(cleanup)

describe('the picker', () => {
  it('lists the other people, filters while typing, and says when nothing matches', async () => {
    const user = open(treeOf(['Ben', 'Karl', 'Maria', 'Karla']))
    await choose(user, 'father')
    expect(rowNames()).toEqual(['Karl', 'Maria', 'Karla'])
    await user.type(screen.getByRole('combobox', { name: 'Find someone to link' }), 'kar')
    expect(rowNames()).toEqual(['Karl', 'Karla'])
    await user.type(screen.getByRole('combobox'), 'zzz')
    expect(rowNames()).toEqual([])
    expect(screen.getByText('No one found')).toBeInTheDocument()
  })

  it('shows people who cannot be linked disabled, with the reason as their description', async () => {
    const tree = addParentLink(treeOf(['Ben', 'Karl', 'Maria']), id(1), id(2))
    const user = open(tree)
    await choose(user, 'father')
    const karl = screen.getByRole('option', { name: /Karl/ })
    expect(karl).toHaveAttribute('aria-disabled', 'true')
    expect(karl).toHaveAccessibleDescription('Already linked')
    await user.click(karl)
    expect(screen.queryByText('This will link:')).toBeNull()
    expect(screen.getByRole('option', { name: /Maria/ })).toHaveAttribute('aria-disabled', 'false')
  })

  it('says so when nobody can be linked', async () => {
    const user = open(addParentLink(treeOf(['Ben', 'Karl']), id(1), id(2)))
    await choose(user, 'father')
    expect(screen.getByText('Nobody else can be linked this way')).toBeInTheDocument()
  })

  it('works from the keyboard: type, arrows, Enter, and Escape goes back to the overview', async () => {
    const user = open(treeOf(['Ben', 'Karl', 'Maria']))
    await choose(user, 'mother')
    expect(screen.getByRole('combobox')).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1]!.id)
    await user.keyboard('{Enter}')
    expect(screen.getByText('This will link:')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('heading', { name: 'Ben' })).toHaveFocus()
  })
})

describe('the flow', () => {
  it('links an existing father: preview, one Undo step, heading focused', async () => {
    const user = open(treeOf(['Ben', 'Karl']))
    await choose(user, 'father')
    await user.click(screen.getByRole('option', { name: /Karl/ }))
    expect(within(screen.getByText('This will link:').parentElement!).getByText('Karl, father of Ben')).toBeInTheDocument()
    const steps = useTreeStore.getState().past.length
    await user.click(screen.getByRole('button', { name: 'Link as father' }))
    expect(useTreeStore.getState().parentLinks).toEqual([{ childId: id(1), parentId: id(2), kind: 'birth' }])
    expect(useTreeStore.getState().past).toHaveLength(steps + 1)
    expect(screen.getByRole('heading', { name: 'Ben' })).toHaveFocus()
    useTreeStore.getState().undo()
    expect(useTreeStore.getState().parentLinks).toEqual([])
  })

  it('asks the partnership question for a second parent, but not when they already are partners', async () => {
    let tree = addParentLink(treeOf(['Ben', 'Karl', 'Maria']), id(1), id(2))
    const user = open(tree)
    await choose(user, 'mother')
    await user.click(screen.getByRole('option', { name: /Maria/ }))
    expect(screen.getByRole('group', { name: /connected to Karl/ })).toBeInTheDocument()
    cleanup()
    tree = addPartnership(tree, { personIds: [id(2), id(3)], status: 'ended' })
    const again = open(tree)
    await choose(again, 'mother')
    await again.click(screen.getByRole('option', { name: /Maria/ }))
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('links an existing child, a partner and a half-sibling', async () => {
    let user = open(treeOf(['Anna', 'Cora']))
    await choose(user, 'child')
    await user.click(screen.getByRole('option', { name: /Cora/ }))
    await user.click(screen.getByRole('button', { name: 'Link as child' }))
    expect(useTreeStore.getState().parentLinks).toEqual([{ childId: id(2), parentId: id(1), kind: 'birth' }])
    cleanup()

    user = open(treeOf(['Anna', 'Ben']))
    await choose(user, 'partner')
    await user.click(screen.getByRole('option', { name: /Ben/ }))
    await user.click(screen.getByRole('radio', { name: /ended/i }))
    await user.click(screen.getByRole('button', { name: 'Link as partner' }))
    expect(useTreeStore.getState().partnerships[0]).toMatchObject({ status: 'ended', personIds: [id(1), id(2)] })
    cleanup()

    const tree = addParentLink(addParentLink(treeOf(['Ben', 'Karl', 'Maria', 'Eva']), id(1), id(2)), id(1), id(3))
    user = open(tree)
    await choose(user, 'sister')
    await user.click(screen.getByRole('option', { name: /Eva/ }))
    await user.click(screen.getByRole('radio', { name: /only Maria/i }))
    await user.click(screen.getByRole('button', { name: 'Link as sister' }))
    const evaParents = useTreeStore.getState().parentLinks.filter((l) => l.childId === id(4)).map((l) => l.parentId)
    expect(evaParents).toEqual([id(3)])
  })

  it('explains a dead end instead of listing people when the Person has two birth parents already', async () => {
    const tree = addParentLink(addParentLink(treeOf(['Ben', 'Karl', 'Maria', 'Eva']), id(1), id(2)), id(1), id(3))
    const user = open(tree)
    await choose(user, 'father')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('forgets the answers when someone else is chosen, so none carries over to the next person', async () => {
    let tree = addPartnership(treeOf(['Anna', 'Ben', 'Cora', 'Dan']), { personIds: [id(1), id(2)], status: 'current' })
    tree = addPartnership(tree, { personIds: [id(1), id(3)], status: 'current' })
    const user = open(tree)
    await choose(user, 'child')
    await user.click(screen.getByRole('option', { name: /Dan/ }))
    await user.click(screen.getByRole('radio', { name: /Cora/ }))
    await user.click(screen.getByRole('button', { name: 'Choose someone else' }))
    await user.click(screen.getByRole('option', { name: /Cora/ }))
    expect(screen.getByText('This will link:')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Link as child' }))
    expect(useTreeStore.getState().parentLinks.filter((l) => l.childId === id(3)).map((l) => l.parentId)).toEqual([id(1)])
  })

  it('does not ask which parents a sibling shares when they already share one', async () => {
    let tree = addParentLink(addParentLink(treeOf(['Ben', 'Karl', 'Maria', 'Eva']), id(1), id(2)), id(1), id(3))
    tree = addParentLink(tree, id(4), id(2))
    const user = open(tree)
    await choose(user, 'sister')
    await user.click(screen.getByRole('option', { name: /Eva/ }))
    expect(screen.queryByRole('radio')).toBeNull()
  })
})
