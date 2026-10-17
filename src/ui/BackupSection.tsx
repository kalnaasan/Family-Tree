import { useEffect, useId, useRef, useState } from 'react'
import { backupService, useBackupLog } from '../backup/backup.ts'
import type { PreparedImport } from '../backup/backupService.ts'
import { useTreeStore } from '../domain/store.ts'
import { useLanguageStore } from '../i18n/language.ts'
import { formatWhen } from './dates.ts'
import { describeExport } from './exportBackup.ts'

const people = (count: number) => `${count} ${count === 1 ? 'person' : 'people'}`

/**
 * Settings: export the tree to a file, and replace it from one (spec sections 6 and 10). A file is checked in full
 * before anything is asked; replacing needs a confirmation that says how many people are replaced and offers to
 * export the current tree first.
 */
export function BackupSection({ onReplaced }: { onReplaced: (message: string) => void }) {
  const titleId = useId()
  const lastBackupAt = useBackupLog((s) => s.lastBackupAt)
  const currentCount = useTreeStore((s) => s.persons.length)
  const readOnly = useTreeStore((s) => s.readOnly)
  const language = useLanguageStore((s) => s.language)
  const input = useRef<HTMLInputElement>(null)
  const confirmHeading = useRef<HTMLHeadingElement>(null)
  const [includePhotos, setIncludePhotos] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [prepared, setPrepared] = useState<PreparedImport | null>(null)

  // a question appeared: the keyboard (and a screen reader) goes to it
  useEffect(() => {
    if (prepared) confirmHeading.current?.focus()
  }, [prepared])

  const exportNow = async () => {
    setBusy('Exporting…')
    setNote(null)
    setProblem(null)
    const outcome = await backupService.exportBackup({ includePhotos })
    if (outcome.ok) setNote(describeExport(outcome))
    else setProblem(describeExport(outcome))
    setBusy(null)
  }

  const chooseFile = async (file: File) => {
    setBusy('Checking the file…')
    setNote(null)
    setProblem(null)
    const result = await backupService.prepareImport(file)
    if (result.ok) setPrepared(result.prepared)
    else setProblem(`Nothing was imported. ${result.message}. (Rule: ${result.rule}.)`)
    setBusy(null)
  }

  const replace = async () => {
    if (!prepared) return
    setBusy('Replacing your tree…')
    setProblem(null)
    const result = await backupService.applyImport(prepared)
    setBusy(null)
    if (result.ok) {
      onReplaced(`Imported ${people(prepared.tree.persons.length)}. Your previous tree is kept under Restore a previous version.`)
    } else {
      setProblem(result.message)
    }
  }

  return (
    <section aria-labelledby={titleId} className="mt-5">
      <h3 id={titleId} className="font-semibold">
        Backup
      </h3>
      <p className="mt-1">Last backup: {lastBackupAt ? formatWhen(lastBackupAt, language) : 'never'}</p>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={includePhotos}
            onChange={(event) => setIncludePhotos(event.target.checked)}
            className="size-5"
          />
          Include photos
        </label>
        <button
          type="button"
          onClick={() => void exportNow()}
          disabled={busy !== null}
          className="btn-primary  px-4 font-medium text-white disabled:opacity-60"
        >
          Export
        </button>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy !== null || prepared !== null || readOnly}
          className="btn px-4 disabled:opacity-60"
        >
          Import a file
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        aria-label="Backup file to import"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = '' // choosing the same file again must still fire
          if (file) void chooseFile(file)
        }}
      />

      <p aria-live="polite" className="mt-2 text-stone-700">
        {busy ?? note}
      </p>
      {problem && (
        <p role="alert" className="mt-2 text-red-800">
          {problem}
        </p>
      )}

      {prepared && (
        <div
          role="group"
          aria-labelledby={`${titleId}-confirm`}
          className="mt-3 rounded border border-amber-800 bg-amber-50 p-3"
        >
          <h4 id={`${titleId}-confirm`} ref={confirmHeading} tabIndex={-1} className="font-semibold outline-offset-4">
            Replace your tree with this file?
          </h4>
          <p className="mt-1">
            The file has {people(prepared.tree.persons.length)}
            {prepared.photos.size > 0 && ` and ${prepared.photos.size} ${prepared.photos.size === 1 ? 'photo' : 'photos'}`}.
            Your tree has {people(currentCount)}, and all of them will be replaced.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void exportNow()}
              disabled={busy !== null}
              className="btn px-3 disabled:opacity-60"
            >
              Export current tree first
            </button>
            <button
              type="button"
              onClick={() => void replace()}
              disabled={busy !== null}
              className="min-h-11 rounded bg-red-800 px-3 font-medium text-white disabled:opacity-60"
            >
              Replace my tree
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
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
