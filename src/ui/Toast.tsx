import { useEffect } from 'react'
import { useUiStore } from './uiStore.ts'

const VISIBLE_MS = 8000

/** A short message that goes away by itself. The region stays in the page so screen readers announce changes. */
export function Toast() {
  const toast = useUiStore((s) => s.toast)
  const clear = useUiStore((s) => s.clearToast)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(clear, VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [toast, clear])

  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2 px-4">
      {toast && (
        <p className="pointer-events-auto flex items-center gap-3 rounded bg-stone-900 px-4 py-2 text-white shadow-lg">
          {toast}
          <button type="button" onClick={clear} className="min-h-11 underline">
            Dismiss
          </button>
        </p>
      )}
    </div>
  )
}
