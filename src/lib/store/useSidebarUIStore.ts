import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getSafeStorage } from "@/lib/store/storage";

interface SidebarUIStore {
  collapsed: boolean;
  toggleCollapsed: () => void;
}

export const useSidebarUIStore = create<SidebarUIStore>()(
  persist(
    (set) => ({
      collapsed: false,
      toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
    }),
    {
      name: "sanky-pos-sidebar",
      storage: createJSONStorage(getSafeStorage),
      version: 1,
    }
  )
);
