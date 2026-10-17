import { useState } from 'react'
import { useTreeStore } from '../domain/store.ts'
import { takeOverEditing } from '../persistence/usePersistence.ts'

/**
 * Shown in a tab that is not the one editing (spec section 10). The sentence sits in a live region, so a screen
 * reader says so when a tab becomes read-only, not only when it is first looked at. (It is a plain live region and
 * not role "status": the save indicator is the page's one status.)
 */
export function ReadOnlyBanner() {
  const readOnly = useTreeStore((s) => s.readOnly)
  const [taking, setTaking] = useState(false)

  const takeOver = async () => {
    setTaking(true)
    try {
      await takeOverEditing()
    } finally {
      setTaking(false)
    }
  }

  return (
    <div className={readOnly ? 'mx-4 mt-2 flex flex-wrap items-center gap-3 rounded border border-amber-800 bg-amber-50 p-3 text-stone-900' : undefined}>
      <p aria-live="polite" className="min-w-0 basis-full sm:flex-1 sm:basis-0">
        {readOnly &&
          'Read-only: this tree is being edited in another tab. What you see here does not update, and changes can only be made there.'}
      </p>
      {readOnly && (
        <button
          type="button"
          onClick={() => void takeOver()}
          disabled={taking}
          className="btn-primary  px-3 font-medium text-white disabled:opacity-60"
        >
          {taking ? 'Taking over…' : 'Take over editing'}
        </button>
      )}
    </div>
  )
}
