import { useTreeStore } from '../domain/store.ts'
import { RedoIcon, UndoIcon } from './icons.tsx'
import { redoLatest, undoLatest } from './undo.ts'

const buttonClass = 'btn btn-icon disabled:opacity-40'

export function UndoControls() {
  const canUndo = useTreeStore((s) => s.past.length > 0 && !s.readOnly)
  const canRedo = useTreeStore((s) => s.future.length > 0 && !s.readOnly)
  return (
    <div role="group" aria-label="History" className="flex gap-1">
      <button type="button" disabled={!canUndo} onClick={undoLatest} aria-keyshortcuts="Control+Z Meta+Z" aria-label="Undo" title="Undo" className={buttonClass}>
        <UndoIcon />
      </button>
      <button
        type="button"
        disabled={!canRedo}
        onClick={redoLatest}
        aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
        aria-label="Redo"
        title="Redo"
        className={buttonClass}
      >
        <RedoIcon />
      </button>
    </div>
  )
}
