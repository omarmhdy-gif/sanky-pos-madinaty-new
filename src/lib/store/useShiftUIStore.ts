import { create } from "zustand";

// Purely transient UI state — whether the Start Shift dialog is open. Not
// persisted: it's shown either by the cashier tapping "Open Shift" in the
// Topbar or by attempting to charge an order with no shift open, never
// forced automatically on page load (see Context in the Milestone 2.0 plan
// for why: closing a shift must not immediately re-trigger this).
interface ShiftUIStore {
  startShiftOpen: boolean;
  openStartShift: () => void;
  closeStartShift: () => void;
}

export const useShiftUIStore = create<ShiftUIStore>()((set) => ({
  startShiftOpen: false,
  openStartShift: () => set({ startShiftOpen: true }),
  closeStartShift: () => set({ startShiftOpen: false }),
}));
