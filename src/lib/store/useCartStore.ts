import { create } from "zustand";
import type { CartLine, CartLineModifier, OrderType } from "@/lib/types";
import { genId } from "@/lib/utils";

interface CartStore {
  lines: CartLine[];
  orderType: OrderType;
  tableNumber?: string;
  customerName?: string;
  discountPercent: number;
  // A fixed-amount discount ("deduct exactly 50 EGP"), as an alternative to
  // discountPercent — the two are mutually exclusive: setting one clears
  // the other, and whichever is currently non-zero wins for the actual
  // deduction (see computeDiscountAmount below, the single place both the
  // cart display and the payment screen read this from).
  discountFixedAmount: number;

  addLine: (line: Omit<CartLine, "lineId">) => void;
  incrementLine: (lineId: string) => void;
  decrementLine: (lineId: string) => void;
  removeLine: (lineId: string) => void;
  setLineNote: (lineId: string, note: string) => void;
  clearCart: () => void;
  setOrderType: (t: OrderType) => void;
  setTableNumber: (v: string) => void;
  setCustomerName: (v: string) => void;
  setDiscountPercent: (v: number) => void;
  setDiscountFixedAmount: (v: number) => void;

  // Multi Pricing — a one-shot bulk action, not a persistent mode: pressing
  // "Second Price" switches every line CURRENTLY in the cart to that
  // product's secondary price. Lines added afterward still start at
  // whatever price the menu grid gave them (primary) until the button is
  // pressed again — see CartPanel's "Second Price" button.
  applySecondaryPricing: (getSecondaryPrice: (productId: string) => number | undefined) => void;

  subtotal: () => number;
}

/** The one place discount math happens — used by both CartPanel (live cart
 * display) and PaymentDialog (the actual charge), so they can never drift
 * apart. Fixed amount takes precedence when set (mutually exclusive with
 * percent in the UI already, but this is the authoritative tie-break if
 * both were ever non-zero). Deliberately has the exact same lack of
 * upper-bound clamping the percent path already had (percent itself is
 * clamped to 0-100 in setDiscountPercent, but the resulting amount was
 * never re-clamped against subtotal) — not introducing new validation
 * behavior the existing discount didn't already have. */
export function computeDiscountAmount(subtotal: number, discountPercent: number, discountFixedAmount: number): number {
  if (discountFixedAmount > 0) return discountFixedAmount;
  return Math.round(subtotal * (discountPercent / 100) * 100) / 100;
}

function lineTotal(line: CartLine): number {
  const modTotal = line.modifiers.reduce((sum, m) => sum + m.priceDelta, 0);
  return (line.unitPrice + modTotal) * line.qty;
}

function sameLineKey(a: { productId: string; modifiers: CartLineModifier[] }, b: { productId: string; modifiers: CartLineModifier[] }) {
  if (a.productId !== b.productId) return false;
  const aKey = a.modifiers.map((m) => m.optionId).sort().join(",");
  const bKey = b.modifiers.map((m) => m.optionId).sort().join(",");
  return aKey === bKey;
}

export const useCartStore = create<CartStore>()((set, get) => ({
  lines: [],
  orderType: "takeaway",
  discountPercent: 0,
  discountFixedAmount: 0,

  addLine: (line) =>
    set((state) => {
      // merge identical product+modifiers combos for speed
      const existingIdx = state.lines.findIndex((l) => sameLineKey(l, line) && !l.note);
      if (existingIdx >= 0 && !line.note) {
        const updated = [...state.lines];
        updated[existingIdx] = { ...updated[existingIdx], qty: updated[existingIdx].qty + line.qty };
        return { lines: updated };
      }
      return { lines: [...state.lines, { ...line, lineId: genId("line") }] };
    }),

  incrementLine: (lineId) =>
    set((state) => ({
      lines: state.lines.map((l) => (l.lineId === lineId ? { ...l, qty: l.qty + 1 } : l)),
    })),

  decrementLine: (lineId) =>
    set((state) => {
      const line = state.lines.find((l) => l.lineId === lineId);
      if (!line) return state;
      if (line.qty <= 1) {
        return { lines: state.lines.filter((l) => l.lineId !== lineId) };
      }
      return {
        lines: state.lines.map((l) => (l.lineId === lineId ? { ...l, qty: l.qty - 1 } : l)),
      };
    }),

  removeLine: (lineId) =>
    set((state) => ({ lines: state.lines.filter((l) => l.lineId !== lineId) })),

  setLineNote: (lineId, note) =>
    set((state) => ({
      lines: state.lines.map((l) => (l.lineId === lineId ? { ...l, note } : l)),
    })),

  clearCart: () =>
    set({ lines: [], discountPercent: 0, discountFixedAmount: 0, tableNumber: undefined, customerName: undefined }),

  setOrderType: (t) => set({ orderType: t }),
  setTableNumber: (v) => set({ tableNumber: v }),
  setCustomerName: (v) => set({ customerName: v }),
  setDiscountPercent: (v) => set({ discountPercent: Math.max(0, Math.min(100, v)), discountFixedAmount: 0 }),
  setDiscountFixedAmount: (v) => set({ discountFixedAmount: Math.max(0, v), discountPercent: 0 }),

  applySecondaryPricing: (getSecondaryPrice) =>
    set((state) => ({
      lines: state.lines.map((l) => {
        const secondary = getSecondaryPrice(l.productId);
        return secondary !== undefined ? { ...l, unitPrice: secondary } : l;
      }),
    })),

  subtotal: () => get().lines.reduce((sum, l) => sum + lineTotal(l), 0),
}));

export { lineTotal };
