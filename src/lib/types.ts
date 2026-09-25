// ============================================================================
// Sanky POS — Core Domain Types
// Shared contract between the frontend and the Supabase-backed API layer
// (src/lib/supabase/api.ts + mappers.ts). Field names are kept 1:1 with the
// Postgres schema (supabase/schema.sql) wherever practical.
// ============================================================================

export type Locale = "en" | "ar";
export type Theme = "light" | "dark";

export interface Modifier {
  id: string;
  name: { en: string; ar: string };
  priceDelta: number; // added to base price
}

export interface ModifierGroup {
  id: string;
  branchId: string;
  name: { en: string; ar: string };
  required: boolean;
  multiSelect: boolean;
  options: Modifier[];
}

export interface Category {
  id: string;
  branchId: string;
  name: { en: string; ar: string };
  color: string; // tailwind color token e.g. "espresso"
  icon?: string; // lucide icon name
  sortOrder: number;
}

export interface RecipeIngredient {
  inventoryItemId: string;
  qty: number; // in the inventory item's own unit (no cross-unit conversion)
}

export interface Product {
  id: string;
  branchId: string;
  name: { en: string; ar: string };
  categoryId: string;
  price: number;
  /** Multi Pricing's alternate price level (see ShopSettings.multiPricing) —
   * undefined means this product has no secondary price set, so the
   * "Second Price" cart action skips it and leaves the primary price. */
  secondaryPrice?: number;
  cost?: number;
  sku?: string;
  barcode?: string;
  recipeSynced?: boolean; // "Match Recipe With Other Branch" — owner-only
  image?: string; // emoji or url
  color?: string;
  isActive: boolean;
  recipe?: RecipeIngredient[];
  modifierGroupIds?: string[];
  sortOrder: number;
}

export interface CartLineModifier {
  groupId: string;
  optionId: string;
  name: { en: string; ar: string };
  priceDelta: number;
}

export interface CartLine {
  lineId: string;
  productId: string;
  name: { en: string; ar: string };
  unitPrice: number;
  qty: number;
  modifiers: CartLineModifier[];
  note?: string;
}

// "talabat" is external marketplace revenue, not a real till payment — an
// order paid this way still deducts inventory/prints/appears in Orders
// exactly like any other, but is deliberately excluded from every POS
// revenue/cash figure (Dashboard, Reports KPIs, Shift totals, cash
// reconciliation) and tracked in its own separate section instead. See
// lib/analytics.ts's posOrders()/talabatOrders().
// "waste" represents discarded product, not revenue at all — no payment is
// collected (see Order.wasteReason, mandatory when this method is used). It
// still deducts inventory/recipes exactly like a normal sale, but is
// excluded from every POS revenue/cash figure the same way Talabat is, and
// reported separately in its own Waste Report. See analytics.ts's
// posOrders()/wasteOrders()/wasteSummary().
export type PaymentMethod = "cash" | "card" | "wallet" | "split" | "talabat" | "waste";
export type OrderStatus = "completed" | "refunded" | "voided" | "held";
export type OrderType = "takeaway";

export interface SplitPaymentPart {
  method: "cash" | "card" | "wallet";
  amount: number;
}

export interface OrderPayment {
  method: PaymentMethod;
  amount: number;
  tenderedAmount?: number; // for cash
  changeDue?: number;
  splitParts?: SplitPaymentPart[];
}
export interface Customer {
  id: string;
  branchId: string;
  name: string;
  phone: string;
  loyaltyEnabled: boolean;
  loyaltyPoints: number;
  totalOrders: number;
  totalSpent: number;
  createdAt: string;
}
export type LoyaltyPointMode = "order_value" | "products";

export interface LoyaltySettings {
  branchId: string;
  enabled: boolean;
  pointMode: LoyaltyPointMode;
  amountPerPoint: number;
  minimumOrderValue: number;
  minimumOrders: number;
  pointsDelayMinutes: number;
  pointsPerReward: number;
  rewardAmount: number;
  minimumRedeemOrderValue: number;
  createdAt: string;
  updatedAt: string;
}

