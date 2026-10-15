import { create } from 'zustand'
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
  /** Replaces the whole Tree (load from storage, import, restore). */
  loadTree: (tree: Tree) => void
  addPerson: (input: NewPerson) => void
  updatePerson: (id: string, patch: PersonPatch) => void
  /** Returns what was removed along with the Person. */
  deletePerson: (id: string) => DeletedPersonInfo
  addParentLink: (childId: string, parentId: string, kind?: ParentLinkKind) => void
  removeParentLink: (childId: string, parentId: string) => void
  addPartnership: (input: NewPartnership) => void
  updatePartnership: (id: string, patch: Parameters<typeof updatePartnership>[2]) => void
  removePartnership: (id: string) => void
  setFocusPerson: (id: string) => void
}

export type TreeState = Tree & TreeActions

const pick = (state: Tree): Tree => ({
  focusPersonId: state.focusPersonId,
  persons: state.persons,
  parentLinks: state.parentLinks,
  partnerships: state.partnerships,
})

/**
 * Normalized Tree state. Every action runs a pure function from `tree.ts`; if an integrity rule fails the
 * function throws before `set` is reached, so the state is never left half-changed.
 */
export function createTreeStore(initial: Tree = emptyTree()) {
  return create<TreeState>()((set, get) => {
    const apply = (change: (tree: Tree) => Tree) => set(change(pick(get())))
    return {
      ...initial,
      loadTree: (tree) => set(tree),
      addPerson: (input) => apply((t) => addPerson(t, input)),
      updatePerson: (id, patch) => apply((t) => updatePerson(t, id, patch)),
      deletePerson: (id) => {
        const result = deletePerson(pick(get()), id)
        set(result.tree)
        return result.deleted
      },
      addParentLink: (childId, parentId, kind) => apply((t) => addParentLink(t, childId, parentId, kind)),
      removeParentLink: (childId, parentId) => apply((t) => removeParentLink(t, childId, parentId)),
      addPartnership: (input) => apply((t) => addPartnership(t, input)),
      updatePartnership: (id, patch) => apply((t) => updatePartnership(t, id, patch)),
      removePartnership: (id) => apply((t) => removePartnership(t, id)),
      setFocusPerson: (id) => apply((t) => setFocusPerson(t, id)),
    }
  })
}

export const useTreeStore = createTreeStore()
