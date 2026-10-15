import type { Tree } from '../domain/schema.ts'

/** `saved`: nothing pending. `saving`: a change is waiting for the debounce or being written. `error`: the last write failed. */
export type SaveStatus = 'saved' | 'saving' | 'error'

export const AUTOSAVE_DEBOUNCE_MS = 500

export interface AutosaveOptions {
  /** Calls the listener whenever the Tree may have changed; returns an unsubscribe function. */
  subscribe: (onChange: (tree: Tree, previous: Tree) => void) => () => void
  save: (tree: Tree) => Promise<void>
  onStatus: (status: SaveStatus) => void
  /** Called once, on the first real change (used to request persistent storage). */
  onFirstChange?: () => void
  debounceMs?: number
}

export interface Autosave {
  /** Writes now if anything is pending; resolves when the write has finished. */
  flush: () => Promise<void>
  getStatus: () => SaveStatus
  dispose: () => void
}

const treeChanged = (a: Tree, b: Tree) =>
  a.persons !== b.persons ||
  a.parentLinks !== b.parentLinks ||
  a.partnerships !== b.partnerships ||
  a.focusPersonId !== b.focusPersonId

/**
 * Debounced autosave. A failed write keeps the Tree in memory and sets `error`; it is retried on the next
 * change (not on a timer), as decided in the Undo/redo and data-loss protection ticket.
 */
export function createAutosave(options: AutosaveOptions): Autosave {
  const { subscribe, save, onStatus, onFirstChange, debounceMs = AUTOSAVE_DEBOUNCE_MS } = options
  let status: SaveStatus = 'saved'
  let latest: Tree | undefined
  let dirty = false
  let writing: Promise<void> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let firstChangeSeen = false

  const setStatus = (next: SaveStatus) => {
    if (next === status) return
    status = next
    onStatus(next)
  }

  const write = async () => {
    // Several callers may ask while a write runs; the running loop picks up the newest Tree.
    if (writing) return writing
    writing = (async () => {
      try {
        while (dirty && latest) {
          const tree = latest
          dirty = false
          try {
            await save(tree)
          } catch {
            dirty = true // still unsaved
            setStatus('error')
            return
          }
        }
        setStatus('saved')
      } finally {
        writing = undefined
      }
    })()
    return writing
  }

  const unsubscribe = subscribe((tree, previous) => {
    if (!treeChanged(tree, previous)) return
    if (!firstChangeSeen) {
      firstChangeSeen = true
      onFirstChange?.()
    }
    latest = tree
    dirty = true
    setStatus('saving')
    clearTimeout(timer)
    timer = setTimeout(() => void write(), debounceMs)
  })

  return {
    async flush() {
      clearTimeout(timer)
      if (dirty) await write()
      else if (writing) await writing
    },
    getStatus: () => status,
    dispose() {
      clearTimeout(timer)
      unsubscribe()
    },
  }
}
