import {
  PanelsTopLeft,
  ScanLine,
  ReceiptText,
  Boxes,
  CalendarCheck,
  Tags,
  BookOpenCheck,
  WalletCards,
  ChartNoAxesCombined,
  UsersRound,
  BriefcaseBusiness,
  ContactRound,
  Settings2,
} from "lucide-react";
import type { UserRole, PermissionKey, StaffUser } from "@/lib/types";

export type PermissionModuleKey =
  | "dashboard" | "pos" | "orders" | "inventory" | "purchases" | "products"
  | "finance" | "reports" | "attendance" | "employees" | "customers" | "settings" | "recipes";

export interface PermissionModuleDefinition {
  key: PermissionModuleKey;
  actions: PermissionKey[];
}

/** Permission matrix used by both the employee form and runtime guards. */
export const PERMISSION_MODULES: PermissionModuleDefinition[] = [
  { key: "dashboard", actions: [] },
  { key: "pos", actions: ["pos.sell", "pos.apply_discount", "pos.change_price", "pos.manage_shifts", "orders.void", "orders.refund"] },
  { key: "orders", actions: [] },
  { key: "products", actions: ["products.create", "products.edit", "products.delete", "products.manage_recipe"] },
  { key: "recipes", actions: [] },
  { key: "inventory", actions: ["inventory.create", "inventory.edit", "inventory.delete", "inventory.receive", "inventory.adjust", "inventory.manufacture", "inventory.quality"] },
  { key: "purchases", actions: ["purchases.create", "purchases.delete"] },
  { key: "finance", actions: ["finance.create", "finance.edit", "finance.delete"] },
  { key: "reports", actions: ["reports.export"] },
  { key: "attendance", actions: ["attendance.create", "attendance.edit", "attendance.delete", "attendance.clock_in", "attendance.clock_out"] },
  { key: "employees", actions: ["employees.create", "employees.edit", "employees.delete", "employees.manage_permissions"] },
  { key: "customers", actions: ["customers.create", "customers.edit"] },
  { key: "settings", actions: ["settings.edit_general", "settings.edit_receipt", "settings.edit_payments", "settings.edit_dining", "settings.edit_loyalty", "settings.edit_shifts"] },
];

export const PERMISSION_GROUPS: PermissionModuleKey[][] = [
  ["dashboard", "pos", "orders"],
  ["products", "recipes", "inventory", "purchases"],
  ["finance", "reports", "attendance", "employees", "customers", "settings"],
];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_MODULES.flatMap(({ key, actions }) => [`${key}.view` as PermissionKey, ...actions]);

export const NEW_EMPLOYEE_DEFAULT_PERMISSIONS: PermissionKey[] = [
  "pos.view", "pos.sell",
];

// Kept as a fallback for existing employee rows that have never been edited.
// The UI expands these legacy module grants into explicit action checkboxes
// the next time an owner saves that employee.
export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  owner: ALL_PERMISSION_KEYS,
  cashier: ["pos", "orders", "inventory", "attendance"],
};

/** Expand legacy module-only grants so the UI and employee summaries show
 * the effective capabilities represented by older saved rows. */
export function expandPermissionGrants(grants: PermissionKey[]): PermissionKey[] {
  return ALL_PERMISSION_KEYS.filter((key) =>
    grants.includes(key) || grants.includes(key.split(".")[0] as PermissionModuleKey)
  );
}

export function countPermissionModules(user: Pick<StaffUser, "role" | "permissions">): number {
  const grants = expandPermissionGrants(user.permissions ?? ROLE_DEFAULT_PERMISSIONS[user.role]);
  return PERMISSION_MODULES.filter(({ key }) => grants.includes(`${key}.view` as PermissionKey)).length;
}

export function countPermissionActions(user: Pick<StaffUser, "role" | "permissions">): number {
  return expandPermissionGrants(user.permissions ?? ROLE_DEFAULT_PERMISSIONS[user.role]).filter((key) => key.includes(".") && !key.endsWith(".view")).length;
}

export interface NavItem {
  href: string;
  icon: typeof PanelsTopLeft;
  key: "dashboard" | "pos" | "inventory" | "products" | "recipes" | "orders" | "finance" | "reports" | "employees" | "customers" | "settings" | "devices" | "attendance" | "hr";
  roles: UserRole[];
  /** Granular permission gate (any-of — Finance needs either "finance" or
   * "purchases", everything else has exactly one entry). HR remains
   * owner-only because its records use a separate owner-PIN session. */
  permissions?: PermissionKey[];
}

