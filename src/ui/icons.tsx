import type { ReactNode } from 'react'

/**
 * Small line icons for the toolbar. They are decoration: the button that holds one carries the accessible name.
 * `mirror`: a curved arrow that points the way of reading (undo back, redo forward) is flipped when the page reads
 * right to left; the other icons mean the same either way (spec section 13.2).
 */
const Icon = ({ children, mirror = false }: { children: ReactNode; mirror?: boolean }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className={mirror ? 'size-5 rtl:-scale-x-100' : 'size-5'}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
)

export const UndoIcon = () => (
  <Icon mirror>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Icon>
)

export const RedoIcon = () => (
  <Icon mirror>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Icon>
)

export const SettingsIcon = () => (
  <Icon>
    <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="8" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </Icon>
)

export const ListIcon = () => (
  <Icon>
    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </Icon>
)

export const MoreIcon = () => (
  <Icon>
    <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" />
  </Icon>
)

export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
)

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

/** A chevron that points the way the page reads (closed) or down (open); flipped under right to left. */
export const ChevronIcon = ({ open }: { open: boolean }) => (
  <Icon mirror={!open}>
    <path d={open ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6'} />
  </Icon>
)

export const TreeIcon = () => (
  <Icon>
    <circle cx="12" cy="5" r="2" />
    <circle cx="6" cy="19" r="2" />
    <circle cx="18" cy="19" r="2" />
    <path d="M12 7v4M12 11H6v6M12 11h6v6" />
  </Icon>
)

export const UserPlusIcon = () => (
  <Icon>
    <circle cx="10" cy="8" r="4" />
    <path d="M3 21c0-3.9 3.1-7 7-7M18 8v6M15 11h6" />
  </Icon>
)

export const LinkIcon = () => (
  <Icon>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Icon>
)
