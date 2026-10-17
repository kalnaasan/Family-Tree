import type { StoreApi } from 'zustand'
import type { Tree } from '../domain/schema.ts'
import type { TreeState } from '../domain/store.ts'
import type { PhotoGc } from '../photos/photoGc.ts'
import { createAutosave } from './autosave.ts'
import { usePersistenceStatus } from './saveStatus.ts'
import type { TreeStorage } from './storage.ts'

const setStatus = usePersistenceStatus.setState

/** Only the Tree's data; the store state also holds action functions, which cannot be stored. */
const treeOf = (state: Tree): Tree => ({
  focusPersonId: state.focusPersonId,
  persons: state.persons,
  parentLinks: state.parentLinks,
  partnerships: state.partnerships,
})

/** Ends a session. `flush` writes what is still pending first (nothing for a tab that only looks). */
export type PersistenceSession = (() => void) & { flush: () => Promise<void> }

const session = (stop: () => void, flush: () => Promise<void> = async () => {}): PersistenceSession =>
  Object.assign(stop, { flush })

/**
 * Loads the saved Tree into the store, then keeps saving changes. Returns a cleanup function.
 *
 * If the stored document cannot be read, autosave is NOT started, so the unreadable data is never overwritten.
 * In `reader` mode (another tab is the one editing) the Tree is only loaded: the store refuses changes, and nothing is
 * saved, swept or snapshotted from here, so this tab cannot overwrite what the other one writes.
 * If storage itself is unavailable, autosave still starts: every write fails visibly ("Could not save") while
 * the Tree stays in memory and can be exported.
 */
export async function startPersistence(
  store: StoreApi<TreeState>,
  storage: TreeStorage,
  photoGc?: Pick<PhotoGc, 'sweep' | 'start' | 'stop'>,
  /** Starts what needs the saved Tree to be in the store (automatic Snapshots); returns its cleanup. */
  onTreeLoaded?: () => () => void,
  mode: 'writer' | 'reader' = 'writer',
): Promise<PersistenceSession> {
  store.getState().setReadOnly(mode === 'reader')
  setStatus({ load: 'loading', loadMessage: null, save: 'saved' })
  let treeLoaded = false
  try {
    const loaded = await storage.load()
    if (loaded.status === 'loaded') store.getState().loadTree(loaded.tree)
    if (loaded.status === 'invalid') {
      setStatus({ load: 'invalid', loadMessage: `${loaded.rule}: ${loaded.message}` })
      return session(() => {})
    }
    setStatus({ load: 'ready' })
    treeLoaded = true
  } catch (error) {
    setStatus({ load: 'unavailable', loadMessage: error instanceof Error ? error.message : String(error) })
  }

  if (mode === 'reader') return session(() => {})

  // Photos nothing refers to are deleted on load, then after every change. Only once the saved Tree is really in the
  // store: with an unreadable or unavailable document the Tree here is not the user's, and a sweep would wipe photos.
  if (treeLoaded && photoGc) {
    void photoGc.sweep()
    photoGc.start()
  }
  // Likewise the Snapshot of the loaded Tree: with an unreadable document it would keep a copy of nothing.
  const stopOnLoaded = treeLoaded ? onTreeLoaded?.() : undefined

  const autosave = createAutosave({
    subscribe: (onChange) => store.subscribe((state, previous) => onChange(treeOf(state), treeOf(previous))),
    save: (tree) => storage.save(tree),
    onStatus: (save) => setStatus({ save }),
    onFirstChange: () => {
      const request = navigator.storage?.persist?.()
      // a browser without the call (Safari, older ones) cannot promise to keep the data: the same as a refusal
      if (!request) return setStatus({ persistent: false })
      void request.then(
        (persistent) => setStatus({ persistent }),
        () => setStatus({ persistent: false }),
      )
    },
  })

  // Leaving with unsaved work warns; a saved Tree never triggers the prompt.
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (autosave.getStatus() === 'saved') return
    event.preventDefault()
    event.returnValue = ''
  }
  const onPageHide = () => void autosave.flush()
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') void autosave.flush()
  }
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('pagehide', onPageHide)
  document.addEventListener('visibilitychange', onVisibilityChange)

  return session(() => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    window.removeEventListener('pagehide', onPageHide)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    photoGc?.stop()
    stopOnLoaded?.()
    autosave.dispose()
  }, autosave.flush)
}