export interface LoyaltyProductPoints {
  id: string;
  branchId: string;
  productId: string;
  points: number;
  createdAt: string;
}
export interface Order {
  
  id: string;
  branchId: string;
  orderNumber: number;
  shiftId?: string;
  lines: CartLine[];
  subtotal: number;
  discountAmount: number;
  discountPercent?: number;
  taxAmount: number;
  taxRate: number;
  total: number;
  payment: OrderPayment;
  status: OrderStatus;
  type: OrderType;
  tableNumber?: string;
  customerName?: string;
  customerId?: string;
  cashierId: string;
  cashierName: string;
  createdAt: string; // ISO
  /** Mandatory when payment.method === "waste" — why this order's items were
   * discarded. Unused/undefined for every other payment method. */
  wasteReason?: string;
}

export type ExpenseCategory =
  | "electricity"
  | "gas"
  | "internet"
  | "maintenance"
  | "cleaning"
  | "transport"
  | "miscellaneous";

export interface Expense {
  id: string;
  branchId: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  note?: string;
  createdAt: string;
  createdBy: string;
}

export type UserRole = "owner" | "cashier";

// Granular, independently-grantable page access — see lib/permissions.ts
// for the single source of truth on how these gate the sidebar/routes.
// "recipes" and "devices" are deliberately NOT here: those two pages stay
// hard-locked to the owner role regardless of any permission grant.
export type PermissionKey =
  | "pos"
  | "orders"
  | "inventory"
  | "purchases"
  | "products"
  | "finance"
  | "reports"
  | "attendance"
  | "employees"
  | "settings"
  | "dashboard";

export interface StaffUser {
  id: string;
  branchId: string;
  name: string;
  role: UserRole;
  avatarColor: string;
  isActive: boolean;
  /** undefined/null = "not configured yet" — falls back to this user's
   * role-based default (see lib/permissions.ts's ROLE_DEFAULT_PERMISSIONS),
   * which is exactly what they could already access before this system
   * existed. Owner ignores this entirely (always has every permission). */
  permissions?: PermissionKey[];
}

export interface Branch {
  id: string;
  name: { en: string; ar: string };
}

export type InventoryItemType = "piece" | "measured";
export type MeasuredUnit = "g" | "ml" | "l" | "kg";

export interface InventoryItem {
  id: string;
  branchId: string;
  name: { en: string; ar: string };
  type: InventoryItemType;
  unit?: MeasuredUnit; // undefined for "piece" items
  quantity: number;
  criticalThreshold?: number;
  lowThreshold?: number;
  /** Inventory valuation is last-purchase-price only — no weighted average. */
  lastPurchaseCost?: number;
  /** Piece-type items only (undefined for measured items) — how many
   * pieces come in one pack/box/carton, e.g. 12 for a chocolate box. Purely
   * a data-entry shortcut for Receive Stock's "+ Pack" button; the saved
   * purchase/quantity is always just the final piece count, nothing about
   * packs is stored on the order/purchase itself. */
  packSize?: number;
}

export interface Purchase {
  id: string;
  branchId: string;
  inventoryItemId: string;
  /** Resolved via a database join at fetch time — see StockMovement.itemName. */
  itemName?: { en: string; ar: string };
  quantity: number;
  unitCost: number;
  totalCost: number;
  supplier?: string;
  employeeId?: string;
  employeeName: string;
  createdAt: string;
}

export type ShiftStatus = "open" | "closed";

export interface Shift {
  id: string;
  branchId: string;
  cashierId: string;
  cashierName: string;
  openingCash: number;
  status: ShiftStatus;
  startedAt: string;
  closedAt?: string;
  actualCash?: number;
  cashSales?: number;
  cardSales?: number;
  expensesTotal?: number;
  ordersCount?: number;
  expectedCash?: number;
  difference?: number;
  /** External marketplace (Talabat) orders during this shift — tracked
   * completely separately, never folded into ordersCount/cashSales/
   * cardSales/expectedCash above. Computed server-side by close_shift. */
  talabatOrdersCount?: number;
  talabatRevenue?: number;
}

