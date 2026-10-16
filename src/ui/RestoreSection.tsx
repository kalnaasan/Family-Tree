import { useEffect, useId, useState } from 'react'
import { backupService } from '../backup/backup.ts'
import { type SnapshotInfo, type SnapshotReason, snapshotKeeper } from '../backup/snapshots.ts'
import { useTreeStore } from '../domain/store.ts'
import { formatWhen } from './dates.ts'

const REASON: Record<SnapshotReason, string> = {
  load: 'when the app opened',
  hourly: 'while editing',
  import: 'before an import',
  restore: 'before a restore',
}

const people = (count: number) => `${count} ${count === 1 ? 'person' : 'people'}`

/** Settings: "Restore a previous version" (spec section 10), from the up to five copies kept automatically. */
export function RestoreSection({ onRestored }: { onRestored: (message: string) => void }) {
  const titleId = useId()
  const currentCount = useTreeStore((s) => s.persons.length)
  const [versions, setVersions] = useState<SnapshotInfo[] | 'unavailable' | null>(null)
  const [choosing, setChoosing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

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
      onRestored(`Restored the version from ${formatWhen(version.takenAt)}. Your previous tree is kept as a version too.`)
    } else {
      setProblem(result.message)
    }
  }

  return (
    <section aria-labelledby={titleId} className="mt-5">
      <h3 id={titleId} className="font-semibold">
        Restore a previous version
      </h3>
      {versions === null ? (
        <p className="mt-1 text-stone-700">Checking…</p>
      ) : versions === 'unavailable' ? (
        <p className="mt-1 text-stone-700">Earlier versions could not be read.</p>
      ) : versions.length === 0 ? (
        <p className="mt-1 text-stone-700">No earlier versions yet. They are kept automatically as you work.</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-2">
          {versions.map((version) => {
            const when = formatWhen(version.takenAt)
            return (
              <li key={version.id} className="rounded border border-stone-300 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {when} · {people(version.personCount)}
                    <span className="text-stone-700"> ({REASON[version.reason]})</span>
                  </span>
                  {choosing !== version.id && (
                    <button
                      type="button"
                      aria-label={`Restore the version from ${when}`}
                      onClick={() => {
                        setProblem(null)
                        setChoosing(version.id)
                      }}
                      disabled={busy}
                      className="min-h-11 rounded border border-stone-500 px-3 disabled:opacity-60"
                    >
                      Restore
                    </button>
                  )}
                </div>
                {choosing === version.id && (
                  <div role="group" aria-label={`Restore the version from ${when}?`} className="mt-2">
                    <p>
                      Your tree has {people(currentCount)}; this version has {people(version.personCount)}. Your tree is
                      replaced, and kept as a version too.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void restore(version)}
                        disabled={busy}
                        className="min-h-11 rounded bg-red-800 px-3 font-medium text-white disabled:opacity-60"
                      >
                        Restore this version
                      </button>
                      <button
                        type="button"
                        onClick={() => setChoosing(null)}
                        disabled={busy}
                        className="min-h-11 rounded border border-stone-500 px-3 disabled:opacity-60"
                      >
                        Cancel
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
          {problem}
        </p>
      )}
    </section>
  )
}
