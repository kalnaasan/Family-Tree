import { useState } from 'react'
import { SaveIndicator } from './components/SaveIndicator.tsx'
import { useTreeStore } from './domain/store.ts'
import { isolate } from './i18n/format.ts'
import { useT } from './i18n/useT.ts'
import { usePersistenceStatus } from './persistence/saveStatus.ts'
import { usePersistence } from './persistence/usePersistence.ts'
import { BackupBanner } from './ui/BackupBanner.tsx'
import { EmptyState } from './ui/EmptyState.tsx'
import { ListView } from './ui/ListView.tsx'
import { PersonPanel } from './ui/PersonPanel.tsx'
import { ReadOnlyBanner } from './ui/ReadOnlyBanner.tsx'
import { SearchBox } from './ui/SearchBox.tsx'
import { SettingsDialog } from './ui/SettingsDialog.tsx'
import { ListIcon, SettingsIcon } from './ui/icons.tsx'
import { Toast } from './ui/Toast.tsx'
import { UndoControls } from './ui/UndoControls.tsx'
import { useUndoShortcuts } from './ui/undo.ts'
import { useUiStore } from './ui/uiStore.ts'
import { focusTree } from './view/focusTree.ts'
import { TreeView } from './view/TreeView.tsx'

export function App() {
  usePersistence()
  useUndoShortcuts()
  const t = useT()
  const load = usePersistenceStatus((s) => s.load)
  const loadMessage = usePersistenceStatus((s) => s.loadMessage)
  const persons = useTreeStore((s) => s.persons)
  const readOnly = useTreeStore((s) => s.readOnly)
  const selectedId = useUiStore((s) => s.selectedId)
  const select = useUiStore((s) => s.select)
  const listView = useUiStore((s) => s.listView)
  const setListView = useUiStore((s) => s.setListView)
  const open = persons.some((p) => p.id === selectedId) ? selectedId : null
  const [settingsOpen, setSettingsOpen] = useState(false)

  const closePanel = () => {
    select(null)
    useUiStore.getState().setSheet('peek')
    // hand the keyboard back to the tree (in the list view there is nothing to hand back to)
    if (!listView) focusTree()
  }

  return (
    <main className="flex h-dvh flex-col">
      <header className="border-b border-line bg-paper-deep/60 px-4 py-2">
        <div className="flex items-center gap-2">
          <h1 className="mr-auto text-xl font-semibold tracking-tight text-bark sm:text-2xl">{t('app.title')}</h1>
          <SaveIndicator />
          <UndoControls />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label={t('app.settings')}
            title={t('app.settings')}
            className="btn btn-icon"
          >
            <SettingsIcon />
          </button>
        </div>
        {persons.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <SearchBox />
            <button
              type="button"
              aria-pressed={listView}
              onClick={() => setListView(!listView)}
              className="btn shrink-0 px-3 aria-pressed:border-leaf-deep aria-pressed:bg-leaf-deep aria-pressed:text-white"
            >
              <ListIcon />
              {t('app.listView')}
            </button>
          </div>
        )}
      </header>

      {load === 'invalid' && (
        <p role="alert" className="mx-4 mt-2 rounded border border-red-800 p-3 text-red-800">
          {t('app.loadInvalid', { detail: isolate(loadMessage ?? '') })}
        </p>
      )}
      {load === 'unavailable' && (
        <p role="alert" className="mx-4 mt-2 rounded border border-red-800 p-3 text-red-800">
          {t('app.loadUnavailable', { detail: isolate(loadMessage ?? '') })}
        </p>
      )}

      <ReadOnlyBanner />
      {!readOnly && persons.length > 0 && (load === 'ready' || load === 'unavailable') && <BackupBanner />}

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
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </main>
  )
}
