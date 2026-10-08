// Row (snake_case, as returned by PostgREST) <-> domain type (camelCase, src/lib/types.ts)
// converters. Kept separate from api.ts so the query/mutation code stays readable.

import type {
  Product,
  Category,
  ModifierGroup,
  Expense,
  Order,
  Customer,
  ShopSettings,
  StaffUser,
  CartLine,
  Branch,
  InventoryItem,
  StockMovement,
  Purchase,
  Shift,
  Attendance,
  AttendanceEmployee,
} from "@/lib/types";

// ---- branches -------------------------------------------------------------

export function fromBranchRow(row: any): Branch {
  return {
    id: row.id,
    name: row.name,
  };
}

// ---- categories -------------------------------------------------------

export function fromCategoryRow(row: any): Category {
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    color: row.color,
    icon: row.icon ?? undefined,
    sortOrder: row.sort_order,
  };
}

export function toCategoryInsertRow(c: Omit<Category, "id" | "sortOrder">, id: string, sortOrder: number) {
  return {
    id,
    branch_id: c.branchId,
    name: c.name,
    color: c.color,
    icon: c.icon ?? null,
    sort_order: sortOrder,
  };
}

export function toCategoryPatchRow(patch: Partial<Category>) {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.icon !== undefined) row.icon = patch.icon;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  return row;
}

// ---- modifier groups (read-only from the app's perspective) -----------

export function fromModifierGroupRow(row: any): ModifierGroup {
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    required: row.required,
    multiSelect: row.multi_select,
    options: row.options,
  };
}

// ---- inventory items -------------------------------------------------------

export function fromInventoryItemRow(row: any): InventoryItem {
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    type: row.type,
    unit: row.unit ?? undefined,
    quantity: Number(row.quantity),
    criticalThreshold: row.critical_threshold != null ? Number(row.critical_threshold) : undefined,
    lowThreshold: row.low_threshold != null ? Number(row.low_threshold) : undefined,
    lastPurchaseCost: row.last_purchase_cost != null ? Number(row.last_purchase_cost) : undefined,
    packSize: row.pack_size != null ? Number(row.pack_size) : undefined,
  };
}

export function toInventoryItemInsertRow(
  item: Omit<InventoryItem, "id">,
  id: string
) {
  return {
    id,
    branch_id: item.branchId,
    name: item.name,
    type: item.type,
    unit: item.unit ?? null,
    quantity: item.quantity,
    critical_threshold: item.criticalThreshold ?? null,
    low_threshold: item.lowThreshold ?? null,
    pack_size: item.packSize ?? null,
  };
}

export function toInventoryItemPatchRow(patch: Partial<InventoryItem>) {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.unit !== undefined) row.unit = patch.unit;
  if (patch.criticalThreshold !== undefined) row.critical_threshold = patch.criticalThreshold;
  if (patch.lowThreshold !== undefined) row.low_threshold = patch.lowThreshold;
  if (patch.packSize !== undefined) row.pack_size = patch.packSize;
  // quantity (and cost fields) are intentionally never patched here — they
  // only change via receive_purchase (receiveStock) or record_stock_movement
  // (adjustStock), which keep every change in the stock_movements ledger.
  return row;
}

// ---- stock movements (read path only — writes go through RPCs) -----------

export function fromStockMovementRow(row: any): StockMovement {
  return {
    id: row.id,
    branchId: row.branch_id,
    inventoryItemId: row.inventory_item_id,
    // Embedded via the query's `inventory_items(name)` join (see api.ts) —
    // resolved through the real foreign key, independent of which branch
    // the referenced item actually belongs to. `inventory_items` comes
    // back as an object for a many-to-one embed; PostgREST returns it as
    // null (not omitted) if the FK ever pointed at a deleted row.
    itemName: row.inventory_items?.name ?? undefined,
    quantityDelta: Number(row.quantity_delta),
    reason: row.reason,
    employeeId: row.employee_id ?? undefined,
    employeeName: row.employee_name,
    orderId: row.order_id ?? undefined,
    createdAt: row.created_at,
  };
}

// ---- products -----------------------------------------------------------

export function fromProductRow(row: any): Product {
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    categoryId: row.category_id,
    price: Number(row.price),
    secondaryPrice: row.secondary_price != null ? Number(row.secondary_price) : undefined,
    cost: row.cost != null ? Number(row.cost) : undefined,
    sku: row.sku ?? undefined,
    barcode: row.barcode ?? undefined,
    recipeSynced: row.recipe_synced ?? undefined,
    image: row.image ?? undefined,
    color: row.color ?? undefined,
    isActive: row.is_active,
    recipe: row.recipe?.length ? row.recipe : undefined,
    modifierGroupIds: row.modifier_group_ids?.length ? row.modifier_group_ids : undefined,
    sortOrder: row.sort_order,
  };
}

