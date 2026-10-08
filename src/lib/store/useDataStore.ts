import { create } from "zustand";
import type {
  AppData,
  Product,
  Category,
  Order,
  Expense,
  StaffUser,
  ShopSettings,
  UserRole,
  PermissionKey,
  InventoryItem,
  Shift,
  Attendance,
  AttendanceEmployee,
  InventoryQualityCheck,
} from "@/lib/types";
import * as api from "@/lib/supabase/api";
import { toast } from "@/components/ui/toast";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { useAuthStore } from "@/lib/store/useAuthStore";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function requireBranchId(): string {
  const id = useBranchStore.getState().currentBranchId;
  if (!id) throw new Error("No branch selected");
  return id;
}

function currentEmployee() {
  const user = useAuthStore.getState().currentUser;
  return { employeeId: user?.id, employeeName: user?.name ?? "Unknown" };
}

// "Match Recipe With Other Branch" — best-effort, one-way push on every save
// of a synced product to whichever product in the other branch shares its
// English name. Never blocks or fails the primary save if no match exists
// or the push itself errors.
async function syncRecipeAcrossBranches(product: Product) {
  if (!product.recipeSynced) return;
  try {
    const otherBranch = useBranchStore.getState().branches.find((b) => b.id !== product.branchId);
    if (!otherBranch) return;
    const match = await api.findProductByName(otherBranch.id, product.name.en);
    if (match && match.id !== product.id) {
      await api.updateProduct(match.id, { recipe: product.recipe, recipeSynced: true });
    }
  } catch {
    // best-effort only
  }
}

interface DataStore extends AppData {
  loading: boolean;
  loaded: boolean;
  fetchAll: () => Promise<void>;

