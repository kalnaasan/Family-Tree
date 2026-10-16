import { useEffect } from 'react'
import { useTreeStore } from '../domain/store.ts'
import { useUiStore } from './uiStore.ts'

/** If the open Person no longer exists after an undo or redo, close their panel and hand focus to the tree. */
function closePanelIfPersonGone(): void {
  const { selectedId, select } = useUiStore.getState()
  if (selectedId === null || useTreeStore.getState().persons.some((p) => p.id === selectedId)) return
  select(null)
  document.querySelector<HTMLElement>('[aria-label="Family tree"]')?.focus()
}

/** Reverts the latest action and says so, so a screen reader user hears what changed. */
export function undoLatest(): void {
  const step = useTreeStore.getState().undo()
  if (!step) return
  useUiStore.getState().showToast(`Undid: ${step.label}`)
  closePanelIfPersonGone()
}

export function redoLatest(): void {
  const step = useTreeStore.getState().redo()
  if (!step) return
  useUiStore.getState().showToast(`Redid: ${step.label}`)
  closePanelIfPersonGone()
}

/** Text fields keep their own undo; the app's undo must not steal Ctrl+Z from someone typing. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  return target instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'range'].includes(target.type)
}

/** Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z (and Ctrl+Y) redoes (spec section 10). */
export function useUndoShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || !(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      const undo = key === 'z' && !event.shiftKey
      const redo = (key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey && !event.metaKey)
      if ((!undo && !redo) || isTextEntry(event.target)) return
      event.preventDefault()
      if (undo) undoLatest()
      else redoLatest()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
