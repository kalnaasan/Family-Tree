import { useSyncExternalStore } from 'react'

/** Spec section 8: from this width the Person's panel is a side panel; below it, a bottom sheet. */
const QUERY = '(min-width: 768px)'

const query = () => (typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null)

function subscribe(onChange: () => void) {
  const media = query()
  media?.addEventListener('change', onChange)
  return () => media?.removeEventListener('change', onChange)
}

/** Whether the screen is at least 768 px wide. Without `matchMedia` (tests) the screen counts as wide. */
export function useWideScreen(): boolean {
  return useSyncExternalStore(subscribe, () => query()?.matches ?? true, () => true)
}
