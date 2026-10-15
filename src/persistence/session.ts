import type { StoreApi } from 'zustand'
import type { Tree } from '../domain/schema.ts'
import type { TreeState } from '../domain/store.ts'
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

/**
 * Loads the saved Tree into the store, then keeps saving changes. Returns a cleanup function.
 *
 * If the stored document cannot be read, autosave is NOT started, so the unreadable data is never overwritten.
 * If storage itself is unavailable, autosave still starts: every write fails visibly ("Could not save") while
 * the Tree stays in memory and can be exported.
 */
export async function startPersistence(store: StoreApi<TreeState>, storage: TreeStorage): Promise<() => void> {
  setStatus({ load: 'loading', loadMessage: null, save: 'saved' })
  try {
    const loaded = await storage.load()
    if (loaded.status === 'loaded') store.getState().loadTree(loaded.tree)
    if (loaded.status === 'invalid') {
      setStatus({ load: 'invalid', loadMessage: `${loaded.rule}: ${loaded.message}` })
      return () => {}
    }
    setStatus({ load: 'ready' })
  } catch (error) {
    setStatus({ load: 'unavailable', loadMessage: error instanceof Error ? error.message : String(error) })
  }

  const autosave = createAutosave({
    subscribe: (onChange) => store.subscribe((state, previous) => onChange(treeOf(state), treeOf(previous))),
    save: (tree) => storage.save(tree),
    onStatus: (save) => setStatus({ save }),
    onFirstChange: () => {
      void navigator.storage?.persist?.().then(
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

  return () => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    window.removeEventListener('pagehide', onPageHide)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    autosave.dispose()
  }
}
