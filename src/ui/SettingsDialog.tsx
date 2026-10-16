import { useEffect, useId, useRef, useState } from 'react'
import { usePersistenceStatus } from '../persistence/saveStatus.ts'
import { photoStore } from '../photos/photos.ts'

/** "1.4 MB", "820 KB". */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

interface Usage {
  photos: { count: number; bytes: number } | 'unavailable'
  browser: { used: number; quota: number } | null
}

async function readUsage(): Promise<Usage> {
  const photos = await photoStore.usage().catch(() => 'unavailable' as const)
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined)
  const browser = estimate?.usage !== undefined && estimate.quota ? { used: estimate.usage, quota: estimate.quota } : null
  return { photos, browser }
}

/** Settings (spec section 6: storage use). Later tickets add backup and restore here. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const persistent = usePersistenceStatus((s) => s.persistent)
  const [usage, setUsage] = useState<Usage | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.close()
  }, [])
  useEffect(() => {
    let current = true
    void readUsage().then((result) => current && setUsage(result))
    return () => {
      current = false
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      className="m-auto w-[min(92vw,26rem)] rounded-xl border border-stone-400 bg-white p-5 shadow-xl backdrop:bg-black/50"
    >
      <h2 id={titleId} className="text-xl font-semibold">
        Settings
      </h2>

      <section aria-labelledby={`${titleId}-storage`} className="mt-4">
        <h3 id={`${titleId}-storage`} className="font-semibold">
          Storage
        </h3>
        {usage === null ? (
          <p className="mt-1 text-stone-700">Checking…</p>
        ) : (
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-stone-700">Photos</dt>
            <dd>
              {usage.photos === 'unavailable'
                ? 'Could not be read'
                : usage.photos.count === 0
                  ? 'None'
                  : `${usage.photos.count} ${usage.photos.count === 1 ? 'photo' : 'photos'}, ${formatBytes(usage.photos.bytes)}`}
            </dd>
            <dt className="text-stone-700">This browser</dt>
            <dd>
              {usage.browser
                ? `${formatBytes(usage.browser.used)} of ${formatBytes(usage.browser.quota)} used`
                : 'Not reported by this browser'}
            </dd>
            <dt className="text-stone-700">Kept safe</dt>
            <dd>
              {persistent === null
                ? 'Not asked yet'
                : persistent
                  ? 'Yes, the browser will not clear it'
                  : 'No, the browser may clear it if space runs low'}
            </dd>
          </dl>
        )}
      </section>

      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onClose} className="min-h-11 rounded border border-stone-500 px-4">
          Close
        </button>
      </div>
    </dialog>
  )
}