  // Products
  addProduct: (p: Omit<Product, "id" | "sortOrder" | "branchId">) => Promise<void>;
  updateProduct: (id: string, patch: Partial<Product>) => Promise<boolean>;
  updateProductRecipe: (id: string, recipe: Product["recipe"]) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  // Categories
  addCategory: (c: Omit<Category, "id" | "sortOrder" | "branchId">) => Promise<void>;
  updateCategory: (id: string, patch: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  // Inventory
  addInventoryItem: (item: Omit<InventoryItem, "id" | "branchId">) => Promise<InventoryItem | undefined>;
  updateInventoryItem: (id: string, patch: Partial<InventoryItem>) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;
  receiveStock: (itemId: string, qty: number, unitCost: number, supplier?: string) => Promise<void>;
  adjustStock: (itemId: string, delta: number, reason: "waste" | "stock_count") => Promise<void>;
  recordInventoryQualityCheck: (input: Omit<InventoryQualityCheck, "id" | "branchId" | "checkedAt">) => Promise<void>;
  deletePurchase: (purchaseId: string) => Promise<void>;
  // Shifts
  startShift: (openingCash: number) => Promise<void>;
  closeShift: (shiftId: string, actualCash: number) => Promise<Shift>;
  // Attendance — a separate employee roster (name+PIN only) clocking in/out,
  // distinct from both `staff` (login accounts) and the cash-till Shift above.
  addAttendanceEmployee: (e: {
    name: string;
    pin: string;
    isActive: boolean;
    assignedShiftKey?: string;
    shiftStart?: string;
    shiftEnd?: string;
    graceMinutes?: number;
  }) => Promise<void>;
  updateAttendanceEmployee: (id: string, patch: Partial<AttendanceEmployee> & { pin?: string }) => Promise<void>;
  deleteAttendanceEmployee: (id: string) => Promise<void>;
  checkInAttendance: (
    shiftKey: string,
    officialStart: string,
    officialEnd: string,
    employeeId: string,
    employeeName: string,
    graceMinutes?: number
  ) => Promise<Attendance>;
  checkOutAttendance: (attendanceId: string) => Promise<Attendance>;
  // Orders — addOrder's errors propagate (not caught here) so PaymentDialog
  // can show its own error state and keep the cart intact on failure.
  // branchIdOverride is used when flushing the offline order queue (see
  // useOrderQueueStore) — a queued order must be attributed to the branch
  // it was actually sold in, not whichever branch happens to be selected
  // on this till at the moment connectivity returns.
  addOrder: (o: Omit<Order, "id" | "orderNumber" | "branchId">, branchIdOverride?: string) => Promise<Order>;
  voidOrder: (id: string) => Promise<void>;
  refundOrder: (id: string) => Promise<void>;
  fetchOrdersInRange: (from: Date, to: Date) => Promise<void>;
  // One page of orders (newest first), merged into `orders` the same
  // dedup'd way as fetchOrdersInRange — used by the Orders page's
  // pagination. Returns whether there's likely another page after this one.
  fetchOrdersPage: (opts: { from?: Date; to?: Date; limit: number; offset: number }) => Promise<boolean>;
  // A single shift's orders — used by ShiftDialog's live pre-close preview
  // and its final report, so it doesn't depend on a full order preload.
  fetchOrdersForShift: (shiftId: string) => Promise<void>;
  // Expenses
  addExpense: (e: Omit<Expense, "id" | "createdAt" | "branchId">) => Promise<void>;
  updateExpense: (id: string, patch: Partial<Expense>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  // Staff — pin is separate from StaffUser (never read back from the server)
  addStaff: (s: { name: string; pin: string; role: UserRole; avatarColor: string; isActive: boolean; permissions?: PermissionKey[] }) => Promise<void>;
  updateStaff: (id: string, patch: Partial<StaffUser> & { pin?: string }) => Promise<void>;
  deleteStaff: (id: string) => Promise<void>;
  // Settings
  updateSettings: (patch: Partial<ShopSettings>) => Promise<void>;
}

const EMPTY_SETTINGS: ShopSettings = {
  shopName: "",
  currency: "",
  currencySymbol: "",
  taxRate: 0,
  taxEnabled: false,
  locale: "en",
  theme: "light",
};

export const useDataStore = create<DataStore>()((set, get) => ({
  settings: EMPTY_SETTINGS,
  staff: [],
  categories: [],
  customers: [],
  products: [],
  modifierGroups: [],
  orders: [],
  expenses: [],
  inventoryItems: [],
  inventoryQualityChecks: [],
  stockMovements: [],
  purchases: [],
  shifts: [],
  attendance: [],
  attendanceEmployees: [],
  loading: false,
  loaded: false,

  fetchAll: async () => {
    const branchId = useBranchStore.getState().currentBranchId;
    if (!branchId) return;
    set({ loading: true });
    try {
      const data = await api.fetchAll(branchId);
      set({ ...data, loading: false, loaded: true });
    } catch (err) {
      set({ loading: false });
      toast(errorMessage(err, "Failed to load data from Supabase"), "error");
    }
  },

  addProduct: async (p) => {
    try {
      const created = await api.createProduct({ ...p, branchId: requireBranchId() }, get().products.length);
      set((state) => ({ products: [...state.products, created] }));
      syncRecipeAcrossBranches(created);
    } catch (err) {
      toast(errorMessage(err, "Failed to add product"), "error");
    }
  },
  updateProduct: async (id, patch) => {
    try {
      const updated = await api.updateProduct(id, patch);
      set((state) => ({ products: state.products.map((p) => (p.id === id ? updated : p)) }));
      syncRecipeAcrossBranches(updated);
      return true;
    } catch (err) {
      toast(errorMessage(err, "Failed to update product"), "error");
      return false;
    }
  },
  updateProductRecipe: async (id, recipe) => {
    const updated = await api.updateProduct(id, { recipe });
    set((state) => ({ products: state.products.map((product) => (product.id === id ? updated : product)) }));
    syncRecipeAcrossBranches(updated);
  },
  deleteProduct: async (id) => {
    try {
      await api.deleteProduct(id);
      set((state) => ({ products: state.products.filter((p) => p.id !== id) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to delete product"), "error");
    }
  },

  addCategory: async (c) => {
    try {
      const created = await api.createCategory({ ...c, branchId: requireBranchId() }, get().categories.length);
      set((state) => ({ categories: [...state.categories, created] }));
    } catch (err) {
      toast(errorMessage(err, "Failed to add category"), "error");
    }
  },
  updateCategory: async (id, patch) => {
    try {
      const updated = await api.updateCategory(id, patch);
      set((state) => ({ categories: state.categories.map((c) => (c.id === id ? updated : c)) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to update category"), "error");
    }
  },
  deleteCategory: async (id) => {
    try {
      await api.deleteCategory(id);
      set((state) => ({ categories: state.categories.filter((c) => c.id !== id) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to delete category"), "error");
    }
  },

  addInventoryItem: async (item) => {
    try {
      const created = await api.createInventoryItem({ ...item, branchId: requireBranchId() });
      set((state) => ({ inventoryItems: [...state.inventoryItems, created].sort((a, b) => a.quantity - b.quantity) }));
      return created;
    } catch (err) {
      toast(errorMessage(err, "Failed to add inventory item"), "error");
      return undefined;
    }
  },
  updateInventoryItem: async (id, patch) => {
    try {
      const updated = await api.updateInventoryItem(id, patch);
      set((state) => ({ inventoryItems: state.inventoryItems.map((i) => (i.id === id ? updated : i)) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to update inventory item"), "error");
    }
  },
  deleteInventoryItem: async (id) => {
    try {
      await api.deleteInventoryItem(id);
      set((state) => ({ inventoryItems: state.inventoryItems.filter((i) => i.id !== id) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to delete inventory item"), "error");
    }
  },
  receiveStock: async (itemId, qty, unitCost, supplier) => {
    try {
      const { employeeId, employeeName } = currentEmployee();
      const result = await api.receivePurchase({
        branchId: requireBranchId(),
        inventoryItemId: itemId,
        qty: Math.abs(qty),
        unitCost,
        supplier,
        employeeId,
        employeeName,
      });
      set((state) => ({
        inventoryItems: state.inventoryItems.map((i) =>
          i.id === itemId ? { ...i, ...result.inventoryItem } : i
        ),
        stockMovements: [result.movement, ...state.stockMovements],
        purchases: [result.purchase, ...state.purchases],
      }));
    } catch (err) {
      toast(errorMessage(err, "Failed to receive stock"), "error");
    }
  },
  adjustStock: async (itemId, delta, reason) => {
    try {
      const { employeeId, employeeName } = currentEmployee();
      const result = await api.recordStockMovement({
        branchId: requireBranchId(),
        inventoryItemId: itemId,
        delta,
        reason,
        employeeId,
        employeeName,
      });
      set((state) => ({
        inventoryItems: state.inventoryItems.map((i) => (i.id === itemId ? { ...i, quantity: result.quantity } : i)),
        stockMovements: [result.movement, ...state.stockMovements],
      }));
    } catch (err) {
      toast(errorMessage(err, "Failed to adjust stock"), "error");
    }
  },
  recordInventoryQualityCheck: async (input) => {
    const record = await api.createInventoryQualityCheck({ ...input, branchId: requireBranchId() });
    set((state) => ({ inventoryQualityChecks: [record, ...state.inventoryQualityChecks] }));
  },
  deletePurchase: async (purchaseId) => {
    try {
      await api.deletePurchase(purchaseId);
      set((state) => ({ purchases: state.purchases.filter((p) => p.id !== purchaseId) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to delete purchase"), "error");
    }
  },

  startShift: async (openingCash) => {
    try {
      const user = useAuthStore.getState().currentUser;
      if (!user) throw new Error("No logged-in user");
      const shift = await api.startShift({
        branchId: requireBranchId(),
        cashierId: user.id,
        cashierName: user.name,
        openingCash,
      });
      set((state) => ({ shifts: [shift, ...state.shifts.filter((s) => s.id !== shift.id)] }));
    } catch (err) {
      throw new Error(errorMessage(err, "Failed to start shift"));
    }
  },
  closeShift: async (shiftId, actualCash) => {
    const shift = await api.closeShift(shiftId, actualCash);
    set((state) => ({ shifts: state.shifts.map((s) => (s.id === shiftId ? shift : s)) }));
    return shift;
  },

  addAttendanceEmployee: async (e) => {
    try {
      const created = await api.saveAttendanceEmployee({ ...e, branchId: requireBranchId() });
      set((state) => ({ attendanceEmployees: [...state.attendanceEmployees, created] }));
    } catch (err) {
      toast(errorMessage(err, "Failed to add employee"), "error");
    }
  },
  updateAttendanceEmployee: async (id, patch) => {
    try {
      const current = get().attendanceEmployees.find((e) => e.id === id);
      const updated = await api.saveAttendanceEmployee({
        id,
        name: patch.name ?? current?.name ?? "",
        pin: patch.pin,
        isActive: patch.isActive ?? current?.isActive ?? true,
        branchId: current?.branchId ?? requireBranchId(),
        assignedShiftKey: patch.assignedShiftKey ?? current?.assignedShiftKey,
        shiftStart: patch.shiftStart ?? current?.shiftStart,
        shiftEnd: patch.shiftEnd ?? current?.shiftEnd,
        graceMinutes: patch.graceMinutes ?? current?.graceMinutes,
      });
      set((state) => ({ attendanceEmployees: state.attendanceEmployees.map((e) => (e.id === id ? updated : e)) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to update employee"), "error");
    }
  },
  deleteAttendanceEmployee: async (id) => {
    try {
      await api.deleteAttendanceEmployee(id);
      set((state) => ({ attendanceEmployees: state.attendanceEmployees.filter((e) => e.id !== id) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to delete employee"), "error");
    }
  },
  checkInAttendance: async (shiftKey, officialStart, officialEnd, employeeId, employeeName, graceMinutes) => {
    const record = await api.checkInAttendance({
      branchId: requireBranchId(),
      employeeId,
      employeeName,
      shiftKey,
      officialStart,
      officialEnd,
      graceMinutes,
    });
    set((state) => ({ attendance: [record, ...state.attendance] }));
    return record;
  },
  checkOutAttendance: async (attendanceId) => {
    const record = await api.checkOutAttendance(attendanceId);
    set((state) => ({ attendance: state.attendance.map((a) => (a.id === attendanceId ? record : a)) }));
    return record;
  },

  addOrder: async (o, branchIdOverride) => {
    const { inventoryUpdates, ...created } = await api.createOrder({ ...o, branchId: branchIdOverride ?? requireBranchId() });
    set((state) => ({
      orders: [created, ...state.orders],
      inventoryItems: state.inventoryItems.map((item) => {
        const update = inventoryUpdates.find((u) => u.id === item.id);
        return update ? { ...item, quantity: update.quantity } : item;
      }),
    }));
    return created;
  },
  voidOrder: async (id) => {
    try {
      await api.voidOrder(id);
      set((state) => ({ orders: state.orders.map((o) => (o.id === id ? { ...o, status: "voided" as const } : o)) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to void order"), "error");
    }
  },
  refundOrder: async (id) => {
    try {
      await api.refundOrder(id);
      set((state) => ({ orders: state.orders.map((o) => (o.id === id ? { ...o, status: "refunded" as const } : o)) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to refund order"), "error");
    }
  },
  fetchOrdersInRange: async (from, to) => {
    try {
      const fetched = await api.getOrdersInRange(requireBranchId(), from.toISOString(), to.toISOString());
      set((state) => {
        const existingIds = new Set(state.orders.map((o) => o.id));
        const merged = [...state.orders, ...fetched.filter((o) => !existingIds.has(o.id))];
        return { orders: merged };
      });
    } catch (err) {
      toast(errorMessage(err, "Failed to load orders for that range"), "error");
    }
  },
  fetchOrdersPage: async (opts) => {
    try {
      const { orders: fetched, hasMore } = await api.getOrdersPage(requireBranchId(), {
        fromISO: opts.from?.toISOString(),
        toISO: opts.to?.toISOString(),
        limit: opts.limit,
        offset: opts.offset,
      });
      set((state) => {
        const existingIds = new Set(state.orders.map((o) => o.id));
        const merged = [...state.orders, ...fetched.filter((o) => !existingIds.has(o.id))];
        return { orders: merged };
      });
      return hasMore;
    } catch (err) {
      toast(errorMessage(err, "Failed to load orders"), "error");
      return false;
    }
  },
  fetchOrdersForShift: async (shiftId) => {
    try {
      const fetched = await api.getOrdersForShift(requireBranchId(), shiftId);
      set((state) => {
        const existingIds = new Set(state.orders.map((o) => o.id));
        const merged = [...state.orders, ...fetched.filter((o) => !existingIds.has(o.id))];
        return { orders: merged };
      });
    } catch (err) {
      toast(errorMessage(err, "Failed to load shift orders"), "error");
    }
  },

  addExpense: async (e) => {
    try {
      const created = await api.createExpense({ ...e, branchId: requireBranchId() });
      set((state) => ({ expenses: [created, ...state.expenses] }));
    } catch (err) {
      toast(errorMessage(err, "Failed to add expense"), "error");
    }
  },
  updateExpense: async (id, patch) => {
    try {
      const updated = await api.updateExpense(id, patch);
      set((state) => ({ expenses: state.expenses.map((e) => (e.id === id ? updated : e)) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to update expense"), "error");
    }
  },
  deleteExpense: async (id) => {
    try {
      await api.deleteExpense(id);
      set((state) => ({ expenses: state.expenses.filter((e) => e.id !== id) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to delete expense"), "error");
    }
  },

  addStaff: async (s) => {
    try {
      const created = await api.saveStaff({ ...s, branchId: requireBranchId() });
      set((state) => ({ staff: [...state.staff, created] }));
    } catch (err) {
      toast(errorMessage(err, "Failed to add staff"), "error");
    }
  },
  updateStaff: async (id, patch) => {
    try {
      const current = get().staff.find((s) => s.id === id);
      const updated = await api.saveStaff({
        id,
        name: patch.name ?? current?.name ?? "",
        pin: patch.pin,
        role: patch.role ?? current?.role ?? "cashier",
        avatarColor: patch.avatarColor ?? current?.avatarColor ?? "",
        isActive: patch.isActive ?? current?.isActive ?? true,
        branchId: current?.branchId ?? requireBranchId(),
        // Falls back to whatever was already saved when this patch doesn't
        // touch permissions — otherwise an unrelated edit (renaming, PIN
        // reset) would silently wipe a previously-configured grant list.
        permissions: patch.permissions ?? current?.permissions,
      });
      set((state) => ({ staff: state.staff.map((s) => (s.id === id ? updated : s)) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to update staff"), "error");
    }
  },
  deleteStaff: async (id) => {
    try {
      await api.deleteStaff(id);
      set((state) => ({ staff: state.staff.filter((s) => s.id !== id) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to delete staff"), "error");
    }
  },

  updateSettings: async (patch) => {
    // Optimistic: Settings inputs are bound directly to store state, so
    // waiting for the round-trip before updating would make typing feel laggy.
    const previous = get().settings;
    set({ settings: { ...previous, ...patch } });
    try {
      const updated = await api.updateSettings(requireBranchId(), patch);
      set({ settings: updated });
    } catch (err) {
      set({ settings: previous });
      toast(errorMessage(err, "Failed to update settings"), "error");
    }
  },
}));
