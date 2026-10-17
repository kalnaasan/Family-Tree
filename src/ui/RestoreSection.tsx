import { useEffect, useId, useState } from 'react'
import { backupService } from '../backup/backup.ts'
import { type SnapshotInfo, snapshotKeeper } from '../backup/snapshots.ts'
import { useTreeStore } from '../domain/store.ts'
import { type MessageRef, msg, renderMessage } from '../i18n/messageRef.ts'
import { useT } from '../i18n/useT.ts'
import { useWhen } from './dates.ts'

/** Settings: "Restore a previous version" (spec section 10), from the up to five copies kept automatically. */
export function RestoreSection({ onRestored }: { onRestored: (message: MessageRef) => void }) {
  const t = useT()
  const when = useWhen()
  const titleId = useId()
  const currentCount = useTreeStore((s) => s.persons.length)
  const readOnly = useTreeStore((s) => s.readOnly)
  const [versions, setVersions] = useState<SnapshotInfo[] | 'unavailable' | null>(null)
  const [choosing, setChoosing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<MessageRef | null>(null)

  useEffect(() => {
    let current = true
    snapshotKeeper.list().then(
      (list) => current && setVersions(list),
      () => current && setVersions('unavailable'),
    )
    return () => {
      current = false
    }
  }, [])

  const restore = async (version: SnapshotInfo) => {
    setBusy(true)
    setProblem(null)
    const result = await backupService.restoreSnapshot(version.id)
    setBusy(false)
    if (result.ok) {
      onRestored(msg('restore.done', { when: when(version.takenAt) }))
    } else {
      setProblem(result.message)
    }
  }

  return (
    <section aria-labelledby={titleId} className="mt-5">
      <h3 id={titleId} className="font-semibold">
        {t('restore.title')}
      </h3>
      {readOnly && <p className="mt-1 text-stone-700">{t('restore.readOnlyNote')}</p>}
      {versions === null ? (
        <p className="mt-1 text-stone-700">{t('common.checking')}</p>
      ) : versions === 'unavailable' ? (
        <p className="mt-1 text-stone-700">{t('restore.unavailable')}</p>
      ) : versions.length === 0 ? (
        <p className="mt-1 text-stone-700">{t('restore.none')}</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-2">
          {versions.map((version) => {
            const at = when(version.takenAt)
            const people = (count: number) => renderMessage(t, msg('common.people', { count }))
            return (
              <li key={version.id} className="rounded border border-stone-300 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {t('restore.line', { when: at, people: people(version.personCount) })}{' '}
                    <span className="text-stone-700">
                      {t('restore.reasonNote', { reason: t(`restore.reason.${version.reason}`) })}
                    </span>
                  </span>
                  {choosing !== version.id && (
                    <button
                      type="button"
                      aria-label={t('restore.buttonAria', { when: at })}
                      onClick={() => {
                        setProblem(null)
                        setChoosing(version.id)
                      }}
                      disabled={busy || readOnly}
                      className="btn px-3 disabled:opacity-60"
                    >
                      {t('restore.button')}
                    </button>
                  )}
                </div>
                {choosing === version.id && (
                  <div role="group" aria-label={t('restore.groupAria', { when: at })} className="mt-2">
                    <p>
                      {t('restore.question', { current: people(currentCount), version: people(version.personCount) })}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void restore(version)}
                        disabled={busy}
                        className="min-h-11 rounded bg-red-800 px-3 font-medium text-white disabled:opacity-60"
                      >
                        {t('restore.confirm')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setChoosing(null)}
                        disabled={busy}
                        className="btn px-3 disabled:opacity-60"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {problem && (
        <p role="alert" className="mt-2 text-red-800">
          {renderMessage(t, problem)}
        </p>
      )}
    </section>
  )
}
