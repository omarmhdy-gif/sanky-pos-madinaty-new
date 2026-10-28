import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getSafeStorage } from "@/lib/store/storage";
import { supabase } from "@/lib/supabase/client";
import type { StaffUser } from "@/lib/types";

interface AuthStore {
  currentUser: StaffUser | null;
  isAuthenticated: boolean;
  login: (user: StaffUser) => void;
  clearLocalAuth: () => void;
  logout: () => void;
}

// The staff identity is persisted across renderer refreshes. On Electron,
// logging out a cashier keeps the separate device-auth session so the one-time
// activation code is not requested again. Web logout still ends Supabase Auth.
export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      currentUser: null,
      isAuthenticated: false,
      login: (user) => set({ currentUser: user, isAuthenticated: true }),
      // Clear cashier identity without calling Supabase Auth. Auth event
      // handlers use this so SIGNED_OUT cannot recursively trigger signOut.
      clearLocalAuth: () => set({ currentUser: null, isAuthenticated: false }),
      logout: () => {
        if (typeof window === "undefined" || !window.sankyDesktop?.isDesktop) {
          void supabase.auth.signOut();
        }
        set({ currentUser: null, isAuthenticated: false });
      },
    }),
    {
      name: "sanky-pos-auth",
      storage: createJSONStorage(getSafeStorage),
    }
  )
);
