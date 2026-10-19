import { type Ref, useRef, useState } from 'react'
import { SaveIndicator } from '../components/SaveIndicator.tsx'
import { useTreeStore } from '../domain/store.ts'
import { useT } from '../i18n/useT.ts'
import { ListIcon, SettingsIcon, TreeIcon, UserPlusIcon } from './icons.tsx'
import { RelativeDialog } from './RelativeDialog.tsx'
import { SearchBox } from './SearchBox.tsx'
import { UndoControls } from './UndoControls.tsx'
import { useUiStore } from './uiStore.ts'

/** "Tree view" and "List view" side by side: one is always pressed. */
function ViewSwitcher() {
  const t = useT()
  const listView = useUiStore((s) => s.listView)
  const setListView = useUiStore((s) => s.setListView)
  const segment =
    'inline-flex min-h-11 items-center gap-2 px-3 text-sm font-medium aria-pressed:bg-leaf-deep aria-pressed:text-white hover:bg-surface-soft aria-pressed:hover:bg-leaf-deep'
  return (
    <div role="group" aria-label={t('app.view')} className="flex shrink-0 overflow-hidden rounded-lg border border-line-strong bg-surface">
      <button type="button" aria-pressed={!listView} onClick={() => setListView(false)} className={segment}>
        <TreeIcon />
        <span className="max-sm:sr-only">{t('app.treeView')}</span>
      </button>
      <button type="button" aria-pressed={listView} onClick={() => setListView(true)} className={`${segment} border-s border-line-strong`}>
        <ListIcon />
        <span className="max-sm:sr-only">{t('app.listView')}</span>
      </button>
    </div>
  )
}

/**
 * The header: the title, search and the Tree / List switch, then what you do to the Tree (add a person, undo, redo),
 * the save state and Settings. "Add person" adds a relative of the open Person, or of the Focus person.
 */
export function AppHeader({ onOpenSettings, settingsButtonRef }: { onOpenSettings: () => void; settingsButtonRef: Ref<HTMLButtonElement> }) {
  const t = useT()
  const persons = useTreeStore((s) => s.persons)
  const focusPersonId = useTreeStore((s) => s.focusPersonId)
  const readOnly = useTreeStore((s) => s.readOnly)
  const selectedId = useUiStore((s) => s.selectedId)
  const [adding, setAdding] = useState(false)
  const addRef = useRef<HTMLButtonElement>(null)
  const anchor = persons.find((p) => p.id === selectedId) ?? persons.find((p) => p.id === focusPersonId) ?? persons[0]

  return (
    <header className="border-b border-line bg-paper-deep/70 px-4 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:grid md:grid-cols-[auto_minmax(0,1fr)_auto]">
        <h1 className="me-auto text-xl font-semibold tracking-tight text-bark sm:text-2xl md:me-0">{t('app.title')}</h1>

        {anchor && (
          <div className="order-last flex w-full items-center gap-2 md:order-none md:w-auto md:justify-center">
            <SearchBox />
            <ViewSwitcher />
          </div>
        )}

        <div className="flex items-center gap-1 md:justify-end">
          <SaveIndicator />
          {anchor && !readOnly && (
            <button
              ref={addRef}
              type="button"
              onClick={() => setAdding(true)}
              aria-label={t('app.addPerson')}
              title={t('app.addPerson')}
              className="btn-primary px-3"
            >
              <UserPlusIcon />
              <span className="max-md:sr-only">{t('app.addPerson')}</span>
            </button>
          )}
          <UndoControls />
          <button ref={settingsButtonRef} type="button" onClick={onOpenSettings} aria-label={t('app.settings')} title={t('app.settings')} className="btn btn-icon">
            <SettingsIcon />
          </button>
        </div>
      </div>

      {adding && anchor && (
        <RelativeDialog
          anchor={anchor}
          onClose={() => {
            setAdding(false)
            queueMicrotask(() => addRef.current?.focus())
          }}
          onDone={(newId) => {
            setAdding(false)
            useUiStore.getState().reveal(newId ?? anchor.id)
          }}
        />
      )}
    </header>
  )
}
