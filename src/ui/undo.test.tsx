import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTreeStore } from '../domain/store.ts'
import { addParentLink, addPerson, emptyTree } from '../domain/tree.ts'
import { TOAST_VISIBLE_MS, Toast } from './Toast.tsx'
import { UndoControls } from './UndoControls.tsx'
import { useUndoShortcuts } from './undo.ts'
import { useUiStore } from './uiStore.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
const names = () => useTreeStore.getState().persons.map((p) => p.firstName)

function Harness() {
  useUndoShortcuts()
  return (
    <>
      <UndoControls />
      <input aria-label="Name" />
      <Toast />
    </>
  )
}

beforeEach(() => {
  let tree = ['Ben', 'Karl', 'Maria'].reduce((t, firstName, i) => addPerson(t, { id: id(i + 1), firstName }), emptyTree())
  tree = addParentLink(addParentLink(tree, id(1), id(2)), id(1), id(3))
  useTreeStore.getState().loadTree(tree)
  useUiStore.setState({ selectedId: null, toast: null })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('buttons', () => {
  it('Undo and Redo are disabled until there is something to undo or redo', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const undo = screen.getByRole('button', { name: 'Undo' })
    const redo = screen.getByRole('button', { name: 'Redo' })
    expect(undo).toBeDisabled()
    expect(redo).toBeDisabled()

    act(() => void useTreeStore.getState().updatePerson(id(1), { firstName: 'Benno' }))
    expect(undo).toBeEnabled()
    await user.click(undo)
    expect(names()[0]).toBe('Ben')
    expect(undo).toBeDisabled()
    expect(redo).toBeEnabled()
    await user.click(redo)
    expect(names()[0]).toBe('Benno')
  })

  it('announces what was undone and redone', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    act(() => void useTreeStore.getState().setFocusPerson(id(2)))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText('Undid: Change Focus person')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    expect(screen.getByText('Redid: Change Focus person')).toBeInTheDocument()
  })
})

describe('keyboard shortcuts', () => {
  const change = () => act(() => void useTreeStore.getState().updatePerson(id(1), { firstName: 'Benno' }))

  it.each([
    ['Ctrl+Z', { key: 'z', ctrlKey: true }],
    ['Cmd+Z', { key: 'z', metaKey: true }],
  ])('%s undoes', (_name, init) => {
    render(<Harness />)
    change()
    fireEvent.keyDown(document.body, init)
    expect(names()[0]).toBe('Ben')
  })

  it.each([
    ['Ctrl+Shift+Z', { key: 'Z', ctrlKey: true, shiftKey: true }],
    ['Cmd+Shift+Z', { key: 'Z', metaKey: true, shiftKey: true }],
    ['Ctrl+Y', { key: 'y', ctrlKey: true }],
  ])('%s redoes', (_name, init) => {
    render(<Harness />)
    change()
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })
    fireEvent.keyDown(document.body, init)
    expect(names()[0]).toBe('Benno')
  })

  it('takes the key from the browser when it acts, and leaves it alone otherwise', () => {
    render(<Harness />)
    change()
    expect(fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })).toBe(false) // default prevented
    expect(fireEvent.keyDown(document.body, { key: 'z' })).toBe(true)
    expect(fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, altKey: true })).toBe(true)
  })

  it('does not steal Ctrl+Z from a text field', () => {
    render(<Harness />)
    change()
    const input = screen.getByLabelText('Name')
    input.focus()
    expect(fireEvent.keyDown(input, { key: 'z', ctrlKey: true })).toBe(true)
    expect(names()[0]).toBe('Benno')
  })
})

describe('after an undo that removes the open Person', () => {
  it('closes their panel', () => {
    render(<Harness />)
    let newId = ''
    act(() => {
      newId = useTreeStore.getState().addRelative({ anchorId: id(1), relation: 'sister', person: { firstName: 'Anna' } })
      useUiStore.getState().select(newId)
    })
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })
    expect(useUiStore.getState().selectedId).toBeNull()
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(names()).toContain('Anna')
  })
})

describe('delete toast', () => {
  function deleteBen() {
    act(() => {
      useTreeStore.getState().deletePerson(id(1))
      useUiStore.getState().showToast('Deleted Ben, with 2 parent links', useTreeStore.getState().past.at(-1)!.id)
    })
  }

  it('names what was removed and offers Undo, which restores the Person and their links', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    deleteBen()
    expect(screen.getByText(/Deleted Ben, with 2 parent links/)).toBeInTheDocument()
    expect(names()).not.toContain('Ben')
    await user.click(screen.getAllByRole('button', { name: 'Undo' }).at(-1)!)
    expect(names()).toContain('Ben')
    expect(useTreeStore.getState().parentLinks).toHaveLength(2)
    expect(screen.getByText('Undid: Delete Ben')).toBeInTheDocument()
  })

  it('shows Undo only while the delete is still the latest action', () => {
    render(<Harness />)
    deleteBen()
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(2) // toolbar and toast
    act(() => void useTreeStore.getState().updatePerson(id(2), { firstName: 'Carl' }))
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1)
    expect(screen.getByText(/Deleted Ben/)).toBeInTheDocument()
  })

  it('stays for 8 seconds, then goes', () => {
    vi.useFakeTimers()
    render(<Harness />)
    deleteBen()
    expect(TOAST_VISIBLE_MS).toBe(8000)
    act(() => void vi.advanceTimersByTime(TOAST_VISIBLE_MS - 1))
    expect(screen.queryByText(/Deleted Ben/)).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(1))
    expect(screen.queryByText(/Deleted Ben/)).toBeNull()
  })

  it('Dismiss closes it at once', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    deleteBen()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/Deleted Ben/)).toBeNull()
  })
})
