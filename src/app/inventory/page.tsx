"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Wrench, Trash2, PackagePlus, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { InventoryRow } from "@/components/inventory/InventoryRow";
import { InventoryItemFormDialog } from "@/components/inventory/InventoryItemFormDialog";
import { AdjustStockDialog } from "@/components/inventory/AdjustStockDialog";
import { ReceiveStockDialog } from "@/components/inventory/ReceiveStockDialog";
import { Input } from "@/components/ui/input";
import { useDataStore } from "@/lib/store/useDataStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { formatDateTime, formatNumber, cn } from "@/lib/utils";
import { stockLevel, type StockLevel } from "@/lib/inventory";
import type { InventoryItem } from "@/lib/types";

const STOCK_LEVEL_PRIORITY: Record<StockLevel, number> = { critical: 0, low: 1, good: 2 };

export default function InventoryPage() {
  const { t, locale } = useI18n();
  const items = useDataStore((s) => s.inventoryItems);
  const movements = useDataStore((s) => s.stockMovements);
  const deleteInventoryItem = useDataStore((s) => s.deleteInventoryItem);
  const role = useAuthStore((s) => s.currentUser?.role);
  const isOwner = role === "owner";

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);
  const [receiving, setReceiving] = useState<InventoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [search, setSearch] = useState("");

  // Default priority sort: critical stock first, then low, then normal —
  // ties within a tier broken by remaining quantity ascending, so the
  // items closest to running out always surface first.
  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Inventory items have no SKU field in this schema (only Products do) —
    // name is the only searchable field here.
    const filtered = q
      ? items.filter((i) => i.name.en.toLowerCase().includes(q) || i.name.ar.includes(q))
      : items;
    return [...filtered].sort((a, b) => {
      const levelDiff = STOCK_LEVEL_PRIORITY[stockLevel(a)] - STOCK_LEVEL_PRIORITY[stockLevel(b)];
      if (levelDiff !== 0) return levelDiff;
      return a.quantity - b.quantity;
    });
  }, [items, search]);

  const currentStockList = (
    <div className="overflow-hidden rounded-xl border border-border divide-y divide-border">
      {sorted.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t.common.noResults}</p>
      ) : (
        sorted.map((item) => (
          <InventoryRow key={item.id} item={item} locale={locale} showCost={isOwner}>
            <Button variant="outline" size="sm" onClick={() => setReceiving(item)}>
              <PackagePlus className="h-3.5 w-3.5" />
              {t.receiveStock.receiveButton}
            </Button>
            {isOwner && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAdjusting(item)} title={t.inventory.adjustStock}>
                  <Wrench className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setEditing(item);
                    setFormOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => setDeleteTarget(item)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </InventoryRow>
        ))
      )}
    </div>
  );

  const historyList = (
    <div className="overflow-hidden rounded-xl border border-border divide-y divide-border">
      {movements.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t.common.noResults}</p>
      ) : (
        movements.map((m) => {
          // Prefer the name resolved by the server-side join (correct even
          // for a movement referencing another branch's item — see
          // api.ts); fall back to the local branch-scoped items array only
          // for a movement just created this session via an optimistic
          // update (which never has the joined name yet, but is always
          // for the current branch's own item so the local lookup is
          // valid there); never fall back to the raw internal id.
          const item = items.find((i) => i.id === m.inventoryItemId);
          const displayName = m.itemName ? bilingual(m.itemName, locale) : item ? bilingual(item.name, locale) : t.inventory.unknownItem;
          return (
            <div key={m.id} className="flex items-center justify-between gap-3 p-3.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {m.employeeName} · {formatDateTime(m.createdAt, locale)} · {t.inventory.reasons[m.reason]}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 text-sm font-semibold",
                  m.quantityDelta >= 0 ? "text-success" : "text-destructive"
                )}
              >
                {m.quantityDelta >= 0 ? "+" : ""}
                {formatNumber(m.quantityDelta, 0, 3)}
              </span>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <AppShell title={t.inventory.title}>
      <div className="space-y-4 p-4 sm:p-6 pb-10">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t.inventory.subtitle}</p>
          {isOwner && (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              {t.inventory.addItem}
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.inventory.searchPlaceholder}
            className="ps-9"
          />
        </div>

        {isOwner ? (
          <Tabs defaultValue="stock">
            <TabsList>
              <TabsTrigger value="stock">{t.inventory.currentStock}</TabsTrigger>
              <TabsTrigger value="history">{t.inventory.history}</TabsTrigger>
            </TabsList>
            <TabsContent value="stock">{currentStockList}</TabsContent>
            <TabsContent value="history">{historyList}</TabsContent>
          </Tabs>
        ) : (
          currentStockList
        )}
      </div>

      <InventoryItemFormDialog item={editing} open={formOpen} onOpenChange={setFormOpen} />
      <AdjustStockDialog item={adjusting} open={!!adjusting} onOpenChange={(v) => !v && setAdjusting(null)} />
      <ReceiveStockDialog item={receiving} open={!!receiving} onOpenChange={(v) => !v && setReceiving(null)} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.products.deleteConfirm}</AlertDialogTitle>
            <AlertDialogDescription>{t.products.deleteConfirmDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) deleteInventoryItem(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
