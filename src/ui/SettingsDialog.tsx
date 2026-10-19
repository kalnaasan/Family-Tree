import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import type { MessageKey } from '../i18n/messages.ts'
import { useLanguageStore } from '../i18n/language.ts'
import type { MessageRef, Translate } from '../i18n/messageRef.ts'
import { useT } from '../i18n/useT.ts'
import { usePersistenceStatus } from '../persistence/saveStatus.ts'
import { photoStore } from '../photos/photos.ts'
import { BackupSection } from './BackupSection.tsx'
import { LanguageSetting } from './LanguageSetting.tsx'
import { Modal } from './kit/Modal.tsx'
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

type TabKey = 'language' | 'storage' | 'backup' | 'versions'

const TAB_LABEL: Record<TabKey, MessageKey> = {
  language: 'settings.tab.language',
  storage: 'settings.tab.storage',
  backup: 'settings.tab.backup',
  versions: 'settings.tab.versions',
}

/** The Storage tab: where the tree lives and how much of the browser's space it uses (spec section 6). */
function StorageTab() {
  const t = useT()
  const persistent = usePersistenceStatus((s) => s.persistent)
  const [usage, setUsage] = useState<Usage | null>(null)
  useEffect(() => {
    let current = true
    void readUsage().then((result) => current && setUsage(result))
    return () => {
      current = false
    }
  }, [])

  const percent = usage?.browser ? Math.min(100, Math.max(usage.browser.used > 0 ? 1 : 0, Math.round((usage.browser.used / usage.browser.quota) * 100))) : 0

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-lg border border-line bg-accent-soft p-3">{t('settings.storageNote')}</p>
      {usage === null ? (
        <p className="text-ink-soft">{t('common.checking')}</p>
      ) : (
        <>
          {usage.browser && (
            <div>
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{t('settings.browser')}</span>
                <span className="text-ink-soft">
                  {t('settings.browserUsage', {
                    used: formatBytes(usage.browser.used, t),
                    quota: formatBytes(usage.browser.quota, t),
                  })}
                </span>
              </div>
              <div
                role="meter"
                aria-label={t('settings.usageLabel')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="mt-1 h-2 overflow-hidden rounded-full bg-line"
              >
                <div className="h-full rounded-full bg-leaf-deep" style={{ width: `${percent}%` }} />
              </div>
            </div>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-ink-soft">{t('settings.photos')}</dt>
            <dd>
              {usage.photos === 'unavailable'
                ? t('settings.photosUnavailable')
                : usage.photos.count === 0
                  ? t('settings.photosNone')
                  : t('settings.photosCount', { count: usage.photos.count, size: formatBytes(usage.photos.bytes, t) })}
            </dd>
            {!usage.browser && (
              <>
                <dt className="text-ink-soft">{t('settings.browser')}</dt>
                <dd>{t('settings.browserUnreported')}</dd>
              </>
            )}
            <dt className="text-ink-soft">{t('settings.safe')}</dt>
            <dd>
              {persistent === null
                ? t('settings.safeUnknown')
                : persistent
                  ? t('settings.safeYes')
                  : t('settings.safeNo')}
            </dd>
          </dl>
        </>
      )}
    </div>
  )
}

/**
 * Settings: a few tabs, one for each thing that can be set or done (Language when more than one is offered, storage,
 * backup and import, previous versions). Only the open tab is drawn. A tab list on the start side of a wide dialog and
 * across the top of a phone, where the dialog fills the screen.
 */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const baseId = useId()
  const available = useLanguageStore((s) => s.available)
  const tabs: TabKey[] = [...(available.length > 1 ? (['language'] as const) : []), 'storage', 'backup', 'versions']
  const [tab, setTab] = useState<TabKey>(tabs[0]!)
  const tabRefs = useRef(new Map<TabKey, HTMLButtonElement>())

  /** The whole tree was replaced (import or restore): close, drop the open Person, and say so. */
  const replaced = (message: MessageRef) => {
    onClose()
    useUiStore.getState().select(null)
    useUiStore.getState().showToast(message)
  }

  const move = (to: TabKey) => {
    setTab(to)
    tabRefs.current.get(to)?.focus()
  }
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = tabs.indexOf(tab)
    const rtl = document.documentElement.dir === 'rtl'
    const next = event.key === 'ArrowDown' || event.key === (rtl ? 'ArrowLeft' : 'ArrowRight')
    const previous = event.key === 'ArrowUp' || event.key === (rtl ? 'ArrowRight' : 'ArrowLeft')
    if (next) move(tabs[(at + 1) % tabs.length]!)
    else if (previous) move(tabs[(at - 1 + tabs.length) % tabs.length]!)
    else if (event.key === 'Home') move(tabs[0]!)
    else if (event.key === 'End') move(tabs.at(-1)!)
    else return
    event.preventDefault()
  }

  return (
    <Modal title={t('app.settings')} onClose={onClose} wide fullOnPhone>
      <div className="flex flex-col gap-4 sm:min-h-72 sm:flex-row sm:gap-6">
        <div
          role="tablist"
          aria-label={t('settings.tabs')}
          aria-orientation="vertical"
          onKeyDown={onTabKeyDown}
          className="-mx-1 flex shrink-0 gap-1 overflow-x-auto px-1 sm:mx-0 sm:w-48 sm:flex-col sm:overflow-visible sm:px-0"
        >
          {tabs.map((key) => (
            <button
              key={key}
              ref={(el) => {
                if (el) tabRefs.current.set(key, el)
                else tabRefs.current.delete(key)
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`${baseId}-panel-${key}`}
              tabIndex={tab === key ? 0 : -1}
              onClick={() => setTab(key)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-start font-medium hover:bg-surface-soft aria-selected:bg-accent-soft aria-selected:text-leaf-deep aria-selected:shadow-[inset_0_-3px_0_var(--color-leaf-deep)] sm:aria-selected:shadow-none"
            >
              {t(TAB_LABEL[key])}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`${baseId}-panel-${tab}`}
          aria-labelledby={`${baseId}-tab-${tab}`}
          tabIndex={0}
          className="min-w-0 flex-1 outline-offset-4"
        >
          {tab === 'language' && <LanguageSetting />}
          {tab === 'storage' && <StorageTab />}
          {tab === 'backup' && <BackupSection onReplaced={replaced} />}
          {tab === 'versions' && <RestoreSection onRestored={replaced} />}
        </div>
      </div>
    </Modal>
  )
}
