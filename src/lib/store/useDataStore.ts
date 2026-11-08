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
import { cacheShopLogo } from "@/lib/store/shopLogoCache";
import { loadPosSnapshot, savePosSnapshot } from "@/lib/store/offlineSnapshot";
import { hasPermission, NEW_EMPLOYEE_DEFAULT_PERMISSIONS } from "@/lib/permissions";
import { DEFAULT_ORDER_CANCELLATION_SETTINGS } from "@/lib/orderCancellation";

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
  fetchAll: () => Promise<boolean>;
  refreshSettings: () => Promise<boolean>;

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
  updateInventoryItem: (id: string, patch: Partial<InventoryItem>) => Promise<boolean>;
  deleteInventoryItem: (id: string) => Promise<void>;
  receiveStock: (itemId: string, qty: number, unitCost: number, supplier?: string) => Promise<boolean>;
  manufactureInventoryItem: (itemId: string, qty: number) => Promise<boolean>;
  setOpeningBalance: (itemId: string, purchaseQty: number, purchaseUnitCost: number) => Promise<boolean>;
  adjustStock: (itemId: string, delta: number, reason: "waste" | "stock_count") => Promise<boolean>;
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
  recordDraftCancellation: (o: Omit<Order, "id" | "orderNumber" | "branchId">, approvalPin?: string) => Promise<Order>;
  refundOrder: (id: string) => Promise<boolean>;
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
  addStaff: (s: { name: string; pin: string; role: UserRole; avatarColor: string; isActive: boolean; permissions?: PermissionKey[]; email?: string; password?: string }) => Promise<boolean>;
  updateStaff: (id: string, patch: Partial<StaffUser> & { pin?: string; password?: string }) => Promise<boolean>;
  deleteStaff: (id: string) => Promise<void>;
  // Settings
  updateSettings: (patch: Partial<ShopSettings>) => Promise<boolean>;
}

const EMPTY_SETTINGS: ShopSettings = {
  shopName: "",
  currency: "",
  currencySymbol: "",
  taxRate: 0,
  taxEnabled: false,
  locale: "en",
  theme: "light",
  orderCancellation: DEFAULT_ORDER_CANCELLATION_SETTINGS,
};

