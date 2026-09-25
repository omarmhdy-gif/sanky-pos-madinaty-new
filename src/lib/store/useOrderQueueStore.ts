import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getSafeStorage } from "@/lib/store/storage";
import type { Order } from "@/lib/types";

export type QueuedOrderPayload = Omit<Order, "id" | "orderNumber" | "branchId">;

export interface QueuedOrder {
  tempId: string;
  queuedAt: string;
  /** Captured at queue-time, not flush-time — the branch this till was
   * actually selling from when the sale happened, which may not be the
   * branch selected here anymore by the time connectivity returns. */
  branchId: string;
  payload: QueuedOrderPayload;
  attempts: number;
  lastError: string | null;
}

export interface OrderQueueStore {
  queue: QueuedOrder[];
  enqueue: (branchId: string, payload: QueuedOrderPayload) => string;
  remove: (tempId: string) => void;
  markAttempt: (tempId: string, error: string | null) => void;
  clear: () => void;
}

// Offline order protection: if saving an order to Supabase fails because
// the connection is down (not because of a real validation error), the
// checkout payload is queued here — NOT injected into useDataStore.orders
// as a fake Order. That's a deliberate safety choice: orders.orderNumber
// comes from a real Postgres identity column and Reports/Dashboard/Orders
// all aggregate over that array, so a locally-fabricated "pending" Order
// with a fake id would either double-count once the real one lands, or
// require threading a "pending" status through every consumer that
// switches on OrderStatus. Keeping the queue entirely separate avoids that
// whole class of bug — the cashier still gets an immediate success
// confirmation and a printed receipt (which doesn't depend on Supabase at
// all), and the order becomes "real" (gets its actual id/orderNumber) only
// once it's actually synced, via the exact same addOrder() path a normal
// checkout uses.
export const useOrderQueueStore = create<OrderQueueStore>()(
  persist(
    (set) => ({
      queue: [],
      enqueue: (branchId, payload) => {
        const tempId = `pending_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        set((state) => ({
          queue: [...state.queue, { tempId, queuedAt: new Date().toISOString(), branchId, payload, attempts: 0, lastError: null }],
        }));
        return tempId;
      },
      remove: (tempId) => set((state) => ({ queue: state.queue.filter((q) => q.tempId !== tempId) })),
      markAttempt: (tempId, error) =>
        set((state) => ({
          queue: state.queue.map((q) => (q.tempId === tempId ? { ...q, attempts: q.attempts + 1, lastError: error } : q)),
        })),
      clear: () => set({ queue: [] }),
    }),
    {
      name: "sanky-pos-order-queue",
      storage: createJSONStorage(getSafeStorage),
    }
  )
);
