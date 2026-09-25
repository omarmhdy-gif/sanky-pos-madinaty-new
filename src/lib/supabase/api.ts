// Thin async wrappers around supabase-js — one function per store action.
// Every function throws on error; callers (useDataStore) catch and surface a toast.

import { supabase } from "./client";
import { genId } from "@/lib/utils";
import type {
  AppData,
  Product,
  Category,
  Expense,
  Order,
  Customer,
  ShopSettings,
  LoyaltySettings,
  StaffUser,
  UserRole,
  PermissionKey,
  CartLine,
  Branch,
  InventoryItem,
  StockMovement,
  StockMovementReason,
  Purchase,
  Shift,
  Attendance,
  AttendanceEmployee,
} from "@/lib/types";
import {
  fromBranchRow,
  fromCategoryRow,
  toCategoryInsertRow,
  toCategoryPatchRow,
  fromModifierGroupRow,
  fromInventoryItemRow,
  toInventoryItemInsertRow,
  toInventoryItemPatchRow,
  fromStockMovementRow,
  fromProductRow,
  toProductInsertRow,
  toProductPatchRow,
  fromStaffPublicRow,
  fromExpenseRow,
  toExpenseInsertRow,
  toExpensePatchRow,
  fromOrderRow,
  fromCustomerRow,
  fromSettingsRow,
  toSettingsPatchRow,
  fromPurchaseRow,
  fromShiftRow,
  fromAttendanceRow,
  fromAttendanceEmployeePublicRow,
} from "./mappers";

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Cheapest possible real reachability check for Supabase itself — used by
 * the background health monitor, not for loading real data. Distinct from
 * a plain internet check: the network interface can be "up" while Supabase
 * specifically is unreachable (project paused, DNS issue, etc.), and vice
 * versa this project's actual dependency is Supabase, not the internet in
 * the abstract. */
export async function pingSupabase(timeoutMs = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const { error } = await supabase.from("branches").select("id").limit(1).abortSignal(controller.signal);
    clearTimeout(timeout);
    return !error;
  } catch {
    return false;
  }
}

export async function fetchBranches(): Promise<Branch[]> {
  const res = await supabase.from("branches").select("*").order("id");
  return unwrap(res).map(fromBranchRow);
}

// TEMPORARY diagnostic instrumentation (added while investigating the
// 2026-07 "canceling statement due to timeout" incident — root cause was
// the orders+order_lines query below, fixed by migration_2_2.sql's indexes;
// see that file for the full writeup). Safe to remove once the fix has
// been confirmed in production for a while — logs to the console only,
// never blocks or alters any query's result.
function timed<T>(label: string, promise: PromiseLike<T>): Promise<T> {
  const start = performance.now();
  return Promise.resolve(promise).then((result) => {
    console.log(`[fetchAll timing] ${label}: ${Math.round(performance.now() - start)}ms`);
    return result;
  });
}

