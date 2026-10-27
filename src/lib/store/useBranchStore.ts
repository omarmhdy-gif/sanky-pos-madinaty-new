import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getSafeStorage } from "@/lib/store/storage";
import type { Branch } from "@/lib/types";
import * as api from "@/lib/supabase/api";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timed out after ${ms / 1000}s`)),
        ms
      )
    ),
  ]);
}

interface BranchStore {
  branches: Branch[];
  currentBranchId: string | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  fetchBranches: () => Promise<void>;
  setBranch: (id: string) => void;
  clearBranch: () => void;
}

export const useBranchStore = create<BranchStore>()(
  persist(
    (set, get) => ({
      branches: [],
      currentBranchId: "branch_madinaty",
      loading: false,
      loaded: false,
      error: null,

      fetchBranches: async () => {
        set({ loading: true, error: null });

        try {
          const branches = await withTimeout(
            api.fetchBranches(),
            10000
          );

          // Keep the selected branch when it remains visible to the current
          // signed-in owner; otherwise choose the first branch RLS returned.
          const madinatyExists = branches.some(
            (branch) => branch.id === "branch_madinaty"
          );
          const currentBranchId = get().currentBranchId;
          const currentBranchIsVisible = branches.some(
            (branch) => branch.id === currentBranchId
          );

          set({
            branches,
            currentBranchId: currentBranchIsVisible
              ? currentBranchId
              : madinatyExists
                ? "branch_madinaty"
                : branches[0]?.id ?? null,
            loading: false,
            loaded: true,
            error: null,
          });
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : "Failed to load branches";

          console.error("fetchBranches failed:", err);

          set({
            loading: false,
            error: message,
          });
        }
      },

      setBranch: (id) => set({ currentBranchId: id }),

      clearBranch: () => set({ currentBranchId: null }),
    }),
    {
      name: "sanky-pos-branch",
      storage: createJSONStorage(getSafeStorage),
      partialize: (state) => ({
        currentBranchId: state.currentBranchId,
      }),
    }
  )
);
