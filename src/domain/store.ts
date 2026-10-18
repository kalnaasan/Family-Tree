import { create } from 'zustand'
import { type MessageRef, msg } from '../i18n/messageRef.ts'
import { type AddRelativeRequest, addRelative, relationRef } from './addRelative.ts'
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
import { type LinkExistingRequest, linkExisting } from './linkExisting.ts'
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
  setParentLinkKind,
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
  /** Links a Person already in the Tree as a relative (spec section 5.1): one store update, one Undo step. */
  linkExisting: (request: LinkExistingRequest) => void
  /** `label` names the undo step; "Edit person" by default. */
  updatePerson: (id: string, patch: PersonPatch, label?: MessageRef) => void
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
  setParentLinkKind: (childId: string, parentId: string, kind: ParentLinkKind) => void
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

    const commit = (label: MessageRef, before: Tree, after: Tree, release?: () => void) => {
      if (get().readOnly) throw new Error('This tab is read-only: another tab is editing')
      const pushed = pushStep(history(), { id: nextStepId++, label, before, after, release }, HISTORY_LIMIT)
      set({ ...after, ...pushed.history })
      for (const step of pushed.discarded) step.release?.()
    }
    const firstName = (tree: Tree, id: string) => tree.persons.find((p) => p.id === id)?.firstName ?? ''
    const partnershipLabel = (key: 'step.editLink' | 'step.removeLink', tree: Tree, id: string) => {
      const [first, second] = tree.partnerships.find((p) => p.id === id)?.personIds ?? ['', '']
      return msg(key, { first: firstName(tree, first), second: firstName(tree, second) })
    }
    /** `label` may depend on the Tree before the change (the names of the people a link joins). */
    const apply = (label: MessageRef | ((before: Tree) => MessageRef), change: (tree: Tree) => Tree) => {
      const before = pick(get())
      const after = change(before)
      commit(typeof label === 'function' ? label(before) : label, before, after)
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
      addPerson: (input) => apply(msg('step.addPerson'), (t) => addPerson(t, input)),
      addRelative: (request) => {
        const before = pick(get())
        const result = addRelative(before, request)
        commit(msg('step.addRelation', { relation: relationRef(request.relation) }), before, result.tree)
        return result.personId
      },
      linkExisting: (request) => {
        const before = pick(get())
        const after = linkExisting(before, request)
        commit(msg('step.link', { name: firstName(before, request.personId) }), before, after)
      },
      updatePerson: (id, patch, label) => apply(label ?? msg('step.editPerson'), (t) => updatePerson(t, id, patch)),
      deletePerson: (id, options) => {
        const before = pick(get())
        const result = deletePerson(before, id)
        commit(msg('step.delete', { name: result.deleted.person.firstName }), before, result.tree, options?.release)
        return result.deleted
      },
      addParentLink: (childId, parentId, kind) =>
        apply(msg('step.addParentLink'), (t) => addParentLink(t, childId, parentId, kind)),
      removeParentLink: (childId, parentId) =>
        apply(
          (t) => msg('step.removeLink', { first: firstName(t, childId), second: firstName(t, parentId) }),
          (t) => removeParentLink(t, childId, parentId),
        ),
      setParentLinkKind: (childId, parentId, kind) =>
        apply(
          (t) => msg('step.editLink', { first: firstName(t, childId), second: firstName(t, parentId) }),
          (t) => setParentLinkKind(t, childId, parentId, kind),
        ),
      addPartnership: (input) => apply(msg('step.addPartnership'), (t) => addPartnership(t, input)),
      updatePartnership: (id, patch) =>
        apply(
          (t) => partnershipLabel('step.editLink', t, id),
          (t) => updatePartnership(t, id, patch),
        ),
      removePartnership: (id) =>
        apply(
          (t) => partnershipLabel('step.removeLink', t, id),
          (t) => removePartnership(t, id),
        ),
      setFocusPerson: (id) => apply(msg('step.changeFocus'), (t) => setFocusPerson(t, id)),
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
