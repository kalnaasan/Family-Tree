import type { Person } from '../domain/schema.ts'
import type { TreeState } from '../domain/store.ts'
import type { PhotoStore } from './photoStore.ts'

type Observed = { getState: () => TreeState; subscribe: (listener: () => void) => () => void }

/**
 * Every `photoId` something still needs: the Tree itself and each Tree an undo or redo would bring back. A photo is
 * only deleted once it is in none of them, so undoing a replace, a remove or a delete gets the photo back.
 */
export function referencedPhotoIds(state: Pick<TreeState, 'persons' | 'past' | 'future'>): Set<string> {
  const ids = new Set<string>()
  // steps share their Persons array when they did not change it, so each distinct array is read once
  const seen = new Set<readonly Person[]>()
  const read = (persons: readonly Person[]) => {
    if (seen.has(persons)) return
    seen.add(persons)
    for (const person of persons) if (person.photoId) ids.add(person.photoId)
  }
  read(state.persons)
  for (const step of [...state.past, ...state.future]) {
    read(step.before.persons)
    read(step.after.persons)
  }
  return ids
}

export interface PhotoGc {
  /** Starts sweeping after every change. Call only once the saved Tree has been loaded. */
  start: () => void
  /** Deletes every stored photo that nothing refers to (the orphan sweep on load, and after each change). */
  sweep: () => Promise<void>
  /**
   * Keeps a photo that is stored but not yet in the Tree safe from a sweep. Call the returned function once the Tree
   * refers to it (or the attempt failed).
   */
  protect: (photoId: string) => () => void
  /** Tells the sweep a photo has just been written, so a later sweep knows to look at it. */
  noteStored: (photoId: string) => void
  stop: () => void
}

/**
 * Deletes stored photos nothing refers to, so a replaced, removed or deleted Person's photo does not pile up
 * (spec section 6). `onDeleted` lets the in-memory copies go too.
 */
export function createPhotoGc(store: Observed, photos: PhotoStore, onDeleted?: (photoId: string) => void): PhotoGc {
  /** Photos known to be in storage; loaded on the first sweep, then kept up to date. */
  let known: Set<string> | undefined
  const protectedIds = new Map<string, number>()
  let running = Promise.resolve()
  let unsubscribe: (() => void) | undefined
  let queued = false

  const sweepNow = async () => {
    try {
      known ??= new Set(await photos.keys())
      if (known.size === 0) return
      const keep = referencedPhotoIds(store.getState())
      for (const photoId of [...known]) {
        if (keep.has(photoId) || protectedIds.has(photoId)) continue
        await photos.delete(photoId)
        known.delete(photoId)
        onDeleted?.(photoId)
      }
    } catch {
      // storage trouble: the photos stay, and the next sweep tries again
    }
  }
  const sweep = () => (running = running.then(sweepNow))

  return {
    sweep,
    start() {
      unsubscribe ??= store.subscribe(() => {
        if (queued) return
        queued = true
        // one sweep per burst of changes
        queueMicrotask(() => {
          queued = false
          void sweep()
        })
      })
    },
    noteStored(photoId) {
      // when `known` is not loaded yet, the first sweep reads storage and finds the photo there
      known?.add(photoId)
    },
    protect(photoId) {
      protectedIds.set(photoId, (protectedIds.get(photoId) ?? 0) + 1)
      return () => {
        const count = (protectedIds.get(photoId) ?? 1) - 1
        if (count <= 0) protectedIds.delete(photoId)
        else protectedIds.set(photoId, count)
        void sweep()
      }
    },
    stop() {
      unsubscribe?.()
      unsubscribe = undefined
    },
  }
}
