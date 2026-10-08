"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ChefHat, Download, FileSpreadsheet, ScrollText, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/layout/AppShell";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { ReceiveStockDialog } from "@/components/inventory/ReceiveStockDialog";
import { AdjustStockDialog } from "@/components/inventory/AdjustStockDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataStore } from "@/lib/store/useDataStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { formatMoney, formatNumber, cn, isImageUrl } from "@/lib/utils";
import { recipeCost, estimatedProfit, estimatedMargin } from "@/lib/inventory";
import { toast } from "@/components/ui/toast";
import type { InventoryItem, Product, RecipeIngredient } from "@/lib/types";

export default function RecipesPage() {
  const { t, locale } = useI18n();
  const products = useDataStore((s) => s.products);
  const inventoryItems = useDataStore((s) => s.inventoryItems);
  const stockMovements = useDataStore((s) => s.stockMovements);
  const settings = useDataStore((s) => s.settings);
  const updateProductRecipe = useDataStore((s) => s.updateProductRecipe);

  const [tab, setTab] = useState<"recipes" | "stock">("recipes");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventoryItem | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const rows = useMemo(() => {
    return products
      .filter((p) => p.isActive)
      .map((p) => ({
        product: p,
        cost: recipeCost(p, inventoryItems),
        profit: estimatedProfit(p, inventoryItems),
        margin: estimatedMargin(p, inventoryItems),
      }))
      .sort((a, b) => a.margin - b.margin);
  }, [products, inventoryItems]);

  const editing = editingIndex !== null ? rows[editingIndex]?.product ?? null : null;

  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setFormOpen(true);
  };

  const handleNavigate = (direction: "prev" | "next") => {
    if (editingIndex === null) return;
    const nextIndex = direction === "prev" ? editingIndex - 1 : editingIndex + 1;
    if (nextIndex >= 0 && nextIndex < rows.length) setEditingIndex(nextIndex);
  };

  const recipeSpreadsheetRows = (): Array<Record<string, string | number>> => products.flatMap<Record<string, string | number>>((product) => {
    const recipe = product.recipe ?? [];
    if (recipe.length === 0) {
      return [{
        "Product ID": product.id,
        "Product Name EN": product.name.en,
        "Product Name AR": product.name.ar,
        "Ingredient ID": "",
        "Ingredient Name EN": "",
        "Ingredient Name AR": "",
        Quantity: "",
        Unit: "",
        "Clear Recipe": "",
      }];
    }
    return recipe.map((ingredient) => {
      const item = inventoryItems.find((inventory) => inventory.id === ingredient.inventoryItemId);
      return {
        "Product ID": product.id,
        "Product Name EN": product.name.en,
        "Product Name AR": product.name.ar,
        "Ingredient ID": ingredient.inventoryItemId,
        "Ingredient Name EN": item?.name.en ?? "",
        "Ingredient Name AR": item?.name.ar ?? "",
        Quantity: ingredient.qty,
        Unit: item?.unit ?? "",
        "Clear Recipe": "",
      };
    });
  });

  const downloadRecipeTemplate = () => {
    const workbook = XLSX.utils.book_new();
    const headers = ["Product ID", "Product Name EN", "Product Name AR", "Ingredient ID", "Ingredient Name EN", "Ingredient Name AR", "Quantity", "Unit", "Clear Recipe"];
    // A recipe is represented by one row per ingredient. Repeat the product
    // identity across several blank rows so the user can add multiple stock
    // items to the same product without building rows from scratch.
    const templateRows = products.flatMap((product) => Array.from({ length: 12 }, () => ({
      "Product ID": product.id,
      "Product Name EN": product.name.en,
      "Product Name AR": product.name.ar,
      "Ingredient ID": "",
      "Ingredient Name EN": "",
      "Ingredient Name AR": "",
      Quantity: "",
      Unit: "",
      "Clear Recipe": "",
    })));
    const sheet = XLSX.utils.json_to_sheet(templateRows, { header: headers });
    XLSX.utils.book_append_sheet(workbook, sheet, "Recipes Template");
    const instructions = XLSX.utils.aoa_to_sheet([
      ["How to fill the recipes template"],
      ["Use one row for each ingredient in a product recipe."],
      ["Repeat the Product ID for every ingredient row of that product."],
      ["Ingredient ID is required. Ingredient names and Unit are for reference."],
      ["Quantity must be a number greater than zero, in the inventory item's unit."],
      ["Leave the blank ingredient row unchanged to skip that product."],
      ["Set Clear Recipe to YES to remove all ingredients from a product recipe."],
    ]);
    instructions["!cols"] = [{ wch: 92 }];
    XLSX.utils.book_append_sheet(workbook, instructions, "Instructions");
    XLSX.writeFile(workbook, "sanky-product-recipes-template.xlsx");
  };

  const exportRecipes = () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(recipeSpreadsheetRows());
    sheet["!cols"] = [{ wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, sheet, "Product Recipes");
    XLSX.writeFile(workbook, `sanky-product-recipes-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleRecipeImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error("The Excel file does not contain a worksheet.");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
      if (rows.length === 0) throw new Error("The Excel sheet is empty.");

      const recipeByProduct = new Map<string, RecipeIngredient[]>();
      const clearProducts = new Set<string>();
      const errors: string[] = [];
      const value = (row: Record<string, unknown>, key: string) => String(row[key] ?? "").trim();
      const matchName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;

      rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const productId = value(row, "Product ID");
        const productEn = value(row, "Product Name EN");
        const productAr = value(row, "Product Name AR");
        const ingredientId = value(row, "Ingredient ID");
        const ingredientEn = value(row, "Ingredient Name EN");
        const ingredientAr = value(row, "Ingredient Name AR");
        const quantityText = value(row, "Quantity");
        const clearRecipe = ["yes", "true", "1"].includes(value(row, "Clear Recipe").toLowerCase());
        if (!productId && !productEn && !productAr && !ingredientId && !ingredientEn && !ingredientAr && !quantityText) return;
        const product = products.find((candidate) => candidate.id === productId) ?? products.find((candidate) =>
          (productEn && matchName(candidate.name.en, productEn)) || (productAr && matchName(candidate.name.ar, productAr))
        );
        if (!product) {
          errors.push(`Row ${rowNumber}: product ID or name was not found.`);
          return;
        }
        if (clearRecipe) {
          if (ingredientId || ingredientEn || ingredientAr || quantityText) errors.push(`Row ${rowNumber}: Clear Recipe cannot be combined with an ingredient.`);
          else clearProducts.add(product.id);
          return;
        }
        if (!ingredientId && !ingredientEn && !ingredientAr && !quantityText) return;
        const ingredient = inventoryItems.find((candidate) => candidate.id === ingredientId) ?? inventoryItems.find((candidate) =>
          (ingredientEn && matchName(candidate.name.en, ingredientEn)) || (ingredientAr && matchName(candidate.name.ar, ingredientAr))
        );
        if (!ingredient) {
          errors.push(`Row ${rowNumber}: ingredient ID or name was not found.`);
          return;
        }
        const quantity = Number(quantityText);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          errors.push(`Row ${rowNumber}: quantity must be greater than zero.`);
          return;
        }
        const recipe = recipeByProduct.get(product.id) ?? [];
        if (recipe.some((entry) => entry.inventoryItemId === ingredient.id)) {
          errors.push(`Row ${rowNumber}: ingredient is repeated for ${product.name.en}.`);
          return;
        }
        recipe.push({ inventoryItemId: ingredient.id, qty: quantity });
        recipeByProduct.set(product.id, recipe);
      });

      for (const id of clearProducts) {
        if (recipeByProduct.has(id)) errors.push(`Product ${products.find((product) => product.id === id)?.name.en ?? id}: has both Clear Recipe and ingredient rows.`);
      }
      if (errors.length > 0) throw new Error(errors.slice(0, 5).join(" "));

      const updates = new Map(recipeByProduct);
      clearProducts.forEach((id) => updates.set(id, []));
      if (updates.size === 0) throw new Error("No recipe rows were found to import.");
      let saved = 0;
      for (const [productId, recipe] of updates) {
        await updateProductRecipe(productId, recipe);
        saved += 1;
      }
      toast(t.recipes.importSuccess.replace("{count}", String(saved)), "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : t.recipes.importFailed, "error");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  return (
    <AppShell title={t.recipes.title}>
      <div className="space-y-4 p-4 sm:p-6 pb-10">
        <p className="text-sm text-muted-foreground">{t.recipes.subtitle}</p>

        <div role="tablist" aria-label={t.recipes.title} className="flex w-full gap-2 overflow-x-auto rounded-xl border border-border bg-muted/40 p-1 sm:w-fit">
          <button role="tab" aria-selected={tab === "recipes"} onClick={() => setTab("recipes")} className={cn("flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors", tab === "recipes" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-card/60")}>
            <ChefHat className="h-4 w-4" />{t.recipes.recipeSheet}
          </button>
          <button role="tab" aria-selected={tab === "stock"} onClick={() => setTab("stock")} className={cn("flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors", tab === "stock" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-card/60")}>
            <ScrollText className="h-4 w-4" />{t.recipes.stockSheet}
          </button>
        </div>

        {tab === "recipes" && (
          <>
          <div className="flex flex-wrap justify-end gap-2">
            <input ref={importInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleRecipeImport} />
            <Button variant="outline" onClick={exportRecipes}><Download className="h-4 w-4" />{t.recipes.exportRecipes}</Button>
            <Button variant="outline" onClick={downloadRecipeTemplate}><FileSpreadsheet className="h-4 w-4" />{t.recipes.downloadTemplate}</Button>
            <Button onClick={() => importInputRef.current?.click()} disabled={importing}><Upload className="h-4 w-4" />{importing ? t.common.loading : t.recipes.importRecipes}</Button>
          </div>
          {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
            <ChefHat className="h-10 w-10 opacity-30" />
            <p className="text-sm">{t.common.noResults}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border divide-y divide-border">
            {rows.map(({ product, cost, profit, margin }, index) => (
              <button
                key={product.id}
                onClick={() => handleEdit(index)}
                className="flex w-full items-center justify-between gap-3 bg-card px-4 py-3.5 text-start hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isImageUrl(product.image) ? (
                    <img src={product.image} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="text-lg shrink-0">{product.image}</span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{bilingual(product.name, locale)}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.products.recipeCost}: {formatMoney(cost, settings.currencySymbol)} · {t.common.price}:{" "}
                      {formatMoney(product.price, settings.currencySymbol)}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-end">
                  <p className={cn("text-sm font-bold", profit >= 0 ? "text-success" : "text-destructive")}>
                    {formatMoney(profit, settings.currencySymbol)}
                  </p>
                  <p className={cn("text-xs", margin >= 0 ? "text-muted-foreground" : "text-destructive")}>
                    {margin.toFixed(1)}%
                  </p>
                </div>
              </button>
            ))}
          </div>
          )}
          </>
        )}

        {tab === "stock" && (
          <div className="space-y-5">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t.recipes.stockSheet}</CardTitle>
                <p className="text-sm text-muted-foreground">{t.recipes.stockSheetHint}</p>
              </CardHeader>
              <CardContent className="p-0">
                {inventoryItems.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">{t.common.noResults}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead className="border-y border-border bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 text-start font-medium">{t.inventory.title}</th>
                          <th className="px-4 py-3 text-end font-medium">{t.inventory.currentStock}</th>
                          <th className="px-4 py-3 text-end font-medium">{t.recipes.actions}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inventoryItems.map((item) => (
                          <tr key={item.id} className="border-b border-border/60 last:border-0">
                            <td className="px-4 py-3 font-medium">{bilingual(item.name, locale)}</td>
                            <td className="px-4 py-3 text-end tabular-nums">{formatNumber(item.quantity, 0, 3)} {item.unit ?? t.inventory.pieceUnit}</td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={() => { setSelectedInventoryItem(item); setReceiveOpen(true); }}>
                                  <ArrowDownToLine className="h-3.5 w-3.5" />{t.recipes.receiveMaterial}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setSelectedInventoryItem(item); setAdjustOpen(true); }}>
                                  <ArrowUpFromLine className="h-3.5 w-3.5" />{t.recipes.issueMaterial}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">{t.recipes.movementHistory}</CardTitle></CardHeader>
              <CardContent className="p-0">
                {stockMovements.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">{t.recipes.noMovements}</p>
                ) : (
                  <div className="max-h-[520px] overflow-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="sticky top-0 border-y border-border bg-card text-xs text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 text-start font-medium">{t.expenses.date}</th>
                          <th className="px-4 py-3 text-start font-medium">{t.inventory.title}</th>
                          <th className="px-4 py-3 text-end font-medium">{t.recipes.stockIn}</th>
                          <th className="px-4 py-3 text-end font-medium">{t.recipes.stockOut}</th>
                          <th className="px-4 py-3 text-start font-medium">{t.inventory.reason}</th>
                          <th className="px-4 py-3 text-start font-medium">{t.purchases.employee}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stockMovements.map((movement) => {
                          const item = inventoryItems.find((candidate) => candidate.id === movement.inventoryItemId);
                          const name = movement.itemName ? bilingual(movement.itemName, locale) : item ? bilingual(item.name, locale) : t.inventory.unknownItem;
                          const reason = t.inventory.reasons[movement.reason];
                          return (
                            <tr key={movement.id} className="border-b border-border/60 last:border-0">
                              <td className="px-4 py-3 text-muted-foreground">{new Date(movement.createdAt).toLocaleString(locale === "ar" ? "ar-EG" : "en-US")}</td>
                              <td className="px-4 py-3 font-medium">{name}</td>
                              <td className="px-4 py-3 text-end tabular-nums text-success">{movement.quantityDelta > 0 ? `+${formatNumber(movement.quantityDelta, 0, 3)}` : "—"}</td>
                              <td className="px-4 py-3 text-end tabular-nums text-destructive">{movement.quantityDelta < 0 ? formatNumber(Math.abs(movement.quantityDelta), 0, 3) : "—"}</td>
                              <td className="px-4 py-3">{reason}</td>
                              <td className="px-4 py-3 text-muted-foreground">{movement.employeeName}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <ProductFormDialog
        product={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
        onNavigate={handleNavigate}
        hasPrev={editingIndex !== null && editingIndex > 0}
        hasNext={editingIndex !== null && editingIndex < rows.length - 1}
      />
      <ReceiveStockDialog item={selectedInventoryItem} open={receiveOpen} onOpenChange={setReceiveOpen} />
      <AdjustStockDialog item={selectedInventoryItem} open={adjustOpen} onOpenChange={setAdjustOpen} />
    </AppShell>
  );
}
