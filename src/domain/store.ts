import { create } from 'zustand'
import { type AddRelativeRequest, addRelative } from './addRelative.ts'
import {
  HISTORY_LIMIT,
  type HistoryState,
  type HistoryStep,
  allSteps,
  emptyHistory,
  pushStep,
  redoStep,
  undoStep,
} from './history.ts'
import type { ParentLinkKind, Tree } from './schema.ts'
import {
  type DeletedPersonInfo,
  type NewPartnership,
  type NewPerson,
  type PersonPatch,
  addParentLink,
  addPartnership,
  addPerson,
  deletePerson,
  emptyTree,
  removeParentLink,
  removePartnership,
  setFocusPerson,
  updatePartnership,
  updatePerson,
} from './tree.ts'

export interface TreeActions {
  /**
   * While another tab is the one that edits, this tab only shows the Tree. Every change is refused (it throws, since the
   * screen must not offer one) and undo and redo do nothing; loading a Tree is still allowed.
   */
  setReadOnly: (readOnly: boolean) => void
  /**
   * Replaces the whole Tree (load from storage, import, restore) and clears the undo history: these are not
   * undoable (spec section 10).
   */
  loadTree: (tree: Tree) => void
  addPerson: (input: NewPerson) => void
  /** One add-relative flow as one store update: the new Person, their links and Partnership. Returns the new id. */
  addRelative: (request: AddRelativeRequest) => string
  /** `label` names the undo step; "Edit person" by default. */
  updatePerson: (id: string, patch: PersonPatch, label?: string) => void
  /**
   * Returns what was removed along with the Person. `release` is called when this step leaves the undo history,
   * so a deleted photo Blob can be kept in memory until then.
   */
  deletePerson: (id: string, options?: { release?: () => void }) => DeletedPersonInfo
  addParentLink: (childId: string, parentId: string, kind?: ParentLinkKind) => void
  removeParentLink: (childId: string, parentId: string) => void
  addPartnership: (input: NewPartnership) => void
  updatePartnership: (id: string, patch: Parameters<typeof updatePartnership>[2]) => void
  removePartnership: (id: string) => void
  setFocusPerson: (id: string) => void
  /** Reverts the latest action. Returns it, or null if there is nothing to undo. */
  undo: () => HistoryStep | null
  redo: () => HistoryStep | null
}

export type TreeState = Tree & HistoryState & TreeActions & { readOnly: boolean }

/** The Tree's own fields; the store state also holds the history and the action functions. */
const pick = (state: Tree): Tree => ({
  focusPersonId: state.focusPersonId,
  persons: state.persons,
  parentLinks: state.parentLinks,
  partnerships: state.partnerships,
})

let nextStepId = 1

/**
 * Normalized Tree state with undo history. Every action runs a pure function from `tree.ts`; if an integrity rule
 * fails the function throws before `set` is reached, so the state is never left half-changed. A successful
 * action is exactly one `set`, and exactly one history step.
 */
export function createTreeStore(initial: Tree = emptyTree()) {
  return create<TreeState>()((set, get) => {
    const history = (): HistoryState => ({ past: get().past, future: get().future })

    const commit = (label: string, before: Tree, after: Tree, release?: () => void) => {
      if (get().readOnly) throw new Error('This tab is read-only: another tab is editing')
      const pushed = pushStep(history(), { id: nextStepId++, label, before, after, release }, HISTORY_LIMIT)
      set({ ...after, ...pushed.history })
      for (const step of pushed.discarded) step.release?.()
    }
    const apply = (label: string, change: (tree: Tree) => Tree) => {
      const before = pick(get())
      commit(label, before, change(before))
    }

    return {
      ...initial,
      ...emptyHistory(),
      readOnly: false,
      setReadOnly: (readOnly) => set({ readOnly }),
      loadTree: (tree) => {
        const discarded = allSteps(history())
        set({ ...pick(tree), ...emptyHistory() })
        for (const step of discarded) step.release?.()
      },
      addPerson: (input) => apply('Add person', (t) => addPerson(t, input)),
      addRelative: (request) => {
        const before = pick(get())
        const result = addRelative(before, request)
        commit(`Add ${request.relation}`, before, result.tree)
        return result.personId
      },
      updatePerson: (id, patch, label) => apply(label ?? 'Edit person', (t) => updatePerson(t, id, patch)),
      deletePerson: (id, options) => {
        const before = pick(get())
        const result = deletePerson(before, id)
        commit(`Delete ${result.deleted.person.firstName}`, before, result.tree, options?.release)
        return result.deleted
      },
      addParentLink: (childId, parentId, kind) =>
        apply('Add parent link', (t) => addParentLink(t, childId, parentId, kind)),
      removeParentLink: (childId, parentId) =>
        apply('Remove parent link', (t) => removeParentLink(t, childId, parentId)),
      addPartnership: (input) => apply('Add partnership', (t) => addPartnership(t, input)),
      updatePartnership: (id, patch) => apply('Edit partnership', (t) => updatePartnership(t, id, patch)),
      removePartnership: (id) => apply('Remove partnership', (t) => removePartnership(t, id)),
      setFocusPerson: (id) => apply('Change Focus person', (t) => setFocusPerson(t, id)),
      undo: () => {
        if (get().readOnly) return null
        const result = undoStep(history())
        if (!result) return null
        set({ ...pick(result.step.before), ...result.history })
        return result.step
      },
      redo: () => {
        if (get().readOnly) return null
        const result = redoStep(history())
        if (!result) return null
        set({ ...pick(result.step.after), ...result.history })
        return result.step
      },
    }
  })
}

export const useTreeStore = createTreeStore()
