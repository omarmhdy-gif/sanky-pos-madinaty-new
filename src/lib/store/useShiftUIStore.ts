import { create } from "zustand";

// Transient till dialogs. Login can require the opening amount; manual
// prompts remain dismissible, and closing a till never auto-opens another.
interface ShiftUIStore {
  startShiftOpen: boolean;
  startShiftRequired: boolean;
  openStartShift: (required?: boolean) => void;
  closeStartShift: () => void;
}

export const useShiftUIStore = create<ShiftUIStore>()((set) => ({
  startShiftOpen: false,
  startShiftRequired: false,
  openStartShift: (required = false) => set({ startShiftOpen: true, startShiftRequired: required }),
  closeStartShift: () => set({ startShiftOpen: false, startShiftRequired: false }),
}));
