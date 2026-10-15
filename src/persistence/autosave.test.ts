import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tree } from '../domain/schema.ts'
import { addPerson, emptyTree } from '../domain/tree.ts'
import { type SaveStatus, createAutosave } from './autosave.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function setup(save: (tree: Tree) => Promise<void>) {
  let listener: (tree: Tree, previous: Tree) => void = () => {}
  const statuses: SaveStatus[] = []
  const onFirstChange = vi.fn()
  const autosave = createAutosave({
    subscribe: (cb) => {
      listener = cb
      return () => {}
    },
    save,
    onStatus: (s) => statuses.push(s),
    onFirstChange,
  })
  let current = emptyTree()
  const change = (n: number) => {
    const previous = current
    current = addPerson(current, { id: id(n), firstName: `P${n}` })
    listener(current, previous)
    return current
  }
  return { autosave, statuses, onFirstChange, change, nothingChanged: () => listener(current, current) }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('autosave', () => {
  it('waits for the debounce, then writes the newest Tree once', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { change, statuses } = setup(save)
    change(1)
    await vi.advanceTimersByTimeAsync(300)
    const last = change(2)
    await vi.advanceTimersByTimeAsync(499)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(last)
    expect(statuses).toEqual(['saving', 'saved'])
  })

  it('does nothing when the Tree did not change', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { nothingChanged, statuses } = setup(save)
    nothingChanged()
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).not.toHaveBeenCalled()
    expect(statuses).toEqual([])
  })

  it('reports error on a failed write, keeps the Tree, and retries on the next change', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined)
    const { change, statuses, autosave } = setup(save)
    change(1)
    await vi.advanceTimersByTimeAsync(500)
    expect(autosave.getStatus()).toBe('error')
    expect(statuses).toEqual(['saving', 'error'])
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1) // no timer-driven retry

    const next = change(2)
    expect(autosave.getStatus()).toBe('saving')
    await vi.advanceTimersByTimeAsync(500)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(next) // the failed first change is included
    expect(next.persons).toHaveLength(2)
    expect(autosave.getStatus()).toBe('saved')
  })

  it('writes again when a change arrives during a write', async () => {
    let release: () => void = () => {}
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)))
      .mockResolvedValue(undefined)
    const { change, autosave } = setup(save)
    change(1)
    await vi.advanceTimersByTimeAsync(500) // write 1 starts and hangs
    const second = change(2)
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(second)
    expect(autosave.getStatus()).toBe('saved')
  })

  it('calls onFirstChange only once', () => {
    const { change, onFirstChange } = setup(vi.fn().mockResolvedValue(undefined))
    change(1)
    change(2)
    expect(onFirstChange).toHaveBeenCalledTimes(1)
  })

  it('flush writes immediately', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { change, autosave } = setup(save)
    change(1)
    await autosave.flush()
    expect(save).toHaveBeenCalledTimes(1)
    expect(autosave.getStatus()).toBe('saved')
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(1)
  })
})
