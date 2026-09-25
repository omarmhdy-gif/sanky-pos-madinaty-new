"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, Settings2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { CategoryManagerDialog } from "@/components/products/CategoryManagerDialog";
import { useDataStore } from "@/lib/store/useDataStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { formatMoney, cn, isImageUrl } from "@/lib/utils";
import { productAvailableQty } from "@/lib/inventory";
import { toast } from "@/components/ui/toast";
import type { Product } from "@/lib/types";

export default function ProductsPage() {
  const { t, locale } = useI18n();
  const products = useDataStore((s) => s.products);
  const inventoryItems = useDataStore((s) => s.inventoryItems);
  const categories = useDataStore((s) => s.categories);
  const settings = useDataStore((s) => s.settings);
  const deleteProduct = useDataStore((s) => s.deleteProduct);
  const updateProduct = useDataStore((s) => s.updateProduct);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const filtered = useMemo(() => {
    let list = [...products];
    if (categoryFilter !== "all") list = list.filter((p) => p.categoryId === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.en.toLowerCase().includes(q) || p.name.ar.includes(q));
    }
    return list.sort((a, b) => a.sortOrder - b.sortOrder);
  }, [products, categoryFilter, search]);

  const handleEdit = (p: Product) => {
    setEditingProduct(p);
    setFormOpen(true);
  };

  // Drives auto-advance for fast bulk recipe entry: saving an existing
  // product moves straight to the next one in the *currently filtered/
  // searched* list (never the raw database order) without leaving the
  // Products page or touching search/category/scroll state — this
  // component never unmounts, so all of that is untouched by construction.
  const handleSaveAndNext = () => {
    const editingIndex = editingProduct ? filtered.findIndex((p) => p.id === editingProduct.id) : -1;
    if (editingIndex === -1) return;
    const next = filtered[editingIndex + 1];
    if (next) {
      setEditingProduct(next);
    } else {
      setFormOpen(false);
      setEditingProduct(null);
    }
  };

  const handleAdd = () => {
    setEditingProduct(null);
    setFormOpen(true);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteProduct(deleteTarget.id);
      toast(t.common.delete, "success");
      setDeleteTarget(null);
    }
  };

  return (
    <AppShell title={t.products.title}>
      <div className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t.products.subtitle}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCategoryDialogOpen(true)}>
              <Settings2 className="h-4 w-4" />
              {t.products.manageCategories}
            </Button>
            <Button onClick={handleAdd}>
              <Plus className="h-4 w-4" />
              {t.products.addProduct}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.common.search}
              className="ps-9"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setCategoryFilter("all")}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium border",
                categoryFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border"
              )}
            >
              {t.common.all}
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryFilter(c.id)}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium border",
                  categoryFilter === c.id ? "bg-primary text-primary-foreground border-primary" : "border-border"
                )}
              >
                {bilingual(c.name, locale)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="group relative flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex h-16 w-full items-center justify-center overflow-hidden rounded-xl bg-muted text-4xl">
                {isImageUrl(p.image) ? (
                  <img src={p.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  p.image
                )}
              </div>
              <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold">{bilingual(p.name, locale)}</p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-primary">{formatMoney(p.price, settings.currencySymbol)}</span>
                <Badge variant={p.isActive ? "success" : "outline"}>
                  {p.isActive ? t.common.active : t.common.inactive}
                </Badge>
              </div>
              {(() => {
                const availableQty = productAvailableQty(p, inventoryItems);
                return (
                  availableQty !== null && (
                    <p className="text-xs text-muted-foreground">{availableQty} left (by recipe)</p>
                  )
                );
              })()}
              <div className="mt-1 flex gap-1.5">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(p)}>
                  <Pencil className="h-3.5 w-3.5" />
                  {t.common.edit}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setDeleteTarget(p)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <label className="absolute end-3 top-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={p.isActive}
                  onChange={(e) => updateProduct(p.id, { isActive: e.target.checked })}
                  className="h-3.5 w-3.5 accent-primary"
                />
              </label>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
            <p className="text-sm">{t.common.noResults}</p>
          </div>
        )}
      </div>

      <ProductFormDialog
        product={editingProduct}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaveAndNext={handleSaveAndNext}
      />
      <CategoryManagerDialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.products.deleteConfirm}</AlertDialogTitle>
            <AlertDialogDescription>{t.products.deleteConfirmDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>{t.common.delete}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