// Single source of truth for both "which links show in the nav" (Sidebar,
// BottomNav) and "which routes a user may load directly" (AuthGuard).
// `roles` is now a coarse allow-list (both roles listed for every
// permission-gated item, since a cashier COULD be granted any of them) —
// the real gate for those is `permissions` via hasPermission() below.
// HR has no `permissions` entry, so it stays hard-locked to owner regardless
// of an employee's grants; its API still requires a separate owner PIN.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", icon: PanelsTopLeft, key: "dashboard", roles: ["owner", "cashier"], permissions: ["dashboard"] },
  { href: "/pos", icon: ScanLine, key: "pos", roles: ["owner", "cashier"], permissions: ["pos"] },
  { href: "/orders", icon: ReceiptText, key: "orders", roles: ["owner", "cashier"], permissions: ["orders"] },
  { href: "/inventory", icon: Boxes, key: "inventory", roles: ["owner", "cashier"], permissions: ["inventory"] },
  { href: "/attendance", icon: CalendarCheck, key: "attendance", roles: ["owner", "cashier"], permissions: ["attendance"] },
  { href: "/products", icon: Tags, key: "products", roles: ["owner", "cashier"], permissions: ["products"] },
  { href: "/recipes", icon: BookOpenCheck, key: "recipes", roles: ["owner", "cashier"], permissions: ["recipes"] },
  { href: "/finance", icon: WalletCards, key: "finance", roles: ["owner", "cashier"], permissions: ["finance", "purchases"] },
  { href: "/reports", icon: ChartNoAxesCombined, key: "reports", roles: ["owner", "cashier"], permissions: ["reports"] },
  { href: "/employees", icon: UsersRound, key: "employees", roles: ["owner", "cashier"], permissions: ["employees"] },
  { href: "/hr", icon: BriefcaseBusiness, key: "hr", roles: ["owner"] },
  { href: "/customers", icon: ContactRound, key: "customers", roles: ["owner", "cashier"], permissions: ["customers"] },
  { href: "/settings", icon: Settings2, key: "settings", roles: ["owner", "cashier"], permissions: ["settings"] },
];

/** The one place module and action grants are evaluated. A legacy module
 * grant still grants that module's actions until the row is explicitly saved
 * from the new matrix. */
export function hasPermission(user: Pick<StaffUser, "role" | "permissions"> | null | undefined, key: PermissionKey): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  const perms = user.permissions ?? ROLE_DEFAULT_PERMISSIONS[user.role];
  if (perms.includes(key)) return true;
  if (!key.includes(".")) return perms.includes(`${key}.view` as PermissionKey);
  return perms.includes(key.split(".")[0] as PermissionModuleKey);
}

export function canAccess(user: Pick<StaffUser, "role" | "permissions">, pathname: string): boolean {
  // Device activation remains restricted to the account owner.
  if (pathname === "/devices") return user.role === "owner";
  const item = NAV_ITEMS.find((i) => i.href === pathname);
  if (!item) return true; // not a gated route (e.g. login, branch-select)
  if (!item.roles.includes(user.role)) return false;
  if (item.permissions && !item.permissions.some((p) => hasPermission(user, p))) return false;
  return true;
}

// Priority order for picking the first page this employee is allowed to use.
const LANDING_PRIORITY: (typeof NAV_ITEMS)[number]["key"][] = [
  "pos",
  "orders",
  "dashboard",
  "inventory",
  "attendance",
  "products",
  "finance",
  "reports",
  "employees",
  "customers",
  "settings",
  "recipes",
  "hr",
];

/** Returns the first route this user can actually reach, or null if they
 * (pathologically — an owner granted them literally nothing) have none.
 * AuthGuard shows a clear "no access" message in that case instead of
 * looping redirects. */
export function defaultRouteFor(user: Pick<StaffUser, "role" | "permissions">): string | null {
  if (user.role === "owner") return "/dashboard";
  for (const key of LANDING_PRIORITY) {
    const item = NAV_ITEMS.find((i) => i.key === key);
    if (item && canAccess(user, item.href)) return item.href;
  }
  return null;
}
