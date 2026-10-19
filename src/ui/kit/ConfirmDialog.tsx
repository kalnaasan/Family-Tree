import { type ReactNode, useEffect, useId, useRef } from 'react'
import { useT } from '../../i18n/useT.ts'

interface Props {
  title: string
  /** What will happen, in full: the consequence is part of the question. */
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** The confirmed action destroys something: the button is drawn in the danger colour. */
  danger?: boolean
}

/** A modal yes/no question. Cancel has the keyboard first, so a stray Enter never destroys anything. */
export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel, danger = false }: Props) {
  const t = useT()
  const titleId = useId()
  const bodyId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    cancelRef.current?.focus()
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      onKeyDown={(event) => {
        // handled here too, not only through the dialog's `cancel` event: that comes after this key reaches the panel behind
        event.stopPropagation()
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
      className="m-auto w-[min(94vw,28rem)] rounded-xl border border-line bg-surface p-5 shadow-raised backdrop:bg-black/50"
    >
      <h2 id={titleId} className="text-lg font-semibold">
        {title}
      </h2>
      <div id={bodyId} className="mt-2 text-ink-soft">
        {children}
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button ref={cancelRef} type="button" onClick={onCancel} className="btn px-4">
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 font-medium text-white ${danger ? 'bg-danger hover:bg-red-950' : 'bg-leaf-deep hover:bg-[#1b4020]'}`}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
