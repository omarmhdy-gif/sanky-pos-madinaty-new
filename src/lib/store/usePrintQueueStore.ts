import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getSafeStorage } from "@/lib/store/storage";

export interface QueuedReceipt {
  id: string;
  queuedAt: string;
  /** Human-readable label for the reprint UI, e.g. "Order #142". */
  label: string;
  /** Pre-built ESC/POS bytes (receipt + drawer-kick if applicable), already
   * hex-encoded — retrying just resends these exact bytes, no need to
   * rebuild them from an Order/settings snapshot. */
  dataHex: string;
  printerIp: string;
  printerPort: number;
  attempts: number;
  lastError: string | null;
}

export interface PrintQueueStore {
  queue: QueuedReceipt[];
  enqueue: (item: Omit<QueuedReceipt, "id" | "queuedAt" | "attempts" | "lastError">) => void;
  remove: (id: string) => void;
  markAttempt: (id: string, error: string | null) => void;
  clear: () => void;
}

// "Never lose a receipt": a print job that fails (Device Server or printer
// unreachable) lands here instead of just vanishing into an error toast.
// Persisted so a queued receipt survives a page reload — the cashier can
// always find it again in Devices → Queued Receipts and retry or reprint it
// manually, and the background monitor retries it automatically once the
// printer/Device Server come back online.
export const usePrintQueueStore = create<PrintQueueStore>()(
  persist(
    (set) => ({
      queue: [],
      enqueue: (item) =>
        set((state) => ({
          queue: [
            { ...item, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, queuedAt: new Date().toISOString(), attempts: 0, lastError: null },
            ...state.queue,
          ],
        })),
      remove: (id) => set((state) => ({ queue: state.queue.filter((q) => q.id !== id) })),
      markAttempt: (id, error) =>
        set((state) => ({
          queue: state.queue.map((q) => (q.id === id ? { ...q, attempts: q.attempts + 1, lastError: error } : q)),
        })),
      clear: () => set({ queue: [] }),
    }),
    {
      name: "sanky-pos-print-queue",
      storage: createJSONStorage(getSafeStorage),
    }
  )
);
