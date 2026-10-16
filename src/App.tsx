import { SaveIndicator } from './components/SaveIndicator.tsx'
import { useTreeStore } from './domain/store.ts'
import { usePersistenceStatus } from './persistence/saveStatus.ts'
import { usePersistence } from './persistence/usePersistence.ts'
import { EmptyState } from './ui/EmptyState.tsx'
import { ListView } from './ui/ListView.tsx'
import { PersonPanel } from './ui/PersonPanel.tsx'
import { SearchBox } from './ui/SearchBox.tsx'
import { Toast } from './ui/Toast.tsx'
import { UndoControls } from './ui/UndoControls.tsx'
import { useUndoShortcuts } from './ui/undo.ts'
import { useUiStore } from './ui/uiStore.ts'
import { focusTree } from './view/focusTree.ts'
import { TreeView } from './view/TreeView.tsx'

export function App() {
  usePersistence()
  useUndoShortcuts()
  const load = usePersistenceStatus((s) => s.load)
  const loadMessage = usePersistenceStatus((s) => s.loadMessage)
  const persons = useTreeStore((s) => s.persons)
  const selectedId = useUiStore((s) => s.selectedId)
  const select = useUiStore((s) => s.select)
  const listView = useUiStore((s) => s.listView)
  const setListView = useUiStore((s) => s.setListView)
  const open = persons.some((p) => p.id === selectedId) ? selectedId : null

  const closePanel = () => {
    select(null)
    useUiStore.getState().setSheet('peek')
    // hand the keyboard back to the tree (in the list view there is nothing to hand back to)
    if (!listView) focusTree()
  }

  return (
    <main className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
        <h1 className="text-2xl font-semibold">Family Tree</h1>
        <div className="flex flex-wrap items-center gap-3">
          {persons.length > 0 && <SearchBox />}
          {persons.length > 0 && (
            <button
              type="button"
              aria-pressed={listView}
              onClick={() => setListView(!listView)}
              className="min-h-11 rounded border border-stone-500 px-3 aria-pressed:bg-stone-200 aria-pressed:font-semibold"
            >
              List view
            </button>
          )}
          <UndoControls />
          <SaveIndicator />
        </div>
      </header>

      {load === 'invalid' && (
        <p role="alert" className="mx-4 mt-2 rounded border border-red-800 p-3 text-red-800">
          Your saved tree could not be read ({loadMessage}). It has not been changed, and nothing will be saved
          until this is resolved.
        </p>
      )}
      {load === 'unavailable' && (
        <p role="alert" className="mx-4 mt-2 rounded border border-red-800 p-3 text-red-800">
          Saving is not available in this browser ({loadMessage}). Changes will be lost when you leave; export a
          backup to keep them.
        </p>
      )}

      {load !== 'loading' && load !== 'invalid' && (
        <>
          {persons.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="relative flex min-h-0 flex-1">
              <div className="min-h-0 min-w-0 flex-1">{listView ? <ListView /> : <TreeView />}</div>
              {open && <PersonPanel key={open} personId={open} onClose={closePanel} />}
            </div>
          )}
        </>
      )}
      <Toast />
    </main>
  )
}
