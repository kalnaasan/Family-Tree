import { create } from 'zustand'

export interface ToastMessage {
  message: string
  /** The history step a "· Undo" button reverts. The button shows only while that step is still the latest. */
  undoStepId?: number
}

/** View state that is not part of the Tree and is never saved: which Person is open, the toast, tree or list. */
interface UiState {
  selectedId: string | null
  toast: ToastMessage | null
  /** Show the nested List view instead of the tree drawing (spec section 7). */
  listView: boolean
  /** On a phone the open Person's panel is a bottom sheet: a short peek, or expanded to the full details. */
  sheet: 'peek' | 'expanded'
  /** Pixels of the screen the sheet covers (0 when there is no sheet), so the view keeps the Person above it. */
  sheetHeight: number
  /** What is typed in the search box (spec section 11). In the List view it filters the list. */
  query: string
  /** Set by picking a search result: the tree pans to this Person at the same zoom. `seq` makes a repeat count. */
  revealRequest: { id: string; seq: number } | null
  setQuery: (query: string) => void
  /** Opens a Person and asks the tree to pan to them, keeping the zoom. */
  reveal: (id: string) => void
  select: (id: string | null) => void
  showToast: (message: string, undoStepId?: number) => void
  clearToast: () => void
  setListView: (on: boolean) => void
  setSheet: (sheet: 'peek' | 'expanded') => void
  setSheetHeight: (height: number) => void
}

export const useUiStore = create<UiState>()((set) => ({
  selectedId: null,
  toast: null,
  listView: false,
  sheet: 'peek',
  sheetHeight: 0,
  query: '',
  revealRequest: null,
  setQuery: (query) => set({ query }),
  reveal: (id) =>
    set((s) => ({ selectedId: id, sheet: 'peek', revealRequest: { id, seq: (s.revealRequest?.seq ?? 0) + 1 } })),
  select: (id) => set({ selectedId: id }),
  setSheet: (sheet) => set({ sheet }),
  setSheetHeight: (sheetHeight) => set({ sheetHeight }),
  showToast: (message, undoStepId) => set({ toast: { message, undoStepId } }),
  clearToast: () => set({ toast: null }),
  setListView: (on) => set({ listView: on }),
}))
