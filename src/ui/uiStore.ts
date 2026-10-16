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
  select: (id) => set({ selectedId: id }),
  setSheet: (sheet) => set({ sheet }),
  setSheetHeight: (sheetHeight) => set({ sheetHeight }),
  showToast: (message, undoStepId) => set({ toast: { message, undoStepId } }),
  clearToast: () => set({ toast: null }),
  setListView: (on) => set({ listView: on }),
}))
