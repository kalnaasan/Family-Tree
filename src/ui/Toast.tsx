import { useEffect } from 'react'
import { useTreeStore } from '../domain/store.ts'
import { renderMessage } from '../i18n/messageRef.ts'
import { useT } from '../i18n/useT.ts'
import { undoLatest } from './undo.ts'
import { useUiStore } from './uiStore.ts'

export const TOAST_VISIBLE_MS = 8000

/** A short message that goes away by itself. The region stays in the page so screen readers announce changes. */
export function Toast() {
  const t = useT()
  const toast = useUiStore((s) => s.toast)
  const clear = useUiStore((s) => s.clearToast)
  // Undo only makes sense while the step the toast is about is still the latest; after anything else it is hidden.
  const canUndoThis = useTreeStore((s) => toast?.undoStepId !== undefined && s.past.at(-1)?.id === toast.undoStepId)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(clear, TOAST_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [toast, clear])

  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2 px-4">
      {toast && (
        <p className="pointer-events-auto flex items-center gap-3 rounded bg-stone-900 px-4 py-2 text-white shadow-lg">
          <span>
            {renderMessage(t, toast.message)}
            {canUndoThis && ' · '}
          </span>
          {canUndoThis && (
            <button type="button" onClick={undoLatest} className="-ml-2 min-h-11 px-2 font-medium underline">
              {t('history.undo')}
            </button>
          )}
          <button type="button" onClick={clear} className="min-h-11 underline">
            {t('common.dismiss')}
          </button>
        </p>
      )}
    </div>
  )
}
