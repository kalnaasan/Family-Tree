import { useTreeStore } from '../domain/store.ts'
import { redoLatest, undoLatest } from './undo.ts'

const buttonClass = 'min-h-11 rounded border border-stone-500 px-3 disabled:opacity-50'

export function UndoControls() {
  const canUndo = useTreeStore((s) => s.past.length > 0)
  const canRedo = useTreeStore((s) => s.future.length > 0)
  return (
    <div role="group" aria-label="History" className="flex gap-2">
      <button type="button" disabled={!canUndo} onClick={undoLatest} aria-keyshortcuts="Control+Z Meta+Z" className={buttonClass}>
        Undo
      </button>
      <button
        type="button"
        disabled={!canRedo}
        onClick={redoLatest}
        aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
        className={buttonClass}
      >
        Redo
      </button>
    </div>
  )
}
