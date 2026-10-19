import { type ReactNode, useEffect, useId, useRef } from 'react'
import { useT } from '../../i18n/useT.ts'
import { CloseIcon } from '../icons.tsx'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  /** A phone shows it as a sheet from the bottom, a wide screen as a centred dialog; `wide` makes that one larger. */
  wide?: boolean
  /** On a phone it fills the screen instead of rising from the bottom (Settings). */
  fullOnPhone?: boolean
}

/**
 * A modal dialog on the platform's `<dialog>`: the keyboard stays inside, Escape closes it, and the caller returns
 * focus to whatever opened it. The title is the dialog's accessible name.
 */
export function Modal({ title, onClose, children, wide = false, fullOnPhone = false }: Props) {
  const t = useT()
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    // the dialog puts the keyboard on its first control (the close button); a form may name a better one
    dialog?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onKeyDown={(event) => {
        // handled here too, not only through the dialog's `cancel` event: that comes after this key reaches the panel behind
        event.stopPropagation()
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
        }
      }}
      className={`m-auto max-h-[92dvh] ${wide ? 'w-[min(94vw,44rem)]' : 'w-[min(94vw,32rem)]'} overflow-y-auto rounded-xl border border-line bg-surface p-0 shadow-raised backdrop:bg-black/50 max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none ${fullOnPhone ? 'max-sm:h-dvh max-sm:max-h-none max-sm:rounded-none' : 'max-sm:max-h-[88dvh]'}`}
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-4 py-2">
        <h2 id={titleId} className="me-auto text-lg font-semibold">
          {title}
        </h2>
        <button type="button" onClick={onClose} aria-label={t('common.close')} title={t('common.close')} className="btn btn-icon">
          <CloseIcon />
        </button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  )
}
