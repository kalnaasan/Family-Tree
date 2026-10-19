import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { MoreIcon } from '../icons.tsx'

export interface MenuItem {
  key: string
  label: string
  onSelect: () => void
  /** A destructive action: drawn apart from the others, in the danger colour. */
  danger?: boolean
}

interface Props {
  /** The accessible name of the button that opens the menu. */
  label: string
  items: readonly MenuItem[]
  /** What the button shows; the three-dots icon by default. */
  icon?: ReactNode
}

/**
 * A button that opens a menu (the WAI-ARIA menu button pattern): arrows, Home and End move, Enter chooses, Escape
 * closes it and nothing around it, Tab leaves it with the keyboard back on the button, a press outside closes it.
 */
export function ActionMenu({ label, items, icon }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

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
    const entries = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    const at = entries.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'ArrowDown') entries[(at + 1) % entries.length]?.focus()
    else if (event.key === 'ArrowUp') entries[(at - 1 + entries.length) % entries.length]?.focus()
    else if (event.key === 'Home') entries[0]?.focus()
    else if (event.key === 'End') entries.at(-1)?.focus()
    else if (event.key === 'Escape') {
      event.stopPropagation()
      close()
    } else if (event.key === 'Tab') {
      buttonRef.current?.focus()
      setOpen(false)
      return
    } else return
    event.preventDefault()
  }

  const firstDanger = items.findIndex((item) => item.danger)

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
        onClick={() => setOpen(!open)}
        className="btn btn-icon"
      >
        {icon ?? <MoreIcon />}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute end-0 top-full z-40 mt-1 min-w-56 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-raised"
        >
          {items.map((item, index) => (
            <div key={item.key} role="none" className={index === firstDanger && index > 0 ? 'mt-1 border-t border-line pt-1' : ''}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
                className={`menu-item ${item.danger ? 'text-danger' : ''}`}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
