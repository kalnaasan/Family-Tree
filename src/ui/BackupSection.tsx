import { useEffect, useId, useRef, useState } from 'react'
import { backupService, useBackupLog } from '../backup/backup.ts'
import type { PreparedImport } from '../backup/backupService.ts'
import { useTreeStore } from '../domain/store.ts'
import { isolate } from '../i18n/format.ts'
import { type MessageRef, msg, renderMessage } from '../i18n/messageRef.ts'
import { useT } from '../i18n/useT.ts'
import { useWhen } from './dates.ts'
import { describeExport } from './exportBackup.ts'

/**
 * Settings: export the tree to a file, and replace it from one (spec sections 6 and 10). A file is checked in full
 * before anything is asked; replacing needs a confirmation that says how many people are replaced and offers to
 * export the current tree first.
 */
export function BackupSection({ onReplaced }: { onReplaced: (message: MessageRef) => void }) {
  const t = useT()
  const when = useWhen()
  const titleId = useId()
  const lastBackupAt = useBackupLog((s) => s.lastBackupAt)
  const currentCount = useTreeStore((s) => s.persons.length)
  const readOnly = useTreeStore((s) => s.readOnly)
  const input = useRef<HTMLInputElement>(null)
  const confirmHeading = useRef<HTMLHeadingElement>(null)
  const [includePhotos, setIncludePhotos] = useState(true)
  const [busy, setBusy] = useState<MessageRef | null>(null)
  const [note, setNote] = useState<MessageRef | null>(null)
  const [problem, setProblem] = useState<MessageRef | null>(null)
  const [prepared, setPrepared] = useState<PreparedImport | null>(null)

  // a question appeared: the keyboard (and a screen reader) goes to it
  useEffect(() => {
    if (prepared) confirmHeading.current?.focus()
  }, [prepared])

  const exportNow = async () => {
    setBusy(msg('backup.exporting'))
    setNote(null)
    setProblem(null)
    const outcome = await backupService.exportBackup({ includePhotos })
    if (outcome.ok) setNote(describeExport(outcome))
    else setProblem(describeExport(outcome))
    setBusy(null)
  }

  const chooseFile = async (file: File) => {
    setBusy(msg('backup.checkingFile'))
    setNote(null)
    setProblem(null)
    const result = await backupService.prepareImport(file)
    if (result.ok) setPrepared(result.prepared)
    else {
      // the reason is technical detail for whoever made the file, and stays in English
      setProblem(
        result.rule === 'unreadable'
          ? msg('backup.rejectedUnreadable')
          : msg('backup.rejected', { detail: isolate(result.message), rule: isolate(result.rule) }),
      )
    }
    setBusy(null)
  }

  const replace = async () => {
    if (!prepared) return
    setBusy(msg('backup.replacing'))
    setProblem(null)
    const result = await backupService.applyImport(prepared)
    setBusy(null)
    if (result.ok) {
      onReplaced(msg('backup.imported', { count: prepared.tree.persons.length }))
    } else {
      setProblem(result.message)
    }
  }

  const status = busy ?? note
  return (
    <section aria-labelledby={titleId} className="mt-5">
      <h3 id={titleId} className="font-semibold">
        {t('backup.title')}
      </h3>
      <p className="mt-1">
        {t('backup.lastBackup', { when: lastBackupAt ? when(lastBackupAt) : t('backup.never') })}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={includePhotos}
            onChange={(event) => setIncludePhotos(event.target.checked)}
            className="size-5"
          />
          {t('backup.includePhotos')}
        </label>
        <button
          type="button"
          onClick={() => void exportNow()}
          disabled={busy !== null}
          className="btn-primary  px-4 font-medium text-white disabled:opacity-60"
        >
          {t('backup.export')}
        </button>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy !== null || prepared !== null || readOnly}
          className="btn px-4 disabled:opacity-60"
        >
          {t('backup.import')}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        aria-label={t('backup.fileLabel')}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = '' // choosing the same file again must still fire
          if (file) void chooseFile(file)
        }}
      />

      <p aria-live="polite" className="mt-2 text-stone-700">
        {status && renderMessage(t, status)}
      </p>
      {problem && (
        <p role="alert" className="mt-2 text-red-800">
          {renderMessage(t, problem)}
        </p>
      )}

      {prepared && (
        <div
          role="group"
          aria-labelledby={`${titleId}-confirm`}
          className="mt-3 rounded border border-amber-800 bg-amber-50 p-3"
        >
          <h4 id={`${titleId}-confirm`} ref={confirmHeading} tabIndex={-1} className="font-semibold outline-offset-4">
            {t('backup.confirmTitle')}
          </h4>
          <p className="mt-1">
            {renderMessage(
              t,
              msg('backup.confirm', {
                file:
                  prepared.photos.size > 0
                    ? msg('backup.confirmFilePhotos', {
                        people: msg('common.people', { count: prepared.tree.persons.length }),
                        photos: msg('common.photos', { count: prepared.photos.size }),
                      })
                    : msg('backup.confirmFile', { people: msg('common.people', { count: prepared.tree.persons.length }) }),
                tree: msg('backup.confirmTree', { people: msg('common.people', { count: currentCount }) }),
              }),
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void exportNow()}
              disabled={busy !== null}
              className="btn px-3 disabled:opacity-60"
            >
              {t('backup.exportFirst')}
            </button>
            <button
              type="button"
              onClick={() => void replace()}
              disabled={busy !== null}
              className="min-h-11 rounded bg-red-800 px-3 font-medium text-white disabled:opacity-60"
            >
              {t('backup.replace')}
            </button>
            <button
              type="button"
              onClick={() => {
                setPrepared(null)
                setProblem(null)
              }}
              disabled={busy !== null}
              className="btn px-3 disabled:opacity-60"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