export function toProductInsertRow(p: Omit<Product, "id" | "sortOrder">, id: string, sortOrder: number) {
  return {
    id,
    branch_id: p.branchId,
    name: p.name,
    category_id: p.categoryId,
    price: p.price,
    secondary_price: p.secondaryPrice ?? null,
    cost: p.cost ?? null,
    sku: p.sku ?? null,
    barcode: p.barcode ?? null,
    recipe_synced: p.recipeSynced ?? false,
    image: p.image ?? null,
    color: p.color ?? null,
    is_active: p.isActive,
    recipe: p.recipe ?? [],
    modifier_group_ids: p.modifierGroupIds ?? [],
    sort_order: sortOrder,
  };
}

export function toProductPatchRow(patch: Partial<Product>) {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.categoryId !== undefined) row.category_id = patch.categoryId;
  if (patch.price !== undefined) row.price = patch.price;
  if (patch.secondaryPrice !== undefined) row.secondary_price = patch.secondaryPrice;
  if (patch.cost !== undefined) row.cost = patch.cost;
  if (patch.sku !== undefined) row.sku = patch.sku;
  if (patch.barcode !== undefined) row.barcode = patch.barcode;
  if (patch.recipeSynced !== undefined) row.recipe_synced = patch.recipeSynced;
  if (patch.image !== undefined) row.image = patch.image;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.recipe !== undefined) row.recipe = patch.recipe;
  if (patch.modifierGroupIds !== undefined) row.modifier_group_ids = patch.modifierGroupIds;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  return row;
}

// ---- staff --------------------------------------------------------------

export function fromStaffPublicRow(row: any): StaffUser {
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    role: row.role,
    avatarColor: row.avatar_color,
    isActive: row.is_active,
    permissions: row.permissions ?? undefined,
  };
}

// ---- expenses -------------------------------------------------------------

export function fromExpenseRow(row: any): Expense {
  return {
    id: row.id,
    branchId: row.branch_id,
    title: row.title,
    category: row.category,
    amount: Number(row.amount),
    note: row.note ?? undefined,
    createdAt: row.created_at,
    createdBy: row.created_by ?? "",
  };
}

export function toExpenseInsertRow(e: Omit<Expense, "id" | "createdAt">, id: string, createdAt: string) {
  return {
    id,
    branch_id: e.branchId,
    title: e.title,
    category: e.category,
    amount: e.amount,
    note: e.note ?? null,
    created_at: createdAt,
    created_by: e.createdBy,
  };
}

export function toExpensePatchRow(patch: Partial<Expense>) {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.amount !== undefined) row.amount = patch.amount;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.createdBy !== undefined) row.created_by = patch.createdBy;
  return row;
}

// ---- orders (read path only — writes go through the create_order RPC) ---

function fromOrderLineRow(row: any): CartLine {
  return {
    lineId: row.id,
    productId: row.product_id,
    name: row.name,
    unitPrice: Number(row.unit_price),
    qty: row.qty,
    modifiers: row.modifiers ?? [],
    note: row.note ?? undefined,
  };
}

export function fromOrderRow(row: any): Order {
  return {
    id: row.id,
    branchId: row.branch_id,
    orderNumber: row.order_number,
    shiftId: row.shift_id ?? undefined,
    lines: (row.order_lines ?? []).map(fromOrderLineRow),
    subtotal: Number(row.subtotal),
    discountAmount: Number(row.discount_amount),
    discountPercent: row.discount_percent != null ? Number(row.discount_percent) : undefined,
    promoCode: row.promo_code ?? undefined,
    taxAmount: Number(row.tax_amount),
    taxRate: Number(row.tax_rate),
    total: Number(row.total),
    payment: row.payment,
    status: row.status,
    type: row.type,
    tableNumber: row.table_number ?? undefined,
    customerName: row.customer_name ?? undefined,
    customerId: row.customer_id ?? undefined,
    cashierId: row.cashier_id,
    cashierName: row.cashier_name,
    createdAt: row.created_at,
    wasteReason: row.waste_reason ?? undefined,
  };
}
export function fromCustomerRow(row: any): Customer {
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    phone: row.phone,
    loyaltyEnabled: row.loyalty_enabled,
    loyaltyPoints: Number(row.loyalty_points),
    totalOrders: Number(row.total_orders),
    totalSpent: Number(row.total_spent),
    createdAt: row.created_at,
  };
}

// ---- settings -------------------------------------------------------------

