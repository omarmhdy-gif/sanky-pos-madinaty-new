"use client";

import { useMemo, useState } from "react";
import { ShoppingBasket, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useDataStore } from "@/lib/store/useDataStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { formatMoney, formatNumber, formatDateTime } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import type { Purchase } from "@/lib/types";

export function PurchasesTab() {
  const { t, locale } = useI18n();
  const purchases = useDataStore((s) => s.purchases);
  const inventoryItems = useDataStore((s) => s.inventoryItems);
  const settings = useDataStore((s) => s.settings);
  const deletePurchase = useDataStore((s) => s.deletePurchase);
  const branches = useBranchStore((s) => s.branches);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);
  const isOwner = useAuthStore((s) => s.currentUser?.role) === "owner";

  const [deleteTarget, setDeleteTarget] = useState<Purchase | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePurchase(deleteTarget.id);
      toast(t.common.delete, "success");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const branchName = bilingual(
    branches.find((b) => b.id === currentBranchId)?.name ?? { en: "", ar: "" },
    locale
  );

  const sorted = useMemo(
    () => [...purchases].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [purchases]
  );

  const now = new Date();
  const monthlyTotal = purchases
    .filter((p) => {
      const d = new Date(p.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((sum, p) => sum + p.totalCost, 0);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t.purchases.subtitle}</p>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">{t.purchases.monthlyTotal}</p>
        <p className="mt-1 text-2xl font-bold text-primary">{formatMoney(monthlyTotal, settings.currencySymbol)}</p>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <ShoppingBasket className="h-10 w-10 opacity-30" />
          <p className="text-sm">{t.common.noResults}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border divide-y divide-border">
          {sorted.map((p) => {
            // Same preference order as Inventory History — see that page's
            // comment: joined name first (correct across branches), local
            // array as a same-session-optimistic-update fallback, then
            // "Unknown Inventory Item"; never the raw internal id.
            const item = inventoryItems.find((i) => i.id === p.inventoryItemId);
            const displayName = p.itemName ? bilingual(p.itemName, locale) : item ? bilingual(item.name, locale) : t.inventory.unknownItem;
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 bg-card px-4 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {displayName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(p.createdAt, locale)} · {p.employeeName} · {branchName}
                    {p.supplier ? ` · ${t.purchases.supplier}: ${p.supplier}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.purchases.quantity}: {formatNumber(p.quantity, 0, 3)} {item?.unit ?? t.inventory.pieceUnit} ·{" "}
                    {t.purchases.unitCost}: {formatMoney(p.unitCost, settings.currencySymbol)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-bold text-primary">
                    {formatMoney(p.totalCost, settings.currencySymbol)}
                  </span>
                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteTarget(p)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.purchases.deleteConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.purchases.deleteConfirmDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={handleConfirmDelete}>
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