// fetchAll() is what every login/branch-switch waits on (see
// DataBootstrap.tsx) — it must only load what the POS itself needs to
// operate: settings, staff, catalog (categories/modifier groups/products),
// inventory, and shift/expense/purchase/attendance history (already bounded
// or naturally small). Orders are deliberately NOT included here — full
// order history has no bearing on ringing up a sale, and was the exact
// query that caused the 2026-07 "canceling statement due to timeout"
// incident once one branch's history grew large (see migration_2_2.sql).
// Dashboard/Reports/Orders/ShiftDialog each fetch only the orders they
// actually need, scoped by date range or shift id, when THEY mount — see
// fetchOrdersInRange/getOrdersPage/getOrdersForShift below.
export async function fetchAll(branchId: string): Promise<AppData> {
  const [
    settingsRes,
    staffRes,
    categoriesRes,
    modifierGroupsRes,
    productsRes,
    expensesRes,
    inventoryRes,
    movementsRes,
    purchasesRes,
    shiftsRes,
    attendanceRes,
    attendanceEmployeesRes,
    customersRes,
  ] = await Promise.all([
    timed("shop_settings", supabase.from("shop_settings").select("*").eq("branch_id", branchId).single()),
    timed("staff_public", supabase.from("staff_public").select("*").eq("branch_id", branchId).order("name")),
    timed("categories", supabase.from("categories").select("*").eq("branch_id", branchId).order("sort_order")),
    timed("modifier_groups", supabase.from("modifier_groups").select("*").eq("branch_id", branchId).order("sort_order")),
    timed("products", supabase.from("products").select("*").eq("branch_id", branchId).order("sort_order")),
    timed("expenses", supabase.from("expenses").select("*").eq("branch_id", branchId).order("created_at", { ascending: false })),
    timed(
      "inventory_items",
      supabase.from("inventory_items").select("*").eq("branch_id", branchId).order("quantity", { ascending: true })
    ),
    // Embeds the referenced inventory item's name via the real foreign key
    // (stock_movements.inventory_item_id -> inventory_items.id), resolved
    // by Postgres at query time — correct even for a movement whose item
    // belongs to a different branch than the movement itself (a separate,
    // real bug in recipe syncing across branches; the item still exists,
    // this join still finds it), unlike a client-side lookup against the
    // current branch's own (branch-scoped) inventoryItems array.
    timed(
      "stock_movements",
      supabase
        .from("stock_movements")
        .select("*, inventory_items(name)")
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false })
        .limit(200)
    ),
    timed(
      "purchases",
      supabase
        .from("purchases")
        .select("*, inventory_items(name)")
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false })
        .limit(200)
    ),
    timed("shifts", supabase.from("shifts").select("*").eq("branch_id", branchId).order("started_at", { ascending: false })),
    timed(
      "attendance",
      supabase
        .from("attendance")
        .select("*")
        .eq("branch_id", branchId)
        .order("check_in_at", { ascending: false })
        .limit(200)
    ),
    timed(
  "attendance_employees_public",
  supabase.from("attendance_employees_public").select("*").eq("branch_id", branchId).order("name")
),
timed(
  "customers",
  supabase.from("customers").select("*").eq("branch_id", branchId).order("name")
),
  ]);

  return {
    settings: fromSettingsRow(unwrap(settingsRes)),
    staff: unwrap(staffRes).map(fromStaffPublicRow),
    categories: unwrap(categoriesRes).map(fromCategoryRow),
    modifierGroups: unwrap(modifierGroupsRes).map(fromModifierGroupRow),
    products: unwrap(productsRes).map(fromProductRow),
    // Always [] here — see the comment on fetchAll() above. Explicitly
    // empty (not "whatever was there before") so a branch switch can't
    // leak the previous branch's orders into the new one before any page
    // has fetched its own scoped data.
    orders: [],
    expenses: unwrap(expensesRes).map(fromExpenseRow),
    inventoryItems: unwrap(inventoryRes).map(fromInventoryItemRow),
    stockMovements: unwrap(movementsRes).map(fromStockMovementRow),
    purchases: unwrap(purchasesRes).map(fromPurchaseRow),
    shifts: unwrap(shiftsRes).map(fromShiftRow),
    attendance: unwrap(attendanceRes).map(fromAttendanceRow),
    attendanceEmployees: unwrap(attendanceEmployeesRes).map(fromAttendanceEmployeePublicRow),
    customers: unwrap(customersRes).map(fromCustomerRow),
  };
}

// ---- storage ----------------------------------------------------------------

