import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tree } from '../domain/schema.ts'
import { useTreeStore } from '../domain/store.ts'
import { addParentLink, addPartnership, addPerson, emptyTree } from '../domain/tree.ts'
import { PersonPanel } from './PersonPanel.tsx'
import { Toast } from './Toast.tsx'
import { useUiStore } from './uiStore.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

function treeOf(names: string[]): Tree {
  return names.reduce((tree, firstName, i) => addPerson(tree, { id: id(i + 1), firstName }), emptyTree())
}

function open(tree: Tree, personId = id(1)) {
  useTreeStore.getState().loadTree(tree)
  const user = userEvent.setup()
  render(
    <>
      <PersonPanel key={personId} personId={personId} onClose={vi.fn()} />
      <Toast />
    </>,
  )
  return user
}

const menuOf = (name: string) => screen.getByRole('button', { name: `Link options for ${name}` })
const choose = async (user: ReturnType<typeof userEvent.setup>, name: string, item: 'Edit link' | 'Remove link') => {
  await user.click(menuOf(name))
  await user.click(screen.getByRole('menuitem', { name: item }))
}
const dialog = () => screen.getByRole('dialog')
const links = () => useTreeStore.getState().parentLinks

beforeEach(() => {
  useTreeStore.getState().loadTree(emptyTree())
  useUiStore.setState({ selectedId: null, toast: null })
})
afterEach(cleanup)

