"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { ShoppingBasket, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";
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
  const receiveStock = useDataStore((s) => s.receiveStock);
  const branches = useBranchStore((s) => s.branches);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);
  const isOwner = useAuthStore((s) => s.currentUser?.role) === "owner";

  const [deleteTarget, setDeleteTarget] = useState<Purchase | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const downloadPurchaseSheet = (template: boolean) => {
    const rows = template
      ? inventoryItems.map((item) => ({ "Item ID": item.id, "Item Name": item.name.en, "Quantity (Purchase Unit)": "", "Purchase Unit": item.purchaseUnit ?? item.unit ?? "piece", "Unit Cost (Purchase Unit)": "", Supplier: "" }))
      : sorted.map((purchase) => ({ "Purchase ID": purchase.id, "Item ID": purchase.inventoryItemId, "Item Name": purchase.itemName?.en ?? "", "Quantity (Purchase Unit)": purchase.purchaseQuantity ?? purchase.quantity, "Purchase Unit": purchase.purchaseUnit ?? inventoryItems.find((i) => i.id === purchase.inventoryItemId)?.purchaseUnit ?? "piece", "Unit Cost (Purchase Unit)": purchase.purchaseUnitCost ?? purchase.unitCost, "Total Cost": purchase.totalCost, Supplier: purchase.supplier ?? "", Date: purchase.createdAt }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, template ? "Purchase Import" : "Purchase History");
    XLSX.writeFile(workbook, `madinaty-purchases${template ? "-template" : ""}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const importPurchases = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    let imported = 0;
    let failed = 0;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!worksheet) throw new Error("The workbook has no worksheet.");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
      if (rows.length > 200) throw new Error("Import up to 200 purchase rows at a time.");
      for (const [index, row] of rows.entries()) {
        const id = String(row["Item ID"] ?? "").trim();
        const item = inventoryItems.find((candidate) => candidate.id === id);
        const quantity = Number(row["Quantity (Purchase Unit)"]);
        const unitCost = Number(row["Unit Cost (Purchase Unit)"]);
        const unit = String(row["Purchase Unit"] ?? "").trim();
        if (!item || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0 || (unit && unit !== (item.purchaseUnit ?? item.unit ?? "piece"))) {
          failed++;
          toast(`Purchase row ${index + 2} is invalid. Check Item ID, quantity, unit and cost.`, "error");
          continue;
        }
        if (await receiveStock(item.id, quantity, unitCost, String(row.Supplier ?? "").trim() || undefined)) imported++;
        else failed++;
      }
      toast(`Purchases imported: ${imported}; failed: ${failed}.`, failed ? "info" : "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not import the purchase sheet.", "error");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

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

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => downloadPurchaseSheet(false)}>Export Purchases</Button>
        <Button size="sm" variant="outline" onClick={() => downloadPurchaseSheet(true)}>Download Purchase Template</Button>
        <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importPurchases} />
        <Button size="sm" disabled={importing} onClick={() => importRef.current?.click()}>{importing ? "Importing…" : "Import Purchases"}</Button>
      </div>

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
                    {t.purchases.quantity}: {formatNumber(p.purchaseQuantity ?? p.quantity, 0, 3)} {p.purchaseUnit ?? item?.purchaseUnit ?? item?.unit ?? t.inventory.pieceUnit} ·{" "}
                    {t.purchases.unitCost}: {formatMoney(p.purchaseUnitCost ?? p.unitCost, settings.currencySymbol)}
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
