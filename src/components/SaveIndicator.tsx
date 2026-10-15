import { useTreeStore } from '../domain/store.ts'
import { downloadBackup } from '../persistence/backup.ts'
import { usePersistenceStatus } from '../persistence/saveStatus.ts'

const LABELS = { saved: 'Saved', saving: 'Saving…', error: 'Could not save' } as const

export function SaveIndicator() {
  const save = usePersistenceStatus((s) => s.save)
  return (
    <div className="flex items-center gap-3">
      <span role="status" data-status={save} className={save === 'error' ? 'font-medium text-red-800' : 'text-stone-700'}>
        {LABELS[save]}
      </span>
      {save === 'error' && (
        <button
          type="button"
          className="min-h-11 rounded border border-red-800 px-3 text-red-800"
          onClick={() => {
            const { focusPersonId, persons, parentLinks, partnerships } = useTreeStore.getState()
            downloadBackup({ focusPersonId, persons, parentLinks, partnerships })
          }}
        >
          Export a backup now
        </button>
      )}
    </div>
  )
}
