"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { Download, Plus, Search, Pencil, Trash2, Settings2, Upload } from "lucide-react";
import * as XLSX from "xlsx";
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
import { PdfMenuImportButton } from "@/components/products/PdfMenuImportButton";
import { useDataStore } from "@/lib/store/useDataStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { formatMoney, cn, isImageUrl } from "@/lib/utils";
import { productAvailableQty } from "@/lib/inventory";
import { toast } from "@/components/ui/toast";
import type { Product } from "@/lib/types";
import { productMenuPhoto } from "@/lib/productImages";

export default function ProductsPage() {
  const { t, locale } = useI18n();
  const products = useDataStore((s) => s.products);
  const inventoryItems = useDataStore((s) => s.inventoryItems);
  const categories = useDataStore((s) => s.categories);
  const settings = useDataStore((s) => s.settings);
  const modifierGroups = useDataStore((s) => s.modifierGroups);
  const deleteProduct = useDataStore((s) => s.deleteProduct);
  const updateProduct = useDataStore((s) => s.updateProduct);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

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

  const exportProducts = () => {
    const rows = products.map((product) => {
      const category = categories.find((candidate) => candidate.id === product.categoryId);
      return {
        ID: product.id,
        "Name EN": product.name.en,
        "Name AR": product.name.ar,
        "Category ID": product.categoryId,
        "Category EN": category?.name.en ?? "",
        "Category AR": category?.name.ar ?? "",
        Price: product.price,
        "Secondary Price": product.secondaryPrice ?? "",
        Cost: product.cost ?? "",
        SKU: product.sku ?? "",
        Barcode: product.barcode ?? "",
        Image: product.image ?? "",
        Color: product.color ?? "",
        Active: product.isActive,
        "Recipe Synced": product.recipeSynced ?? false,
        "Sort Order": product.sortOrder,
        "Modifier Group IDs": (product.modifierGroupIds ?? []).join(","),
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = [
      { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 22 }, { wch: 22 }, { wch: 22 },
      { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 30 },
      { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 34 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Products");
    XLSX.writeFile(workbook, "sanky-products-" + new Date().toISOString().slice(0, 10) + ".xlsx");
  };

  const importProducts = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!worksheet) throw new Error("The Excel file does not contain a worksheet.");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
      if (rows.length === 0) throw new Error("The Excel sheet is empty.");

      const hasColumn = (name: string) => Object.prototype.hasOwnProperty.call(rows[0], name);
      if (!hasColumn("ID")) throw new Error('The "ID" column is required. Import updates existing products by ID.');
      const text = (row: Record<string, unknown>, key: string) => String(row[key] ?? "").trim();
      const parseBool = (raw: unknown, label: string) => {
        const value = String(raw ?? "").trim().toLowerCase();
        if (["true", "yes", "1", "active"].includes(value)) return true;
        if (["false", "no", "0", "inactive"].includes(value)) return false;
        throw new Error(label + " must be TRUE or FALSE.");
      };

      const changes: Array<{ rowNumber: number; id: string; patch: Partial<Product> }> = [];
      const errors: string[] = [];
      const seenIds = new Set<string>();
      rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const id = text(row, "ID");
        if (!id && Object.values(row).every((value) => String(value ?? "").trim() === "")) return;
        try {
          if (!id) throw new Error("ID is required.");
          if (seenIds.has(id)) throw new Error("ID " + id + " appears more than once.");
          seenIds.add(id);
          const product = products.find((candidate) => candidate.id === id);
          if (!product) throw new Error("ID " + id + " was not found. This file only updates existing products.");
          const patch: Partial<Product> = {};

          if (hasColumn("Name EN") || hasColumn("Name AR")) {
            const nameEn = hasColumn("Name EN") ? text(row, "Name EN") : product.name.en;
            const nameAr = hasColumn("Name AR") ? text(row, "Name AR") : product.name.ar;
            if (!nameEn || !nameAr) throw new Error("Both product names are required.");
            patch.name = { en: nameEn, ar: nameAr };
          }
          if (hasColumn("Category ID") || hasColumn("Category EN") || hasColumn("Category AR")) {
            const categoryId = text(row, "Category ID");
            const categoryEn = text(row, "Category EN");
            const categoryAr = text(row, "Category AR");
            if (categoryId || categoryEn || categoryAr) {
              const category = categories.find((candidate) => candidate.id === categoryId) ?? categories.find((candidate) =>
                (categoryEn && candidate.name.en.toLowerCase() === categoryEn.toLowerCase()) ||
                (categoryAr && candidate.name.ar === categoryAr)
              );
              if (!category) throw new Error('Category "' + (categoryId || categoryEn || categoryAr) + '" was not found.');
              patch.categoryId = category.id;
            }
          }
          if (hasColumn("Price")) {
            const price = Number(row.Price);
            if (!Number.isFinite(price) || price < 0) throw new Error("Price must be a valid non-negative number.");
            patch.price = price;
          }
          if (hasColumn("Secondary Price")) {
            const raw = text(row, "Secondary Price");
            const price = raw ? Number(raw) : undefined;
            if (price !== undefined && (!Number.isFinite(price) || price < 0)) throw new Error("Secondary Price must be blank or a non-negative number.");
            patch.secondaryPrice = price;
          }
          if (hasColumn("Cost")) {
            const raw = text(row, "Cost");
            const cost = raw ? Number(raw) : undefined;
            if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) throw new Error("Cost must be blank or a non-negative number.");
            patch.cost = cost;
          }
          if (hasColumn("SKU")) patch.sku = text(row, "SKU") || undefined;
          if (hasColumn("Barcode")) patch.barcode = text(row, "Barcode") || undefined;
          if (hasColumn("Image")) patch.image = text(row, "Image") || undefined;
          if (hasColumn("Color")) patch.color = text(row, "Color") || undefined;
          if (hasColumn("Active")) patch.isActive = parseBool(row.Active, "Active");
          if (hasColumn("Recipe Synced")) patch.recipeSynced = parseBool(row["Recipe Synced"], "Recipe Synced");
          if (hasColumn("Sort Order")) {
            const sortOrder = Number(row["Sort Order"]);
            if (!Number.isInteger(sortOrder) || sortOrder < 0) throw new Error("Sort Order must be a non-negative integer.");
            patch.sortOrder = sortOrder;
          }
          if (hasColumn("Modifier Group IDs")) {
            const ids = text(row, "Modifier Group IDs").split(",").map((value) => value.trim()).filter(Boolean);
            const unknown = ids.find((groupId) => !modifierGroups.some((group) => group.id === groupId));
            if (unknown) throw new Error("Modifier Group ID " + unknown + " was not found.");
            patch.modifierGroupIds = ids.length ? ids : undefined;
          }
          if (Object.keys(patch).length === 0) throw new Error("No editable columns were found.");
          changes.push({ rowNumber, id, patch });
        } catch (err) {
          errors.push("Row " + rowNumber + ": " + (err instanceof Error ? err.message : "Invalid product data."));
        }
      });

      if (errors.length) throw new Error(errors.slice(0, 5).join("\n"));
      if (changes.length === 0) throw new Error("No product rows were found to import.");

      let updated = 0;
      const failedRows: number[] = [];
      for (const change of changes) {
        if (await updateProduct(change.id, change.patch)) updated += 1;
        else failedRows.push(change.rowNumber);
      }
      if (failedRows.length) {
        toast(updated + " " + t.products.imported + "; " + failedRows.length + " " + t.products.importFailed + " (" + failedRows.slice(0, 5).join(", ") + ")", "error");
      } else {
        toast(t.products.importSuccess.replace("{count}", String(updated)), "success");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : t.products.importFailed, "error");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  return (
    <AppShell title={t.products.title}>
      <div className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t.products.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PdfMenuImportButton />
            <Button variant="outline" onClick={exportProducts}>
              <Download className="h-4 w-4" />
              {t.products.exportProducts}
            </Button>
            <input ref={importInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importProducts} />
            <Button variant="outline" onClick={() => importInputRef.current?.click()} disabled={importing}>
              <Upload className="h-4 w-4" />
              {importing ? t.common.loading : t.products.importProducts}
            </Button>
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
          {filtered.map((p) => {
            const categoryName = categories.find((category) => category.id === p.categoryId)?.name.en ?? "";
            const menuPhoto = productMenuPhoto(p, categoryName);
            const hasCustomImage = isImageUrl(p.image) || Boolean(p.image?.startsWith("/"));
            return (
            <div
              key={p.id}
              className="group relative flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md sm:p-4"
            >
              <div className="flex h-28 w-full items-center justify-center overflow-hidden rounded-xl bg-muted text-4xl">
                {hasCustomImage ? (
                  <img src={p.image} alt="" className="h-full w-full object-cover" />
                ) : menuPhoto ? (
                  <div
                    aria-hidden="true"
                    className="h-full w-full bg-no-repeat"
                    style={{
                      backgroundImage: `url(${menuPhoto.src})`,
                      backgroundSize: `${menuPhoto.columns * 100}% ${menuPhoto.rows * 100}%`,
                      backgroundPosition: `${(menuPhoto.column / (menuPhoto.columns - 1)) * 100}% ${(menuPhoto.row / (menuPhoto.rows - 1)) * 100}%`,
                    }}
                  />
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
            );
          })}
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
