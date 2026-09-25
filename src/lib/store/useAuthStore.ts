import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getSafeStorage } from "@/lib/store/storage";
import type { StaffUser } from "@/lib/types";

interface AuthStore {
  currentUser: StaffUser | null;
  isAuthenticated: boolean;
  login: (user: StaffUser) => void;
  logout: () => void;
}

// Persisted deliberately: a refresh should keep the till logged in exactly
// where it was (per explicit request) — only an actual Logout clears this
// and returns to the user-selection screen. Holds only the same
// non-secret StaffUser fields already sent to the client on every login
// (id/branchId/name/role/avatarColor/isActive) — no PIN.
export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      currentUser: null,
      isAuthenticated: false,
      login: (user) => set({ currentUser: user, isAuthenticated: true }),
      logout: () => set({ currentUser: null, isAuthenticated: false }),
    }),
    {
      name: "sanky-pos-auth",
      storage: createJSONStorage(getSafeStorage),
    }
  )
);
