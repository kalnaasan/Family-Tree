import { useTreeStore } from '../domain/store.ts'
import { useT } from '../i18n/useT.ts'
import { usePersistenceStatus } from '../persistence/saveStatus.ts'
import { exportAndAnnounce } from '../ui/exportBackup.ts'

const LABELS = { saved: 'save.saved', saving: 'save.saving', error: 'save.error' } as const

export function SaveIndicator() {
  const t = useT()
  const save = usePersistenceStatus((s) => s.save)
  const readOnly = useTreeStore((s) => s.readOnly)
  if (readOnly) return (
      <span role="status" className="text-ink-soft text-sm">
        {t('save.readOnly')}
      </span>
    )
  return (
    <div className="flex items-center gap-3">
      <span role="status" data-status={save} className={save === 'error' ? 'font-medium text-red-800' : 'text-ink-soft text-sm'}>
        {t(LABELS[save])}
      </span>
      {save === 'error' && (
        <button
          type="button"
          className="min-h-11 rounded border border-red-800 px-3 text-red-800"
          onClick={() => void exportAndAnnounce()}
        >
          {t('save.exportNow')}
        </button>
      )}
    </div>
  )
}