describe('the chip menu', () => {
  it('is on parent, child and partner chips, and not on a derived sibling', () => {
    let tree = addParentLink(addParentLink(treeOf(['Ben', 'Karl', 'Anna', 'Leo', 'Lea']), id(1), id(2)), id(3), id(2))
    tree = addParentLink(tree, id(4), id(1))
    tree = addPartnership(tree, { personIds: [id(1), id(5)], status: 'current' })
    open(tree)
    for (const name of ['Karl', 'Leo', 'Lea']) expect(menuOf(name)).toHaveAttribute('aria-haspopup', 'menu')
    expect(screen.queryByRole('button', { name: 'Link options for Anna' })).toBeNull()
    expect(screen.getByRole('button', { name: /^Anna/ })).toBeInTheDocument()
  })

  it('offers Edit link and Remove link, opens on click, closes on Escape and gives the focus back', async () => {
    const user = open(addParentLink(treeOf(['Ben', 'Karl']), id(1), id(2)))
    await user.click(menuOf('Karl'))
    expect(menuOf('Karl')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Edit link', 'Remove link'])
    expect(screen.getByRole('menuitem', { name: 'Edit link' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Remove link' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(menuOf('Karl')).toHaveFocus()
    expect(screen.getByRole('heading', { name: 'Ben' })).toBeInTheDocument()
  })

  it('is not there while another tab edits', () => {
    useTreeStore.getState().setReadOnly(true)
    open(addParentLink(treeOf(['Ben', 'Karl']), id(1), id(2)))
    expect(screen.queryByRole('button', { name: /Link options/ })).toBeNull()
    useTreeStore.getState().setReadOnly(false)
  })
})

describe('Remove link', () => {
  it('removes a Parent link at once, keeps both people, and the toast offers Undo', async () => {
    const user = open(addParentLink(treeOf(['Ben', 'Karl']), id(1), id(2)))
    const steps = useTreeStore.getState().past.length
    await choose(user, 'Karl', 'Remove link')
    expect(links()).toEqual([])
    expect(useTreeStore.getState().persons).toHaveLength(2)
    expect(useTreeStore.getState().past).toHaveLength(steps + 1)
    expect(screen.getByText(/Removed link between Ben and Karl/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ben' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(links()).toHaveLength(1)
  })

  it('removes a Partnership and a child link', async () => {
    let tree = addPartnership(treeOf(['Ben', 'Lea', 'Leo']), { personIds: [id(1), id(2)], status: 'current' })
    tree = addParentLink(tree, id(3), id(1))
    const user = open(tree)
    await choose(user, 'Lea', 'Remove link')
    expect(useTreeStore.getState().partnerships).toEqual([])
    await choose(user, 'Leo', 'Remove link')
    expect(links()).toEqual([])
    expect(screen.getByText(/Removed link between Leo and Ben/)).toBeInTheDocument()
  })
})

describe('Edit link: a Parent link', () => {
  it('changes the kind in one Undo step; a step parent stays on the panel and is labelled', async () => {
    const user = open(addParentLink(treeOf(['Ben', 'Karl']), id(1), id(2)))
    const steps = useTreeStore.getState().past.length
    await choose(user, 'Karl', 'Edit link')
    expect(within(dialog()).getByRole('heading', { name: 'Edit link between Ben and Karl' })).toBeInTheDocument()
    await user.click(within(dialog()).getByRole('radio', { name: 'Step parent' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    expect(links()).toEqual([{ childId: id(1), parentId: id(2), kind: 'step' }])
    expect(useTreeStore.getState().past).toHaveLength(steps + 1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(menuOf('Karl')).toHaveFocus()
    expect(screen.getByRole('button', { name: /^Karl.*step/ })).toBeInTheDocument()
    useTreeStore.getState().undo()
    expect(links()[0]!.kind).toBe('birth')
  })

  it('Cancel and Escape change nothing; saving the same kind adds no Undo step', async () => {
    const user = open(addParentLink(treeOf(['Ben', 'Karl']), id(1), id(2)))
    const steps = useTreeStore.getState().past.length
    await choose(user, 'Karl', 'Edit link')
    await user.click(within(dialog()).getByRole('radio', { name: 'Adoptive parent' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    await choose(user, 'Karl', 'Edit link')
    await user.click(within(dialog()).getByRole('radio', { name: 'Adoptive parent' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Ben' })).toBeInTheDocument()
    await choose(user, 'Karl', 'Edit link')
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    expect(links()[0]!.kind).toBe('birth')
    expect(useTreeStore.getState().past).toHaveLength(steps)
  })

  it('disables birth, with the reason, when the child already has two other birth parents', async () => {
    let tree = addParentLink(addParentLink(treeOf(['Ben', 'Karl', 'Maria', 'Eva']), id(1), id(2)), id(1), id(3))
    tree = addParentLink(tree, id(1), id(4), 'adoptive')
    const user = open(tree)
    await choose(user, 'Eva', 'Edit link')
    const birth = within(dialog()).getByRole('radio', { name: 'Birth parent' })
    expect(birth).toBeDisabled()
    expect(birth).toHaveAccessibleDescription('Would have three birth parents')
    expect(within(dialog()).getByRole('radio', { name: 'Adoptive parent' })).toBeEnabled()
  })
})

describe('Edit link: a Partnership', () => {
  const partners = () => addPartnership(treeOf(['Anna', 'Ben']), { personIds: [id(1), id(2)], status: 'current' })

  it('marks it ended with dates, in one Undo step', async () => {
    const user = open(partners())
    const steps = useTreeStore.getState().past.length
    await choose(user, 'Ben', 'Edit link')
    expect(within(dialog()).queryByLabelText('Ended (optional)')).toBeNull()
    await user.click(within(dialog()).getByRole('radio', { name: 'Ended' }))
    await user.type(within(dialog()).getByLabelText('Together since (optional)'), '1990-05')
    await user.type(within(dialog()).getByLabelText('Ended (optional)'), '2010')
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    expect(useTreeStore.getState().partnerships[0]).toMatchObject({ status: 'ended', startDate: '1990-05', endDate: '2010' })
    expect(useTreeStore.getState().past).toHaveLength(steps + 1)
    expect(screen.getByRole('button', { name: /^Ben.*former/ })).toBeInTheDocument()
  })

  it('refuses a bad date and says how a date is written', async () => {
    const user = open(partners())
    await choose(user, 'Ben', 'Edit link')
    await user.type(within(dialog()).getByLabelText('Together since (optional)'), '1990-13')
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    expect(within(dialog()).getByLabelText('Together since (optional)')).toHaveAttribute('aria-invalid', 'true')
    expect(useTreeStore.getState().partnerships[0]!.startDate).toBeUndefined()
  })

  it('drops the end date when the Partnership is made current again', async () => {
    const tree = addPartnership(treeOf(['Anna', 'Ben']), {
      personIds: [id(1), id(2)],
      status: 'ended',
      startDate: '1990',
      endDate: '2010',
    })
    const user = open(tree)
    await choose(user, 'Ben', 'Edit link')
    await user.click(within(dialog()).getByRole('radio', { name: 'Current' }))
    expect(within(dialog()).queryByLabelText('Ended (optional)')).toBeNull()
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    const saved = useTreeStore.getState().partnerships[0]!
    expect(saved.status).toBe('current')
    expect(saved.endDate).toBeUndefined()
    expect(saved.startDate).toBe('1990')
  })
})
