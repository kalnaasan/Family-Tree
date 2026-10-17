import { useEffect, useId, useRef, useState } from 'react'
import type { MessageRef } from '../i18n/messageRef.ts'
import { type Translate, useT } from '../i18n/useT.ts'
import { usePersistenceStatus } from '../persistence/saveStatus.ts'
import { photoStore } from '../photos/photos.ts'
import { BackupSection } from './BackupSection.tsx'
import { LanguageSetting } from './LanguageSetting.tsx'
import { RestoreSection } from './RestoreSection.tsx'
import { useUiStore } from './uiStore.ts'

/** "1.4 MB", "820 KB". */
function formatBytes(bytes: number, t: Translate): string {
  if (bytes < 1024) return t('size.bytes', { n: bytes })
  if (bytes < 1024 * 1024) return t('size.kb', { n: Math.round(bytes / 1024) })
  if (bytes < 1024 * 1024 * 1024) return t('size.mb', { n: (bytes / (1024 * 1024)).toFixed(1) })
  return t('size.gb', { n: (bytes / (1024 * 1024 * 1024)).toFixed(1) })
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

/** Settings: storage use (spec section 6), backup and import, and restoring a previous version (section 10). */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const persistent = usePersistenceStatus((s) => s.persistent)
  const [usage, setUsage] = useState<Usage | null>(null)

  /** The whole tree was replaced (import or restore): close, drop the open Person, and say so. */
  const replaced = (message: MessageRef) => {
    onClose()
    useUiStore.getState().select(null)
    useUiStore.getState().showToast(message)
  }

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
      className="m-auto max-h-[90dvh] w-[min(92vw,32rem)] overflow-y-auto rounded-xl border border-stone-400 bg-white p-5 shadow-xl backdrop:bg-black/50"
    >
      <h2 id={titleId} className="text-xl font-semibold">
        {t('app.settings')}
      </h2>

      <LanguageSetting />

      <section aria-labelledby={`${titleId}-storage`} className="mt-4">
        <h3 id={`${titleId}-storage`} className="font-semibold">
          {t('settings.storage')}
        </h3>
        {usage === null ? (
          <p className="mt-1 text-stone-700">{t('common.checking')}</p>
        ) : (
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-stone-700">{t('settings.photos')}</dt>
            <dd>
              {usage.photos === 'unavailable'
                ? t('settings.photosUnavailable')
                : usage.photos.count === 0
                  ? t('settings.photosNone')
                  : t('settings.photosCount', { count: usage.photos.count, size: formatBytes(usage.photos.bytes, t) })}
            </dd>
            <dt className="text-stone-700">{t('settings.browser')}</dt>
            <dd>
              {usage.browser
                ? t('settings.browserUsage', {
                    used: formatBytes(usage.browser.used, t),
                    quota: formatBytes(usage.browser.quota, t),
                  })
                : t('settings.browserUnreported')}
            </dd>
            <dt className="text-stone-700">{t('settings.safe')}</dt>
            <dd>
              {persistent === null
                ? t('settings.safeUnknown')
                : persistent
                  ? t('settings.safeYes')
                  : t('settings.safeNo')}
            </dd>
          </dl>
        )}
      </section>

      <BackupSection onReplaced={replaced} />
      <RestoreSection onRestored={replaced} />

      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onClose} className="btn px-4">
          {t('common.close')}
        </button>
      </div>
    </dialog>
  )
}
