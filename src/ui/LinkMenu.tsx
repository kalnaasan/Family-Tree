import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useTreeStore } from '../domain/store.ts'
import { msg } from '../i18n/messageRef.ts'
import { useT } from '../i18n/useT.ts'
import { EditLinkDialog, type LinkTarget } from './EditLinkDialog.tsx'
import { useUiStore } from './uiStore.ts'

interface Props {
  target: LinkTarget
  /** The relative the chip shows, for the button's accessible name. */
  name: string
  /** Called after the link is removed, so the panel can put the keyboard on the Person's heading. */
  onRemoved: () => void
}

/**
 * The menu on a parent, child or partner chip (spec section 5.1): "Edit link" opens the dialog, "Remove link" removes
 * the link at once (no confirmation: the toast offers Undo). A sibling chip has none, since that relation is derived.
 */
export function LinkMenu({ target, name, onRemoved }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const away = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    const at = items.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'ArrowDown') items[(at + 1) % items.length]?.focus()
    else if (event.key === 'ArrowUp') items[(at - 1 + items.length) % items.length]?.focus()
    else if (event.key === 'Home') items[0]?.focus()
    else if (event.key === 'End') items.at(-1)?.focus()
    else if (event.key === 'Escape') {
      // closes the menu only, not the Person panel around it
      event.stopPropagation()
      close()
    } else if (event.key === 'Tab') {
      // the focused item goes away with the menu: keep the keyboard on the button, Tab moves on from there
      buttonRef.current?.focus()
      setOpen(false)
      return
    } else return
    event.preventDefault()
  }

  const remove = () => {
    const store = useTreeStore.getState()
    const nameOf = (id: string) => store.persons.find((p) => p.id === id)?.firstName ?? ''
    const [first, second] =
      target.kind === 'parent'
        ? [nameOf(target.childId), nameOf(target.parentId)]
        : (store.partnerships.find((p) => p.id === target.id)?.personIds.map(nameOf) ?? ['', ''])
    try {
      if (target.kind === 'parent') store.removeParentLink(target.childId, target.parentId)
      else store.removePartnership(target.id)
    } catch {
      // the link is already gone (another tab changed it): there is nothing left to remove
      setOpen(false)
      return
    }
    useUiStore
      .getState()
      .showToast(
        msg('toast.removedLink', { first: first ?? '', second: second ?? '' }),
        useTreeStore.getState().past.at(-1)?.id,
      )
    setOpen(false)
    onRemoved()
  }

  const item = 'flex min-h-11 w-full items-center px-4 text-start hover:bg-surface-soft focus:bg-surface-soft'

  return (
    <span ref={rootRef} className="contents">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('panel.linkMenuAria', { name })}
        onClick={() => setOpen(!open)}
        className="flex size-11 items-center justify-center rounded-full border border-line-strong hover:bg-surface-soft"
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div
          role="menu"
          onKeyDown={onMenuKeyDown}
          className="w-full overflow-hidden rounded border border-line-strong bg-white"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setEditing(true)
            }}
            className={item}
          >
            {t('panel.editLink')}
          </button>
          <button type="button" role="menuitem" onClick={remove} className={`${item} text-danger`}>
            {t('panel.removeLink')}
          </button>
        </div>
      )}
      {editing && (
        <EditLinkDialog
          target={target}
          onClose={() => {
            setEditing(false)
            // the chip stays where it was: the keyboard goes back to its menu button
            queueMicrotask(() => buttonRef.current?.focus())
          }}
        />
      )}
    </span>
  )
}