export type StockMovementReason = "sale" | "manual_receive" | "waste" | "stock_count";

export interface StockMovement {
  id: string;
  branchId: string;
  inventoryItemId: string;
  /** The referenced item's name, resolved via a database join at fetch
   * time (not a client-side lookup against the current branch's own
   * inventory list) — this is what makes display correct even for a
   * movement whose inventory_item_id belongs to a different branch (a
   * real, separate data bug in "Match Recipe With Other Branch" recipe
   * syncing) or, if the item were ever genuinely deleted, undefined. */
  itemName?: { en: string; ar: string };
  quantityDelta: number;
  reason: StockMovementReason;
  employeeId?: string;
  employeeName: string;
  orderId?: string;
  createdAt: string;
}

export interface ShiftTemplate {
  key: string;
  name: { en: string; ar: string };
  officialStart: string; // "HH:MM", 24h
  officialEnd: string;
  windowStart: string;
  windowEnd: string;
}

export interface MultiPricingSettings {
  enabled: boolean;
  primaryLabel: { en: string; ar: string };
  secondaryLabel: { en: string; ar: string };
}

export interface ShopSettings {
  shopName: string;
  logo?: string;
  currency: string; // e.g. "EGP", "SAR", "USD"
  currencySymbol: string;
  taxRate: number; // percentage
  taxEnabled: boolean;
  locale: Locale;
  theme: Theme;
  receiptFooter?: { en: string; ar: string };
  address?: string;
  phone?: string;
  shiftTemplates?: ShiftTemplate[];
  multiPricing?: MultiPricingSettings;
  /** Per-branch label/icon for the external-marketplace payment method
   * (Talabat by default). The stored value on an order's
   * payment.method stays the literal string "talabat" forever — only this
   * display name/icon is configurable. Undefined falls back to
   * {en:"Talabat",ar:"طلبات"}/"Bike" everywhere it's read (defensive only —
   * migration_2_3.sql backfills every existing branch with that same
   * default, so this should always be present once applied). */
  externalPaymentName?: { en: string; ar: string };
  externalPaymentIcon?: string;
}

/** A roster of employees clocking in/out for attendance — entirely separate
 * from `StaffUser` (the login/POS accounts). An attendance employee only has
 * a name and a PIN; that PIN has no login/role meaning, it only unlocks the
 * Attendance page's check-in/check-out flow. */
export interface AttendanceEmployee {
  id: string;
  branchId: string;
  name: string;
  isActive: boolean;
  /** Owner-configured deduction settings — all optional; when unset the app
   * falls back to the tapped shift's default official times with 0 grace. */
  assignedShiftKey?: string;
  shiftStart?: string; // "HH:MM", 24h
  shiftEnd?: string; // "HH:MM", 24h
  graceMinutes?: number;
}

/** Clock-in/out record for an AttendanceEmployee — distinct from Shift
 * (which is the cash-till opening/closing-cash reconciliation, unrelated to
 * work attendance) and unrelated to StaffUser/login accounts. */
export interface Attendance {
  id: string;
  branchId: string;
  employeeId: string;
  employeeName: string;
  shiftKey: string;
  officialStart: string;
  officialEnd: string;
  checkInAt: string;
  checkOutAt?: string;
  lateMinutes: number;
  workedMinutes?: number;
  overtimeMinutes?: number;
}

export interface HeldOrder {
  id: string;
  label: string;
  lines: CartLine[];
  orderType: OrderType;
  tableNumber?: string;
  customerName?: string;
  discountPercent: number;
  discountFixedAmount?: number;
  cashierName: string;
  createdAt: string;
}

export interface AppData {
  settings: ShopSettings;
  staff: StaffUser[];
  categories: Category[];
  products: Product[];
  modifierGroups: ModifierGroup[];
  orders: Order[];
  customers: Customer[];
  expenses: Expense[];
  inventoryItems: InventoryItem[];
  stockMovements: StockMovement[];
  purchases: Purchase[];
  shifts: Shift[];
  attendance: Attendance[];
  attendanceEmployees: AttendanceEmployee[];
}
