import type { Tree } from './schema.ts'

/**
 * Undo/redo history (spec section 10). One step is one user action: a whole add-relative flow, an edit save, a
 * delete with its links, a Focus change. It holds the exact Tree before and after, so undo restores the prior
 * document itself, not a rebuilt copy. Immutable updates share structure, so 50 steps cost little memory.
 */
export const HISTORY_LIMIT = 50

export interface HistoryStep {
  id: number
  /** What the action was, e.g. "Add mother" or "Delete Ben"; used to announce an undo. */
  label: string
  before: Tree
  after: Tree
  /**
   * Called once when the step leaves history for good (pushed out by newer steps, discarded by a new action
   * after an undo, or cleared by a load). Holds on to things an undo would need, such as a deleted photo Blob,
   * until then.
   */
  release?: () => void
}

export interface HistoryState {
  /** Oldest first; the last one is what Undo reverts. */
  past: HistoryStep[]
  /** The next step to Redo comes first. */
  future: HistoryStep[]
}

export const emptyHistory = (): HistoryState => ({ past: [], future: [] })

/** Records a new step. It ends the redo chain; steps that fall out of either list are returned to be released. */
export function pushStep(
  history: HistoryState,
  step: HistoryStep,
  limit = HISTORY_LIMIT,
): { history: HistoryState; discarded: HistoryStep[] } {
  const past = [...history.past, step]
  const overflow = Math.max(0, past.length - limit)
  return {
    history: { past: past.slice(overflow), future: [] },
    discarded: [...past.slice(0, overflow), ...history.future],
  }
}

export function undoStep(history: HistoryState): { history: HistoryState; step: HistoryStep } | null {
  const step = history.past.at(-1)
  if (!step) return null
  return { step, history: { past: history.past.slice(0, -1), future: [step, ...history.future] } }
}

export function redoStep(history: HistoryState): { history: HistoryState; step: HistoryStep } | null {
  const step = history.future[0]
  if (!step) return null
  return { step, history: { past: [...history.past, step], future: history.future.slice(1) } }
}

/** Every step in the history, to be released when it is cleared. */
export const allSteps = (history: HistoryState): HistoryStep[] => [...history.past, ...history.future]
