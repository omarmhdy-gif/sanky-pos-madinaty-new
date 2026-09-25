import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Receipt,
  BarChart3,
  Settings,
  Boxes,
  ChefHat,
  Landmark,
  Users,
  MonitorSmartphone,
  Clock,
} from "lucide-react";
import type { UserRole, PermissionKey, StaffUser } from "@/lib/types";

export interface NavItem {
  href: string;
  icon: typeof LayoutDashboard;
  key: "dashboard" | "pos" | "inventory" | "products" | "recipes" | "orders" | "finance" | "reports" | "employees" | "settings" | "devices" | "attendance";
  roles: UserRole[];
  /** Granular permission gate (any-of — Finance needs either "finance" or
   * "purchases", everything else has exactly one entry). Absent for
   * Recipes/Devices, which stay hard role-gated (owner-only, no permission
   * can unlock them for a cashier) — see PermissionKey's doc comment. */
  permissions?: PermissionKey[];
}

// Single source of truth for both "which links show in the nav" (Sidebar,
// BottomNav) and "which routes a user may load directly" (AuthGuard).
// `roles` is now a coarse allow-list (both roles listed for every
// permission-gated item, since a cashier COULD be granted any of them) —
// the real gate for those is `permissions` via hasPermission() below.
// Recipes/Devices have no `permissions` entry, so they stay hard-locked to
// owner regardless of any grant — unaffected by the permission system.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, key: "dashboard", roles: ["owner", "cashier"], permissions: ["dashboard"] },
  { href: "/pos", icon: ShoppingCart, key: "pos", roles: ["owner", "cashier"], permissions: ["pos"] },
  { href: "/orders", icon: Receipt, key: "orders", roles: ["owner", "cashier"], permissions: ["orders"] },
  { href: "/inventory", icon: Boxes, key: "inventory", roles: ["owner", "cashier"], permissions: ["inventory"] },
  { href: "/attendance", icon: Clock, key: "attendance", roles: ["owner", "cashier"], permissions: ["attendance"] },
  { href: "/products", icon: Package, key: "products", roles: ["owner", "cashier"], permissions: ["products"] },
  { href: "/recipes", icon: ChefHat, key: "recipes", roles: ["owner"] },
  { href: "/finance", icon: Landmark, key: "finance", roles: ["owner", "cashier"], permissions: ["finance", "purchases"] },
  { href: "/reports", icon: BarChart3, key: "reports", roles: ["owner", "cashier"], permissions: ["reports"] },
  { href: "/employees", icon: Users, key: "employees", roles: ["owner", "cashier"], permissions: ["employees"] },
  { href: "/settings", icon: Settings, key: "settings", roles: ["owner", "cashier"], permissions: ["settings"] },
  { href: "/devices", icon: MonitorSmartphone, key: "devices", roles: ["owner"] },
];

// Backward-compat fallback for any staff row whose `permissions` is still
// null (i.e. never configured through the new UI) — deliberately identical
// to what each role could already reach via the old hardcoded `roles`
// arrays, so no existing user's access changes until an owner explicitly
// sets permissions for them.
export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  owner: ["dashboard", "pos", "orders", "inventory", "products", "finance", "purchases", "reports", "employees", "settings"],
  cashier: ["pos", "orders", "inventory", "attendance"],
};

export const ALL_PERMISSION_KEYS: PermissionKey[] = [
  "pos",
  "orders",
  "inventory",
  "purchases",
  "products",
  "finance",
  "reports",
  "attendance",
  "employees",
  "settings",
  "dashboard",
];

/** The one place "does this user have X" is decided. Owner always true. */
export function hasPermission(user: Pick<StaffUser, "role" | "permissions"> | null | undefined, key: PermissionKey): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  const perms = user.permissions ?? ROLE_DEFAULT_PERMISSIONS[user.role];
  return perms.includes(key);
}

export function canAccess(user: Pick<StaffUser, "role" | "permissions">, pathname: string): boolean {
  const item = NAV_ITEMS.find((i) => i.href === pathname);
  if (!item) return true; // not a gated route (e.g. login, branch-select)
  if (!item.roles.includes(user.role)) return false;
  if (item.permissions && !item.permissions.some((p) => hasPermission(user, p))) return false;
  return true;
}

// Priority order for picking a landing page once a user's own permissions
// are known — first one they actually have access to wins. Owner always
// lands on Dashboard (always has every permission, so this never needs to
// fall through). Cashier used to always land on /pos; that's now just the
// first (and usually only) candidate that matches, so existing cashiers see
// no change.
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
  "settings",
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
