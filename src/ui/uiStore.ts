import { create } from 'zustand'

export interface ToastMessage {
  message: string
  /** The history step a "· Undo" button reverts. The button shows only while that step is still the latest. */
  undoStepId?: number
}

/** View state that is not part of the Tree and is never saved: which Person is open, and the current toast. */
interface UiState {
  selectedId: string | null
  toast: ToastMessage | null
  select: (id: string | null) => void
  showToast: (message: string, undoStepId?: number) => void
  clearToast: () => void
}

export const useUiStore = create<UiState>()((set) => ({
  selectedId: null,
  toast: null,
  select: (id) => set({ selectedId: id }),
  showToast: (message, undoStepId) => set({ toast: { message, undoStepId } }),
  clearToast: () => set({ toast: null }),
}))