export const useDataStore = create<DataStore>()((set, get) => {
  const canPerform = (permission: PermissionKey): boolean => {
    if (hasPermission(useAuthStore.getState().currentUser, permission)) return true;
    toast(get().settings.locale === "ar" ? "ليس لديك صلاحية لتنفيذ هذا الإجراء." : "You do not have permission to perform this action.", "error");
    return false;
  };

  const canPerformAny = (permissions: PermissionKey[]): boolean => {
    if (permissions.some((permission) => hasPermission(useAuthStore.getState().currentUser, permission))) return true;
    toast(get().settings.locale === "ar" ? "ليس لديك صلاحية لتنفيذ هذا الإجراء." : "You do not have permission to perform this action.", "error");
    return false;
  };

  const canGrantPermissions = (permissions: PermissionKey[] | undefined, allowNewEmployeeDefault = false): boolean => {
    if (permissions === undefined) return true;
    const actor = useAuthStore.getState().currentUser;
    if (!actor || actor.role === "owner") return true;
    if (hasPermission(actor, "employees.manage_permissions")) {
      // Managers may only grant capabilities they already hold. Legacy bare
      // module grants expand at runtime, but may not be newly assigned.
      const safe = permissions.every((permission) => permission.includes(".") && hasPermission(actor, permission));
      if (safe) return true;
    } else if (allowNewEmployeeDefault && permissions.length === NEW_EMPLOYEE_DEFAULT_PERMISSIONS.length && NEW_EMPLOYEE_DEFAULT_PERMISSIONS.every((permission) => permissions.includes(permission))) {
      // Employee creators who cannot manage permissions may only use the
      // fixed least-privilege defaults for a new account.
      return true;
    }
    toast(get().settings.locale === "ar" ? "لا يمكنك منح صلاحية لا تملكها." : "You cannot grant a permission you do not have.", "error");
    return false;
  };

  return ({
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

  refreshSettings: async () => {
    const branchId = useBranchStore.getState().currentBranchId;
    if (!branchId || (typeof navigator !== "undefined" && !navigator.onLine)) return false;
    try {
      const settings = await api.fetchSettings(branchId);
      set({ settings });
      cacheShopLogo(branchId, settings.logo);
      const current = get();
      try {
        await savePosSnapshot(branchId, {
          settings,
          staff: current.staff,
          categories: current.categories,
          products: current.products,
          modifierGroups: current.modifierGroups,
          orders: current.orders,
          customers: current.customers,
          expenses: current.expenses,
          inventoryItems: current.inventoryItems,
          inventoryQualityChecks: current.inventoryQualityChecks,
          stockMovements: current.stockMovements,
          purchases: current.purchases,
          shifts: current.shifts,
          attendance: current.attendance,
          attendanceEmployees: current.attendanceEmployees,
        });
      } catch (err) {
        console.warn("Could not refresh the local POS snapshot after settings sync:", err);
      }
      return true;
    } catch (err) {
      console.warn("Could not refresh shared POS settings:", err);
      return false;
    }
  },

  fetchAll: async () => {
    const branchId = useBranchStore.getState().currentBranchId;
    if (!branchId) return false;
    set({ loading: true });
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("No internet connection; loading saved POS data.");
      const data = await api.fetchAll(branchId);
      set({ ...data, loading: false, loaded: true });
      cacheShopLogo(branchId, data.settings.logo);
      try {
        await savePosSnapshot(branchId, data);
      } catch (err) {
        console.warn("Could not refresh the local POS snapshot:", err);
      }
      return true;
    } catch (err) {
      try {
        const snapshot = await loadPosSnapshot(branchId);
        if (snapshot) {
          set({ ...snapshot.data, loading: false, loaded: true });
          cacheShopLogo(branchId, snapshot.data.settings.logo);
          return false;
        }
      } catch (cacheError) {
        console.warn("Could not load the local POS snapshot:", cacheError);
      }
      set({ loading: false });
      toast(errorMessage(err, "Failed to load data from Supabase"), "error");
      return false;
    }
  },

  addProduct: async (p) => {
    if (!canPerform("products.create") || (p.recipe?.length && !canPerform("products.manage_recipe"))) return;
    try {
      const created = await api.createProduct({ ...p, branchId: requireBranchId() }, get().products.length);
      set((state) => ({ products: [...state.products, created] }));
      syncRecipeAcrossBranches(created);
    } catch (err) {
      toast(errorMessage(err, "Failed to add product"), "error");
    }
  },
  updateProduct: async (id, patch) => {
    if (!canPerform("products.edit") || (patch.recipe !== undefined && !canPerform("products.manage_recipe"))) return false;
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
    if (!canPerform("products.manage_recipe")) return;
    const updated = await api.updateProduct(id, { recipe });
    set((state) => ({ products: state.products.map((product) => (product.id === id ? updated : product)) }));
    syncRecipeAcrossBranches(updated);
  },
  deleteProduct: async (id) => {
    if (!canPerform("products.delete")) return;
    try {
      await api.deleteProduct(id);
      set((state) => ({ products: state.products.filter((p) => p.id !== id) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to delete product"), "error");
    }
  },

  addCategory: async (c) => {
    if (!canPerform("products.create")) return;
    try {
      const created = await api.createCategory({ ...c, branchId: requireBranchId() }, get().categories.length);
      set((state) => ({ categories: [...state.categories, created] }));
    } catch (err) {
      toast(errorMessage(err, "Failed to add category"), "error");
    }
  },
  updateCategory: async (id, patch) => {
    if (!canPerform("products.edit")) return;
    try {
      const updated = await api.updateCategory(id, patch);
      set((state) => ({ categories: state.categories.map((c) => (c.id === id ? updated : c)) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to update category"), "error");
    }
  },
  deleteCategory: async (id) => {
    if (!canPerform("products.delete")) return;
    try {
      await api.deleteCategory(id);
      set((state) => ({ categories: state.categories.filter((c) => c.id !== id) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to delete category"), "error");
    }
  },

  addInventoryItem: async (item) => {
    if (!canPerform("inventory.create")) return undefined;
    try {
      const created = await api.createInventoryItem({ ...item, branchId: requireBranchId() });
      set((state) => ({ inventoryItems: [...state.inventoryItems, created].sort((a, b) => a.quantity - b.quantity) }));
      return created;
    } catch (err) {
      const message = errorMessage(err, "Failed to add inventory item");
      toast(/purchase_unit|conversion_factor|schema cache|does not exist/i.test(message)
        ? "قاعدة البيانات تحتاج إلى تفعيل وحدات الشراء قبل إضافة المادة."
        : message, "error");
      return undefined;
    }
  },
  updateInventoryItem: async (id, patch) => {
    if (!canPerform("inventory.edit")) return false;
    try {
      const updated = await api.updateInventoryItem(id, patch);
      set((state) => ({ inventoryItems: state.inventoryItems.map((i) => (i.id === id ? updated : i)) }));
      return true;
    } catch (err) {
      const message = errorMessage(err, "Failed to update inventory item");
      toast(/purchase_unit|conversion_factor|schema cache|does not exist/i.test(message)
        ? "قاعدة البيانات تحتاج إلى تفعيل وحدات الشراء قبل تعديل المادة."
        : message, "error");
      return false;
    }
  },
  deleteInventoryItem: async (id) => {
    if (!canPerform("inventory.delete")) return;
    try {
      await api.deleteInventoryItem(id);
      set((state) => ({ inventoryItems: state.inventoryItems.filter((i) => i.id !== id) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to delete inventory item"), "error");
    }
  },
  receiveStock: async (itemId, qty, unitCost, supplier) => {
    if (!canPerformAny(["inventory.receive", "purchases.create"])) return false;
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
      return true;
    } catch (err) {
      toast(errorMessage(err, "Failed to receive stock"), "error");
      return false;
    }
  },
  manufactureInventoryItem: async (itemId, qty) => {
    if (!canPerform("inventory.manufacture")) return false;
    try {
      const { employeeId, employeeName } = currentEmployee();
      const result = await api.manufactureInventoryItem({
        branchId: requireBranchId(),
        inventoryItemId: itemId,
        quantity: qty,
        employeeId,
        employeeName,
      });
      set((state) => ({
        inventoryItems: state.inventoryItems.map((item) => {
          const update = result.inventoryUpdates.find((entry) => entry.id === item.id);
          return update ? { ...item, quantity: update.quantity } : item;
        }),
        stockMovements: [...result.stockMovementUpdates, ...state.stockMovements.filter((movement) => !result.stockMovementUpdates.some((added) => added.id === movement.id))],
      }));
      return true;
    } catch (err) {
      toast(errorMessage(err, "Failed to manufacture inventory item"), "error");
      return false;
    }
  },
  setOpeningBalance: async (itemId, purchaseQty, purchaseUnitCost) => {
    if (!canPerform("inventory.receive")) return false;
    try {
      const { employeeId, employeeName } = currentEmployee();
      const result = await api.setInventoryOpeningBalance({
        branchId: requireBranchId(), inventoryItemId: itemId, purchaseQty, purchaseUnitCost, employeeId, employeeName,
      });
      set((state) => ({
        inventoryItems: state.inventoryItems.map((item) => item.id === itemId ? { ...item, quantity: Number(result.quantity), lastPurchaseCost: Number(result.lastPurchaseCost) } : item),
        stockMovements: [result.movement, ...state.stockMovements],
      }));
      return true;
    } catch (err) {
      toast(errorMessage(err, "Failed to update opening balance"), "error");
      return false;
    }
  },
  adjustStock: async (itemId, delta, reason) => {
    if (!canPerform("inventory.adjust")) return false;
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
      return true;
    } catch (err) {
      toast(errorMessage(err, "Failed to adjust stock"), "error");
      return false;
    }
  },
  recordInventoryQualityCheck: async (input) => {
    if (!canPerform("inventory.quality")) return;
    const record = await api.createInventoryQualityCheck({ ...input, branchId: requireBranchId() });
    set((state) => ({ inventoryQualityChecks: [record, ...state.inventoryQualityChecks] }));
  },
  deletePurchase: async (purchaseId) => {
    if (!canPerform("purchases.delete")) return;
    try {
      await api.deletePurchase(purchaseId);
      set((state) => ({ purchases: state.purchases.filter((p) => p.id !== purchaseId) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to delete purchase"), "error");
    }
  },

  startShift: async (openingCash) => {
    if (!canPerform("pos.manage_shifts")) throw new Error("Permission denied");
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
    if (!canPerform("pos.manage_shifts")) throw new Error("Permission denied");
    const shift = await api.closeShift(shiftId, actualCash);
    set((state) => ({ shifts: state.shifts.map((s) => (s.id === shiftId ? shift : s)) }));
    return shift;
  },

  addAttendanceEmployee: async (e) => {
    if (!canPerform("attendance.create")) return;
    try {
      const created = await api.saveAttendanceEmployee({ ...e, branchId: requireBranchId() });
      set((state) => ({ attendanceEmployees: [...state.attendanceEmployees, created] }));
    } catch (err) {
      toast(errorMessage(err, "Failed to add employee"), "error");
    }
  },
  updateAttendanceEmployee: async (id, patch) => {
    if (!canPerform("attendance.edit")) return;
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
    if (!canPerform("attendance.delete")) return;
    try {
      await api.deleteAttendanceEmployee(id);
      set((state) => ({ attendanceEmployees: state.attendanceEmployees.filter((e) => e.id !== id) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to delete employee"), "error");
    }
  },
  checkInAttendance: async (shiftKey, officialStart, officialEnd, employeeId, employeeName, graceMinutes) => {
    if (!canPerform("attendance.clock_in")) throw new Error("Permission denied");
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
    if (!canPerform("attendance.clock_out")) throw new Error("Permission denied");
    const record = await api.checkOutAttendance(attendanceId);
    set((state) => ({ attendance: state.attendance.map((a) => (a.id === attendanceId ? record : a)) }));
    return record;
  },

  addOrder: async (o, branchIdOverride) => {
    if (!canPerform("pos.sell")) throw new Error("Permission denied");
    if ((o.discountAmount > 0 || (o.discountPercent ?? 0) > 0) && !canPerform("pos.apply_discount")) throw new Error("Permission denied");
    const { inventoryUpdates, stockMovementUpdates, ...created } = await api.createOrder({ ...o, branchId: branchIdOverride ?? requireBranchId() });
    set((state) => ({
      orders: [created, ...state.orders],
      inventoryItems: state.inventoryItems.map((item) => {
        const update = inventoryUpdates.find((u) => u.id === item.id);
        return update ? { ...item, quantity: update.quantity } : item;
      }),
      stockMovements: [...stockMovementUpdates, ...state.stockMovements.filter((movement) => !stockMovementUpdates.some((added) => added.id === movement.id))],
    }));
    return created;
  },
  recordDraftCancellation: async (o, approvalPin) => {
    const created = await api.recordDraftCancellation({ ...o, branchId: requireBranchId() }, approvalPin);
    set((state) => ({ orders: [created, ...state.orders.filter((order) => order.id !== created.id)] }));
    return created;
  },
  refundOrder: async (id) => {
    if (!canPerform("orders.refund")) return false;
    const order = get().orders.find((item) => item.id === id);
    if (!order || order.status !== "completed" || order.payment.method === "waste") {
      toast(get().settings.locale === "ar"
        ? "لا يمكن استرجاع الطلب إلا إذا كان مدفوعًا ومكتملًا."
        : "Only a paid, completed order can be refunded.", "error");
      return false;
    }
    try {
      await api.refundOrder(id, order.branchId);
      set((state) => ({ orders: state.orders.map((o) => (o.id === id ? { ...o, status: "refunded" as const } : o)) }));
      return true;
    } catch (err) {
      toast(errorMessage(err, "Failed to refund order"), "error");
      return false;
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
    if (!canPerform("finance.create")) return;
    try {
      const created = await api.createExpense({ ...e, branchId: requireBranchId() });
      set((state) => ({ expenses: [created, ...state.expenses] }));
    } catch (err) {
      toast(errorMessage(err, "Failed to add expense"), "error");
    }
  },
  updateExpense: async (id, patch) => {
    if (!canPerform("finance.edit")) return;
    try {
      const updated = await api.updateExpense(id, patch);
      set((state) => ({ expenses: state.expenses.map((e) => (e.id === id ? updated : e)) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to update expense"), "error");
    }
  },
  deleteExpense: async (id) => {
    if (!canPerform("finance.delete")) return;
    try {
      await api.deleteExpense(id);
      set((state) => ({ expenses: state.expenses.filter((e) => e.id !== id) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to delete expense"), "error");
    }
  },

  addStaff: async (s) => {
    if (!canPerform("employees.create") || !canGrantPermissions(s.permissions, true)) return false;
    try {
      const branchId = requireBranchId();
      const created = s.email || s.password
        ? await api.saveEmployeeConsoleAccount({ ...s, permissions: s.permissions ?? [], branchId })
        : await api.saveStaff({ ...s, branchId });
      set((state) => ({ staff: [...state.staff, created] }));
      return true;
    } catch (err) {
      toast(errorMessage(err, "Failed to add staff"), "error");
      return false;
    }
  },
  updateStaff: async (id, patch) => {
    if (!canPerform("employees.edit") || !canGrantPermissions(patch.permissions)) return false;
    const actor = useAuthStore.getState().currentUser;
    if (patch.permissions !== undefined && actor?.id === id && actor.role !== "owner") {
      toast(get().settings.locale === "ar" ? "لا يمكنك تغيير صلاحيات حسابك بنفسك." : "You cannot change your own permissions.", "error");
      return false;
    }
    try {
      const current = get().staff.find((s) => s.id === id);
      const payload = {
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
      };
      const updated = current?.hasConsoleLogin || patch.email || patch.password
        ? await api.saveEmployeeConsoleAccount({
            ...payload,
            permissions: payload.permissions ?? [],
            email: patch.email,
            password: patch.password,
          })
        : await api.saveStaff(payload);
      set((state) => ({ staff: state.staff.map((s) => (s.id === id ? updated : s)) }));
      return true;
    } catch (err) {
      toast(errorMessage(err, "Failed to update staff"), "error");
      return false;
    }
  },
  deleteStaff: async (id) => {
    if (!canPerform("employees.delete")) return;
    if (get().staff.find((staffMember) => staffMember.id === id)?.role === "owner") return;
    try {
      await api.deleteStaff(id);
      set((state) => ({ staff: state.staff.filter((s) => s.id !== id) }));
    } catch (err) {
      toast(errorMessage(err, "Failed to delete staff"), "error");
    }
  },

  updateSettings: async (patch) => {
    const requiredPermissions = new Set<PermissionKey>();
    for (const key of Object.keys(patch) as (keyof ShopSettings)[]) {
      if (key === "diningLayout") {
        const currentLayout = get().settings.diningLayout;
        const nextLayout = patch.diningLayout;
        const currentMap = JSON.stringify({ sections: currentLayout?.sections, tables: currentLayout?.tables });
        const nextMap = JSON.stringify({ sections: nextLayout?.sections, tables: nextLayout?.tables });
        requiredPermissions.add(currentMap === nextMap ? "pos.sell" : "settings.edit_dining");
      } else if (key === "receiptFooter" || key === "address" || key === "phone") requiredPermissions.add("settings.edit_receipt");
      else if (key === "externalPaymentMethods" || key === "externalPaymentName" || key === "externalPaymentIcon") requiredPermissions.add("settings.edit_payments");
      else if (key === "shiftTemplates") requiredPermissions.add("settings.edit_shifts");
      else requiredPermissions.add("settings.edit_general");
    }
    for (const permission of requiredPermissions) if (!canPerform(permission)) return false;
    // Optimistic: Settings inputs are bound directly to store state, so
    // waiting for the round-trip before updating would make typing feel laggy.
    const previous = get().settings;
    set({ settings: { ...previous, ...patch } });
    try {
      const updated = await api.updateSettings(requireBranchId(), patch);
      set({ settings: updated });
      if (Object.prototype.hasOwnProperty.call(patch, "logo")) {
        cacheShopLogo(requireBranchId(), updated.logo);
      }
      return true;
    } catch (err) {
      set({ settings: previous });
      toast(errorMessage(err, "Failed to update settings"), "error");
      return false;
    }
  },
  });
});