export function fromSettingsRow(row: any): ShopSettings {
  return {
    shopName: row.shop_name,
    logo: row.logo ?? undefined,
    currency: row.currency,
    currencySymbol: row.currency_symbol,
    taxRate: Number(row.tax_rate),
    taxEnabled: row.tax_enabled,
    locale: row.locale,
    theme: row.theme,
    receiptFooter: row.receipt_footer ?? undefined,
    address: row.address ?? undefined,
    phone: row.phone ?? undefined,
    shiftTemplates: row.shift_templates ?? undefined,
    multiPricing: row.multi_pricing ?? undefined,
    externalPaymentName: row.external_payment_name ?? undefined,
    externalPaymentIcon: row.external_payment_icon ?? undefined,
    externalPaymentMethods: row.external_payment_methods ?? undefined,
  };
}

export function toSettingsPatchRow(patch: Partial<ShopSettings>) {
  const row: Record<string, unknown> = {};
  if (patch.shopName !== undefined) row.shop_name = patch.shopName;
  if (patch.logo !== undefined) row.logo = patch.logo;
  if (patch.currency !== undefined) row.currency = patch.currency;
  if (patch.currencySymbol !== undefined) row.currency_symbol = patch.currencySymbol;
  if (patch.taxRate !== undefined) row.tax_rate = patch.taxRate;
  if (patch.taxEnabled !== undefined) row.tax_enabled = patch.taxEnabled;
  if (patch.locale !== undefined) row.locale = patch.locale;
  if (patch.theme !== undefined) row.theme = patch.theme;
  if (patch.receiptFooter !== undefined) row.receipt_footer = patch.receiptFooter;
  if (patch.address !== undefined) row.address = patch.address;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.shiftTemplates !== undefined) row.shift_templates = patch.shiftTemplates;
  if (patch.multiPricing !== undefined) row.multi_pricing = patch.multiPricing;
  if (patch.externalPaymentName !== undefined) row.external_payment_name = patch.externalPaymentName;
  if (patch.externalPaymentIcon !== undefined) row.external_payment_icon = patch.externalPaymentIcon;
  if (patch.externalPaymentMethods !== undefined) row.external_payment_methods = patch.externalPaymentMethods;
  return row;
}

// ---- purchases (read-only — writes go through the receive_purchase RPC) --

export function fromPurchaseRow(row: any): Purchase {
  return {
    id: row.id,
    branchId: row.branch_id,
    inventoryItemId: row.inventory_item_id,
    itemName: row.inventory_items?.name ?? undefined,
    quantity: Number(row.quantity),
    unitCost: Number(row.unit_cost),
    totalCost: Number(row.total_cost),
    supplier: row.supplier ?? undefined,
    employeeId: row.employee_id ?? undefined,
    employeeName: row.employee_name,
    createdAt: row.created_at,
  };
}

// ---- shifts (read path only — writes go through start_shift/close_shift) -

export function fromShiftRow(row: any): Shift {
  return {
    id: row.id,
    branchId: row.branch_id,
    cashierId: row.cashier_id,
    cashierName: row.cashier_name,
    openingCash: Number(row.opening_cash),
    status: row.status,
    startedAt: row.started_at,
    closedAt: row.closed_at ?? undefined,
    actualCash: row.actual_cash != null ? Number(row.actual_cash) : undefined,
    cashSales: row.cash_sales != null ? Number(row.cash_sales) : undefined,
    cardSales: row.card_sales != null ? Number(row.card_sales) : undefined,
    expensesTotal: row.expenses_total != null ? Number(row.expenses_total) : undefined,
    ordersCount: row.orders_count ?? undefined,
    talabatOrdersCount: row.talabat_orders_count ?? undefined,
    talabatRevenue: row.talabat_revenue != null ? Number(row.talabat_revenue) : undefined,
    expectedCash: row.expected_cash != null ? Number(row.expected_cash) : undefined,
    difference: row.difference != null ? Number(row.difference) : undefined,
  };
}

// ---- attendance (read path — writes go through check_in/check_out_attendance) --

export function fromAttendanceRow(row: any): Attendance {
  return {
    id: row.id,
    branchId: row.branch_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    shiftKey: row.shift_key,
    officialStart: row.official_start,
    officialEnd: row.official_end,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at ?? undefined,
    lateMinutes: Number(row.late_minutes ?? 0),
    workedMinutes: row.worked_minutes != null ? Number(row.worked_minutes) : undefined,
    overtimeMinutes: row.overtime_minutes != null ? Number(row.overtime_minutes) : undefined,
  };
}

// ---- attendance employees (read path via public view — writes go through
// verify/save/delete_attendance_employee, mirroring staff/staff_public) -----

export function fromAttendanceEmployeePublicRow(row: any): AttendanceEmployee {
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    isActive: row.is_active,
    assignedShiftKey: row.assigned_shift_key ?? undefined,
    shiftStart: row.shift_start ?? undefined,
    shiftEnd: row.shift_end ?? undefined,
    graceMinutes: row.grace_minutes != null ? Number(row.grace_minutes) : undefined,
  };
}
