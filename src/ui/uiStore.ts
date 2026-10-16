import { create } from 'zustand'

/** View state that is not part of the Tree and is never saved: which Person is open, and the current toast. */
interface UiState {
  selectedId: string | null
  toast: string | null
  select: (id: string | null) => void
  showToast: (message: string) => void
  clearToast: () => void
}

export const useUiStore = create<UiState>()((set) => ({
  selectedId: null,
  toast: null,
  select: (id) => set({ selectedId: id }),
  showToast: (message) => set({ toast: message }),
  clearToast: () => set({ toast: null }),
}))
