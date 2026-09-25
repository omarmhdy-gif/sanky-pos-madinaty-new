"use client";

import { AppShell } from "@/components/layout/AppShell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PurchasesTab } from "@/components/finance/PurchasesTab";
import { ExpensesTab } from "@/components/finance/ExpensesTab";
import { useDataStore } from "@/lib/store/useDataStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/utils";
import { hasPermission } from "@/lib/permissions";

export default function FinancePage() {
  const { t } = useI18n();
  const inventoryItems = useDataStore((s) => s.inventoryItems);
  const settings = useDataStore((s) => s.settings);
  const currentUser = useAuthStore((s) => s.currentUser);

  // This route is reachable with EITHER permission (see NAV_ITEMS'
  // finance entry) — a user with only "purchases" sees just that tab (no
  // Expenses, no inventory value card, since those are financial totals),
  // a user with only "finance" sees the reverse. AuthGuard already
  // guarantees at least one is true by the time this renders.
  const canPurchases = hasPermission(currentUser, "purchases");
  const canFinance = hasPermission(currentUser, "finance");

  // Current Quantity x Last Purchase Price for every item — reactive off
  // the same live store both Inventory and Purchases already read, so it
  // updates automatically the instant either changes.
  const inventoryValue = inventoryItems.reduce((sum, i) => sum + i.quantity * (i.lastPurchaseCost ?? 0), 0);

  return (
    <AppShell title={t.finance.title}>
      <div className="p-4 sm:p-6 pb-10 space-y-5">
        {canFinance && (
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">{t.finance.inventoryValue}</p>
            <p className="mt-1 text-2xl font-bold text-primary">{formatMoney(inventoryValue, settings.currencySymbol)}</p>
          </div>
        )}
        <Tabs defaultValue={canPurchases ? "purchases" : "expenses"}>
          <TabsList>
            {canPurchases && <TabsTrigger value="purchases">{t.purchases.title}</TabsTrigger>}
            {canFinance && <TabsTrigger value="expenses">{t.expenses.title}</TabsTrigger>}
          </TabsList>
          {canPurchases && (
            <TabsContent value="purchases">
              <PurchasesTab />
            </TabsContent>
          )}
          {canFinance && (
            <TabsContent value="expenses">
              <ExpensesTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppShell>
  );
}
