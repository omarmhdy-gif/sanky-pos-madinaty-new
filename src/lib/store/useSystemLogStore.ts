import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getSafeStorage } from "@/lib/store/storage";

export type SystemLogLevel = "info" | "warning" | "error";

export interface SystemLogEntry {
  id: string;
  at: string;
  message: string;
  level: SystemLogLevel;
}

export interface SystemLogStore {
  entries: SystemLogEntry[];
  log: (message: string, level?: SystemLogLevel) => void;
  clear: () => void;
}

const MAX_ENTRIES = 500;

// A persisted, till-local history of system events (connections lost/found,
// prints, sync activity) — Owner-only, surfaced in Devices → Diagnostics.
// Deliberately never synced through Supabase: it's a diagnostic trail for
// THIS physical till, not shop-wide business data.
export const useSystemLogStore = create<SystemLogStore>()(
  persist(
    (set) => ({
      entries: [],
      log: (message, level = "info") =>
        set((state) => ({
          entries: [
            { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), message, level },
            ...state.entries,
          ].slice(0, MAX_ENTRIES),
        })),
      clear: () => set({ entries: [] }),
    }),
    {
      name: "sanky-pos-system-log",
      storage: createJSONStorage(getSafeStorage),
    }
  )
);
