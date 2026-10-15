import { create } from 'zustand'
import type { SaveStatus } from './autosave.ts'

export type LoadState = 'loading' | 'ready' | 'invalid' | 'unavailable'

interface PersistenceState {
  load: LoadState
  /** Why loading failed (invalid document or storage error). */
  loadMessage: string | null
  save: SaveStatus
  /** Result of `navigator.storage.persist()`; null until asked. */
  persistent: boolean | null
}

export const usePersistenceStatus = create<PersistenceState>()(() => ({
  load: 'loading',
  loadMessage: null,
  save: 'saved',
  persistent: null,
}))
