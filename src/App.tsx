import { useRef, useState } from 'react'
import { useTreeStore } from './domain/store.ts'
import { isolate } from './i18n/format.ts'
import { useT } from './i18n/useT.ts'
import { usePersistenceStatus } from './persistence/saveStatus.ts'
import { usePersistence } from './persistence/usePersistence.ts'
import { AppHeader } from './ui/AppHeader.tsx'
import { BackupBanner } from './ui/BackupBanner.tsx'
import { EmptyState } from './ui/EmptyState.tsx'
import { ListView } from './ui/ListView.tsx'
import { PersonPanel } from './ui/PersonPanel.tsx'
import { ReadOnlyBanner } from './ui/ReadOnlyBanner.tsx'
import { SettingsDialog } from './ui/SettingsDialog.tsx'
import { Toast } from './ui/Toast.tsx'
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
  const open = persons.some((p) => p.id === selectedId) ? selectedId : null
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsButton = useRef<HTMLButtonElement>(null)

  const closePanel = () => {
    select(null)
    useUiStore.getState().setSheet('peek')
    // hand the keyboard back to the tree (in the list view there is nothing to hand back to)
    if (!listView) focusTree()
  }

  return (
    <main className="flex h-dvh flex-col">
      <AppHeader onOpenSettings={() => setSettingsOpen(true)} settingsButtonRef={settingsButton} />

      {load === 'invalid' && (
        <p role="alert" className="mx-4 mt-2 rounded border border-danger p-3 text-danger">
          {t('app.loadInvalid', { detail: isolate(loadMessage ?? '') })}
        </p>
      )}
      {load === 'unavailable' && (
        <p role="alert" className="mx-4 mt-2 rounded border border-danger p-3 text-danger">
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
      {settingsOpen && (
        <SettingsDialog
          onClose={() => {
            setSettingsOpen(false)
            // the keyboard goes back to the button that opened Settings
            queueMicrotask(() => settingsButton.current?.focus())
          }}
        />
      )}
    </main>
  )
}
