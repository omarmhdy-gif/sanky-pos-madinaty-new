import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getSafeStorage } from "@/lib/store/storage";
import type { HeldOrder, CartLine, OrderType } from "@/lib/types";
import { genId } from "@/lib/utils";

interface HeldOrdersStore {
  held: HeldOrder[];
  holdOrder: (data: {
    lines: CartLine[];
    orderType: OrderType;
    tableNumber?: string;
    customerName?: string;
    discountPercent: number;
    discountFixedAmount?: number;
    cashierName: string;
  }) => void;
  resumeOrder: (id: string) => HeldOrder | undefined;
  removeHeld: (id: string) => void;
}

export const useHeldOrdersStore = create<HeldOrdersStore>()((set, get) => ({
  held: [],
  holdOrder: (data) => {
    const label = data.customerName || data.tableNumber || `Order ${get().held.length + 1}`;
    set((state) => ({
      held: [
        {
          ...data,
          id: genId("hold"),
          label,
          createdAt: new Date().toISOString(),
        },
        ...state.held,
      ],
    }));
  },
  resumeOrder: (id) => get().held.find((h) => h.id === id),
  removeHeld: (id) => set((state) => ({ held: state.held.filter((h) => h.id !== id) })),
}));

interface FavoritesStore {
  favoriteIds: string[];
  recentIds: string[];
  toggleFavorite: (productId: string) => void;
  trackRecent: (productId: string) => void;
}

export const useFavoritesStore = create<FavoritesStore>()(
  persist(
    (set, get) => ({
      favoriteIds: [],
      recentIds: [],
      toggleFavorite: (productId) =>
        set((state) => ({
          favoriteIds: state.favoriteIds.includes(productId)
            ? state.favoriteIds.filter((id) => id !== productId)
            : [...state.favoriteIds, productId],
        })),
      trackRecent: (productId) =>
        set((state) => ({
          recentIds: [productId, ...state.recentIds.filter((id) => id !== productId)].slice(0, 12),
        })),
    }),
    {
      name: "sanky-pos-favorites",
      storage: createJSONStorage(getSafeStorage),
    }
  )
);