export async function uploadImage(file: File, folder: "products" | "logos"): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${folder}/${genId(folder)}.${ext}`;
  const { error } = await supabase.storage.from("media").upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
}

// ---- products -------------------------------------------------------------

export async function createProduct(p: Omit<Product, "id" | "sortOrder">, sortOrder: number): Promise<Product> {
  const id = genId("prod");
  const row = toProductInsertRow(p, id, sortOrder);
  const res = await supabase.from("products").insert(row).select().single();
  return fromProductRow(unwrap(res));
}

export async function updateProduct(id: string, patch: Partial<Product>): Promise<Product> {
  const res = await supabase.from("products").update(toProductPatchRow(patch)).eq("id", id).select().single();
  return fromProductRow(unwrap(res));
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
// ---- customers -------------------------------------------------------------

export async function createCustomer(
  customer: Omit<Customer, "id" | "createdAt" | "loyaltyPoints" | "totalOrders" | "totalSpent">
): Promise<Customer> {
  const id = genId("cust");

  const row = {
    id,
    branch_id: customer.branchId,
    name: customer.name,
    phone: customer.phone,
    loyalty_enabled: customer.loyaltyEnabled,
    loyalty_points: 0,
    total_orders: 0,
    total_spent: 0,
  };
  

  const res = await supabase.from("customers").insert(row).select().single();
  return fromCustomerRow(unwrap(res));
}
export async function updateCustomer(
  id: string,
  patch: Partial<Customer>
): Promise<Customer> {
  const row: Record<string, unknown> = {};

  if (patch.name !== undefined) row.name = patch.name;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.loyaltyEnabled !== undefined) {
    row.loyalty_enabled = patch.loyaltyEnabled;
  }

  const res = await supabase
    .from("customers")
    .update(row)
    .eq("id", id)
    .select()
    .single();

  return fromCustomerRow(unwrap(res));
}
export async function searchCustomers(
  branchId: string,
  query: string
): Promise<Customer[]> {
  const q = query.trim();

  if (!q) return [];

  const res = await supabase
    .from("customers")
    .select("*")
    .eq("branch_id", branchId)
    .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
    .order("name")
    .limit(20);

  return unwrap(res).map(fromCustomerRow);
}

export async function refreshCustomerLoyalty(
  customerId: string
): Promise<Customer> {
  const { data: loyaltyPoints, error: loyaltyError } = await supabase.rpc(
    "sync_customer_loyalty",
    { p_customer_id: customerId }
  );

  if (loyaltyError) {
    throw new Error(loyaltyError.message);
  }

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    ...fromCustomerRow(data),
    loyaltyPoints: Number(loyaltyPoints ?? data.loyalty_points ?? 0),
  };
}
// Finds the matching-named product in another branch — used by the "Match
// Recipe With Other Branch" sync (case-insensitive on the English name).
export async function findProductByName(branchId: string, nameEn: string): Promise<Product | null> {
  const res = await supabase
    .from("products")
    .select("*")
    .eq("branch_id", branchId)
    .ilike("name->>en", nameEn)
    .maybeSingle();
  if (res.error) throw new Error(res.error.message);
  return res.data ? fromProductRow(res.data) : null;
}

// ---- categories -------------------------------------------------------------

export async function createCategory(c: Omit<Category, "id" | "sortOrder">, sortOrder: number): Promise<Category> {
  const id = genId("cat");
  const row = toCategoryInsertRow(c, id, sortOrder);
  const res = await supabase.from("categories").insert(row).select().single();
  return fromCategoryRow(unwrap(res));
}

export async function updateCategory(id: string, patch: Partial<Category>): Promise<Category> {
  const res = await supabase.from("categories").update(toCategoryPatchRow(patch)).eq("id", id).select().single();
  return fromCategoryRow(unwrap(res));
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---- inventory items --------------------------------------------------------

export async function createInventoryItem(item: Omit<InventoryItem, "id">): Promise<InventoryItem> {
  const id = genId("inv");
  const row = toInventoryItemInsertRow(item, id);
  const res = await supabase.from("inventory_items").insert(row).select().single();
  return fromInventoryItemRow(unwrap(res));
}

export async function updateInventoryItem(id: string, patch: Partial<InventoryItem>): Promise<InventoryItem> {
  const res = await supabase
    .from("inventory_items")
    .update(toInventoryItemPatchRow(patch))
    .eq("id", id)
    .select()
    .single();
  return fromInventoryItemRow(unwrap(res));
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const { error } = await supabase.from("inventory_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Increases or decreases an item's quantity and logs a stock_movements row, atomically. */
export async function recordStockMovement(input: {
  branchId: string;
  inventoryItemId: string;
  delta: number;
  reason: StockMovementReason;
  employeeId?: string;
  employeeName: string;
}): Promise<{ id: string; quantity: number; movement: StockMovement }> {
  const res = await supabase.rpc("record_stock_movement", {
    p_branch_id: input.branchId,
    p_inventory_item_id: input.inventoryItemId,
    p_delta: input.delta,
    p_reason: input.reason,
    p_employee_id: input.employeeId ?? null,
    p_employee_name: input.employeeName,
  });
  return unwrap(res) as unknown as { id: string; quantity: number; movement: StockMovement };
}

/** Receive Stock with a cost: bumps quantity, updates last/average cost, logs a stock_movements row AND a purchases row, atomically. */
export async function receivePurchase(input: {
  branchId: string;
  inventoryItemId: string;
  qty: number;
  unitCost: number;
  supplier?: string;
  employeeId?: string;
  employeeName: string;
}): Promise<{ inventoryItem: Partial<InventoryItem>; movement: StockMovement; purchase: Purchase }> {
  const res = await supabase.rpc("receive_purchase", {
    p_branch_id: input.branchId,
    p_inventory_item_id: input.inventoryItemId,
    p_qty: input.qty,
    p_unit_cost: input.unitCost,
    p_employee_id: input.employeeId ?? null,
    p_employee_name: input.employeeName,
    p_supplier: input.supplier ?? null,
  });
  return unwrap(res) as unknown as { inventoryItem: Partial<InventoryItem>; movement: StockMovement; purchase: Purchase };
}

/** Deletes a purchase — removes it from purchase history and (since Finance
 * totals are summed live from `purchases`) from Finance totals. Deliberately
 * does NOT touch inventory quantities or last purchase price. Owner-only —
 * enforced in the UI since Finance is an owner-only route. */
export async function deletePurchase(purchaseId: string): Promise<void> {
  const res = await supabase.rpc("delete_purchase", { p_purchase_id: purchaseId });
  unwrap(res);
}

// ---- expenses -------------------------------------------------------------

export async function createExpense(e: Omit<Expense, "id" | "createdAt">): Promise<Expense> {
  const id = genId("exp");
  const createdAt = new Date().toISOString();
  const row = toExpenseInsertRow(e, id, createdAt);
  const res = await supabase.from("expenses").insert(row).select().single();
  return fromExpenseRow(unwrap(res));
}

export async function updateExpense(id: string, patch: Partial<Expense>): Promise<Expense> {
  const res = await supabase.from("expenses").update(toExpensePatchRow(patch)).eq("id", id).select().single();
  return fromExpenseRow(unwrap(res));
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---- staff (routed through RPCs — see supabase/schema.sql) ---------------

export async function saveStaff(input: {
  id?: string;
  name: string;
  pin?: string;
  role: UserRole;
  avatarColor: string;
  isActive: boolean;
  branchId: string;
  // undefined = "leave/set as not configured" (falls back to the role
  // default everywhere permissions are checked); an array (including an
  // empty one) is an explicit, saved grant list.
  permissions?: PermissionKey[];
}): Promise<StaffUser> {
  const id = input.id ?? genId("user");
  const res = await supabase.rpc("save_staff", {
    p_id: id,
    p_name: input.name,
    p_pin: input.pin ?? null,
    p_role: input.role,
    p_avatar_color: input.avatarColor,
    p_is_active: input.isActive,
    p_branch_id: input.branchId,
    p_permissions: input.permissions ?? null,
  });
  return unwrap(res) as unknown as StaffUser;
}

export async function deleteStaff(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_staff", { p_id: id });
  if (error) throw new Error(error.message);
}

/** Returns the staff record (no pin) on a correct PIN, or null on mismatch. */
export async function verifyStaffPin(staffId: string, pin: string, branchId: string): Promise<StaffUser | null> {
  const { data, error } = await supabase.rpc("verify_staff_pin", {
    p_staff_id: staffId,
    p_pin: pin,
    p_branch_id: branchId,
  });
  if (error) throw new Error(error.message);
  return (data as StaffUser | null) ?? null;
}

// ---- settings -------------------------------------------------------------

export async function updateSettings(branchId: string, patch: Partial<ShopSettings>): Promise<ShopSettings> {
  const res = await supabase
    .from("shop_settings")
    .update(toSettingsPatchRow(patch))
    .eq("branch_id", branchId)
    .select()
    .single();
  return fromSettingsRow(unwrap(res));
}
// ---- loyalty ---------------------------------------------------------------

export async function fetchLoyaltySettings(
  branchId: string
): Promise<LoyaltySettings> {
  const res = await supabase
    .from("loyalty_settings")
    .select("*")
    .eq("branch_id", branchId)
    .single();

  const row = unwrap(res);

  return {
    branchId: row.branch_id,
    enabled: row.enabled,
    pointMode: row.point_mode,
    amountPerPoint: Number(row.amount_per_point),
    minimumOrderValue: Number(row.minimum_order_value),
    minimumOrders: Number(row.minimum_orders),
    pointsDelayMinutes: Number(row.points_delay_minutes),
    pointsPerReward: Number(row.points_per_reward),
    rewardAmount: Number(row.reward_amount),
    minimumRedeemOrderValue: Number(row.minimum_redeem_order_value),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function updateLoyaltySettings(
  branchId: string,
  patch: Partial<LoyaltySettings>
): Promise<LoyaltySettings> {
  const row: Record<string, unknown> = {};

  if (patch.enabled !== undefined) row.enabled = patch.enabled;
  if (patch.pointMode !== undefined) row.point_mode = patch.pointMode;
  if (patch.amountPerPoint !== undefined) row.amount_per_point = patch.amountPerPoint;
  if (patch.minimumOrderValue !== undefined) row.minimum_order_value = patch.minimumOrderValue;
  if (patch.minimumOrders !== undefined) row.minimum_orders = patch.minimumOrders;
  if (patch.pointsDelayMinutes !== undefined) row.points_delay_minutes = patch.pointsDelayMinutes;
  if (patch.pointsPerReward !== undefined) row.points_per_reward = patch.pointsPerReward;
  if (patch.rewardAmount !== undefined) row.reward_amount = patch.rewardAmount;
  if (patch.minimumRedeemOrderValue !== undefined) {
    row.minimum_redeem_order_value = patch.minimumRedeemOrderValue;
  }

  row.updated_at = new Date().toISOString();

  const res = await supabase
    .from("loyalty_settings")
    .update(row)
    .eq("branch_id", branchId)
    .select()
    .single();

  return fetchLoyaltySettings(branchId);
}
// ---- orders -----------------------------------------------------------------

export async function createOrder(
  order: Omit<Order, "id" | "orderNumber" | "lines"> & { lines: CartLine[] }
): Promise<Order & { inventoryUpdates: { id: string; quantity: number }[] }> {
  const { lines, ...orderFields } = order;
  const res = await supabase.rpc("create_order", {
    p_order: orderFields,
    p_lines: lines,
  });
  return unwrap(res) as unknown as Order & { inventoryUpdates: { id: string; quantity: number }[] };
}

export async function voidOrder(id: string): Promise<void> {
  const { error } = await supabase.from("orders").update({ status: "voided" }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function refundOrder(id: string): Promise<void> {
  const { error } = await supabase.from("orders").update({ status: "refunded" }).eq("id", id);
  if (error) throw new Error(error.message);
}

// Fetches orders directly for an arbitrary date range instead of relying on
// a full preload — used by Dashboard/Reports for whichever range their date
// filter is currently set to (every preset, not just "custom"; see those
// pages' useEffects). Those pages need every matching row to sum/count
// correctly, so this is intentionally unbounded WITHIN the given range —
// the range itself is what keeps it small (a day/week/month, or "all" as an
// explicit, owner-requested epoch-to-now call, never fired automatically at
// login).
//
// Loops in PAGE_SIZE chunks rather than one open-ended request: PostgREST
// silently caps any single response at its configured max-rows (1000 on
// this project, confirmed empirically — a branch with 4,068 orders this
// month got back exactly 1000 with no error, which would have quietly
// under-counted every Dashboard/Reports KPI for "This Month"/"All" once
// order volume crossed that line). Each chunk is still a plain indexed
// range query, so this stays fast even though it's now a handful of
// round-trips instead of one for a branch with several thousand orders.
export async function getOrdersInRange(branchId: string, fromISO: string, toISO: string): Promise<Order[]> {
  const PAGE_SIZE = 1000;
  const all: Order[] = [];
  let offset = 0;
  for (;;) {
    const res = await supabase
      .from("orders")
      .select("*, order_lines(*)")
      .eq("branch_id", branchId)
      .gte("created_at", fromISO)
      .lte("created_at", toISO)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    const rows = unwrap(res).map(fromOrderRow);
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

// One page of orders, newest first, optionally bounded by a date range —
// used by the Orders page's pagination/"Load More" so it never has to pull
// more than `limit` rows at a time regardless of total order history size.
export async function getOrdersPage(
  branchId: string,
  opts: { fromISO?: string; toISO?: string; limit: number; offset: number }
): Promise<{ orders: Order[]; hasMore: boolean }> {
  let query = supabase.from("orders").select("*, order_lines(*)").eq("branch_id", branchId);
  if (opts.fromISO) query = query.gte("created_at", opts.fromISO);
  if (opts.toISO) query = query.lte("created_at", opts.toISO);
  const res = await query
    .order("created_at", { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1);
  const rows = unwrap(res);
  return { orders: rows.map(fromOrderRow), hasMore: rows.length === opts.limit };
}

// Orders belonging to a single shift — naturally small (one till's worth of
// sales during one shift) regardless of how much total order history the
// branch has, so it's safe to fetch unbounded. Used by ShiftDialog's live
// pre-close preview and its final report.
export async function getOrdersForShift(branchId: string, shiftId: string): Promise<Order[]> {
  const res = await supabase
    .from("orders")
    .select("*, order_lines(*)")
    .eq("branch_id", branchId)
    .eq("shift_id", shiftId)
    .order("created_at", { ascending: false });
  return unwrap(res).map(fromOrderRow);
}

// ---- shifts -----------------------------------------------------------------

export async function startShift(input: {
  branchId: string;
  cashierId: string;
  cashierName: string;
  openingCash: number;
}): Promise<Shift> {
  const res = await supabase.rpc("start_shift", {
    p_branch_id: input.branchId,
    p_cashier_id: input.cashierId,
    p_cashier_name: input.cashierName,
    p_opening_cash: input.openingCash,
  });
  return unwrap(res) as unknown as Shift;
}

export async function closeShift(shiftId: string, actualCash: number): Promise<Shift> {
  const res = await supabase.rpc("close_shift", { p_shift_id: shiftId, p_actual_cash: actualCash });
  return unwrap(res) as unknown as Shift;
}

// ---- attendance -----------------------------------------------------------
// Attendance employees are a roster entirely separate from `staff` (login
// accounts) — same lockdown pattern as staff/staff_public: the raw table has
// no anon policy, reachable only via the public view + these three
// SECURITY DEFINER RPCs (verify/save/delete).

export async function saveAttendanceEmployee(input: {
  id?: string;
  name: string;
  pin?: string;
  isActive: boolean;
  branchId: string;
  assignedShiftKey?: string;
  shiftStart?: string;
  shiftEnd?: string;
  graceMinutes?: number;
}): Promise<AttendanceEmployee> {
  const id = input.id ?? genId("attnemp");
  const res = await supabase.rpc("save_attendance_employee", {
    p_id: id,
    p_name: input.name,
    p_pin: input.pin ?? null,
    p_is_active: input.isActive,
    p_branch_id: input.branchId,
    p_assigned_shift_key: input.assignedShiftKey ?? null,
    p_shift_start: input.shiftStart ?? null,
    p_shift_end: input.shiftEnd ?? null,
    p_grace_minutes: input.graceMinutes ?? 0,
  });
  return unwrap(res) as unknown as AttendanceEmployee;
}

export async function deleteAttendanceEmployee(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_attendance_employee", { p_id: id });
  if (error) throw new Error(error.message);
}

/** Returns the attendance employee record (no pin) on a correct PIN, or null on mismatch. */
export async function verifyAttendancePin(employeeId: string, pin: string, branchId: string): Promise<AttendanceEmployee | null> {
  const { data, error } = await supabase.rpc("verify_attendance_pin", {
    p_employee_id: employeeId,
    p_pin: pin,
    p_branch_id: branchId,
  });
  if (error) throw new Error(error.message);
  return (data as AttendanceEmployee | null) ?? null;
}

export async function getOpenAttendance(branchId: string, employeeId: string): Promise<Attendance | null> {
  const res = await supabase
    .from("attendance")
    .select("*")
    .eq("branch_id", branchId)
    .eq("employee_id", employeeId)
    .is("check_out_at", null)
    .order("check_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (res.error) throw new Error(res.error.message);
  return res.data ? fromAttendanceRow(res.data) : null;
}

export async function checkInAttendance(input: {
  branchId: string;
  employeeId: string;
  employeeName: string;
  shiftKey: string;
  officialStart: string;
  officialEnd: string;
  graceMinutes?: number;
}): Promise<Attendance> {
  const res = await supabase.rpc("check_in_attendance", {
    p_branch_id: input.branchId,
    p_employee_id: input.employeeId,
    p_employee_name: input.employeeName,
    p_shift_key: input.shiftKey,
    p_official_start: input.officialStart,
    p_official_end: input.officialEnd,
    p_grace_minutes: input.graceMinutes ?? 0,
  });
  return fromAttendanceRow(unwrap(res));
}

export async function checkOutAttendance(attendanceId: string): Promise<Attendance> {
  const res = await supabase.rpc("check_out_attendance", { p_attendance_id: attendanceId });
  return fromAttendanceRow(unwrap(res));
}
