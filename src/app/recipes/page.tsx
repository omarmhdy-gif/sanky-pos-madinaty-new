"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Boxes, CheckCircle2, ChefHat, CircleAlert, Download, FileSpreadsheet, Package, Search, ScrollText, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/layout/AppShell";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { DateFilterBar } from "@/components/shared/DateFilterBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataStore } from "@/lib/store/useDataStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { formatMoney, formatNumber, cn } from "@/lib/utils";
import { recipeCost, estimatedProfit, estimatedMargin } from "@/lib/inventory";
import { dateRangeForFilter, ordersInDateRange, type DateFilterKey } from "@/lib/analytics";
import { toast } from "@/components/ui/toast";
import type { RecipeIngredient } from "@/lib/types";

export default function RecipesPage() {
  const { t, locale } = useI18n();
  const products = useDataStore((s) => s.products);
  const inventoryItems = useDataStore((s) => s.inventoryItems);
  const stockMovements = useDataStore((s) => s.stockMovements);
  const purchases = useDataStore((s) => s.purchases);
  const orders = useDataStore((s) => s.orders);
  const settings = useDataStore((s) => s.settings);
  const updateProductRecipe = useDataStore((s) => s.updateProductRecipe);
  const fetchOrdersInRange = useDataStore((s) => s.fetchOrdersInRange);

  const [tab, setTab] = useState<"recipes" | "inventory" | "consumption" | "movements">("recipes");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeFilter, setRecipeFilter] = useState<"all" | "configured" | "missing">("all");
  const [inventorySearch, setInventorySearch] = useState("");
  const [movementSearch, setMovementSearch] = useState("");
  const [productUsageSearch, setProductUsageSearch] = useState("");
  const [ingredientUsageSearch, setIngredientUsageSearch] = useState("");
  const [consumptionDateFilter, setConsumptionDateFilter] = useState<DateFilterKey>("month");
  const [consumptionCustomFrom, setConsumptionCustomFrom] = useState("");
  const [consumptionCustomTo, setConsumptionCustomTo] = useState("");
  const [movementDateFilter, setMovementDateFilter] = useState<DateFilterKey>("month");
  const [movementCustomFrom, setMovementCustomFrom] = useState("");
  const [movementCustomTo, setMovementCustomTo] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const consumptionDateRange = useMemo(() => dateRangeForFilter(
    consumptionDateFilter,
    consumptionCustomFrom ? new Date(consumptionCustomFrom) : undefined,
    consumptionCustomTo ? new Date(consumptionCustomTo) : undefined
  ), [consumptionDateFilter, consumptionCustomFrom, consumptionCustomTo]);

  useEffect(() => {
    if (consumptionDateFilter === "all") {
      fetchOrdersInRange(new Date(0), new Date());
    } else if (consumptionDateRange) {
      fetchOrdersInRange(consumptionDateRange.from, consumptionDateRange.to);
    }
  }, [consumptionDateFilter, consumptionCustomFrom, consumptionCustomTo, consumptionDateRange, fetchOrdersInRange]);

  const movementDateRange = useMemo(() => dateRangeForFilter(
    movementDateFilter,
    movementCustomFrom ? new Date(movementCustomFrom) : undefined,
    movementCustomTo ? new Date(movementCustomTo) : undefined
  ), [movementDateFilter, movementCustomFrom, movementCustomTo]);

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

  const recipeStats = useMemo(() => {
    const configured = rows.filter(({ product }) => (product.recipe?.length ?? 0) > 0).length;
    return {
      configured,
      missing: rows.length - configured,
      ingredientCount: inventoryItems.length,
    };
  }, [rows, inventoryItems]);

  const visibleRows = useMemo(() => {
    const query = recipeSearch.trim().toLocaleLowerCase();
    return rows.filter(({ product }) => {
      const ingredients = product.recipe ?? [];
      if (recipeFilter === "configured" && ingredients.length === 0) return false;
      if (recipeFilter === "missing" && ingredients.length > 0) return false;
      if (!query) return true;
      const productMatch = `${product.name.en} ${product.name.ar}`.toLocaleLowerCase().includes(query);
      const ingredientMatch = ingredients.some((entry) => {
        const item = inventoryItems.find((candidate) => candidate.id === entry.inventoryItemId);
        return item && `${item.name.en} ${item.name.ar}`.toLocaleLowerCase().includes(query);
      });
      return productMatch || ingredientMatch;
    });
  }, [rows, recipeSearch, recipeFilter, inventoryItems]);

  const purchasesByItem = useMemo(() => {
    const map = new Map<string, (typeof purchases)[number]>();
    for (const purchase of purchases) {
      const current = map.get(purchase.inventoryItemId);
      if (!current || new Date(purchase.createdAt).getTime() > new Date(current.createdAt).getTime()) {
        map.set(purchase.inventoryItemId, purchase);
      }
    }
    return map;
  }, [purchases]);

  const rangeMovements = useMemo(() => movementDateFilter === "custom" && !movementDateRange
    ? []
    : !movementDateRange ? stockMovements : stockMovements.filter((movement) => {
        const created = new Date(movement.createdAt);
        return created >= movementDateRange.from && created <= movementDateRange.to;
      }), [stockMovements, movementDateRange, movementDateFilter]);

  const inventoryStats = useMemo(() => ({
    itemCount: inventoryItems.length,
    lowStock: inventoryItems.filter((item) => item.criticalThreshold !== undefined && item.quantity <= item.criticalThreshold).length,
    inventoryValue: inventoryItems.reduce((sum, item) => sum + item.quantity * (item.lastPurchaseCost ?? 0), 0),
  }), [inventoryItems]);

  const movementStats = useMemo(() => ({
    movementCount: rangeMovements.length,
    stockIn: rangeMovements.reduce((sum, movement) => sum + Math.max(0, movement.quantityDelta), 0),
    stockOut: rangeMovements.reduce((sum, movement) => sum + Math.max(0, -movement.quantityDelta), 0),
  }), [rangeMovements]);

  const visibleInventoryItems = useMemo(() => {
    const query = inventorySearch.trim().toLocaleLowerCase();
    if (!query) return inventoryItems;
    return inventoryItems.filter((item) => `${item.name.en} ${item.name.ar}`.toLocaleLowerCase().includes(query));
  }, [inventoryItems, inventorySearch]);

  const visibleMovements = useMemo(() => {
    const query = movementSearch.trim().toLocaleLowerCase();
    if (!query) return rangeMovements;
    return rangeMovements.filter((movement) => {
      const item = inventoryItems.find((candidate) => candidate.id === movement.inventoryItemId);
      const name = movement.itemName ? `${movement.itemName.en} ${movement.itemName.ar}` : item ? `${item.name.en} ${item.name.ar}` : "";
      return `${name} ${movement.employeeName} ${movement.reason} ${movement.orderId ?? ""}`.toLocaleLowerCase().includes(query);
    });
  }, [rangeMovements, inventoryItems, movementSearch]);

  const productConsumptionRows = useMemo(() => {
    if (consumptionDateFilter === "custom" && !consumptionDateRange) return [];
    const soldByProduct = new Map<string, number>();
    for (const order of ordersInDateRange(orders, consumptionDateRange)) {
      for (const line of order.lines) {
        soldByProduct.set(line.productId, (soldByProduct.get(line.productId) ?? 0) + line.qty);
      }
    }

    return products.flatMap((product) => (product.recipe ?? []).flatMap((ingredient) => {
      const item = inventoryItems.find((candidate) => candidate.id === ingredient.inventoryItemId);
      if (!item) return [];
      const soldQty = soldByProduct.get(product.id) ?? 0;
      const consumedQty = ingredient.qty * soldQty;
      return [{
        product,
        item,
        recipeQty: ingredient.qty,
        soldQty,
        consumedQty,
        cost: consumedQty * (item.lastPurchaseCost ?? 0),
      }];
    }));
  }, [products, inventoryItems, orders, consumptionDateRange, consumptionDateFilter]);

  const visibleProductConsumption = useMemo(() => {
    const productQuery = productUsageSearch.trim().toLocaleLowerCase();
    const ingredientQuery = ingredientUsageSearch.trim().toLocaleLowerCase();
    return productConsumptionRows.filter(({ product, item }) => {
      const productMatches = !productQuery || `${product.name.en} ${product.name.ar}`.toLocaleLowerCase().includes(productQuery);
      const ingredientMatches = !ingredientQuery || `${item.name.en} ${item.name.ar}`.toLocaleLowerCase().includes(ingredientQuery);
      return productMatches && ingredientMatches;
    });
  }, [productConsumptionRows, productUsageSearch, ingredientUsageSearch]);

  const consumptionStats = useMemo(() => ({
    products: new Set(productConsumptionRows.filter((row) => row.soldQty > 0).map((row) => row.product.id)).size,
    ingredients: new Set(productConsumptionRows.filter((row) => row.soldQty > 0).map((row) => row.item.id)).size,
    totalCost: productConsumptionRows.reduce((sum, row) => sum + row.cost, 0),
  }), [productConsumptionRows]);

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

        <div role="tablist" aria-label={t.recipes.title} className="flex w-full flex-wrap gap-1.5 rounded-xl border border-border bg-muted/40 p-1 sm:w-fit">
          <button role="tab" aria-selected={tab === "recipes"} onClick={() => setTab("recipes")} className={cn("flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors", tab === "recipes" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-card/60")}>
            <ChefHat className="h-4 w-4" />{t.recipes.recipeSheet}
          </button>
          <button role="tab" aria-selected={tab === "inventory"} onClick={() => setTab("inventory")} className={cn("flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors", tab === "inventory" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-card/60")}>
            <Package className="h-4 w-4" />{t.recipes.inventoryReport}
          </button>
          <button role="tab" aria-selected={tab === "consumption"} onClick={() => setTab("consumption")} className={cn("flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors", tab === "consumption" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-card/60")}>
            <Boxes className="h-4 w-4" />{t.recipes.productConsumption}
          </button>
          <button role="tab" aria-selected={tab === "movements"} onClick={() => setTab("movements")} className={cn("flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors", tab === "movements" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-card/60")}>
            <ScrollText className="h-4 w-4" />{t.recipes.movementHistory}
          </button>
        </div>

        {tab === "recipes" && (
          <>
            <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/10 via-card to-card">
              <CardContent className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
                {[
                  { label: t.recipes.configuredRecipes, value: recipeStats.configured, Icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400" },
                  { label: t.recipes.missingRecipes, value: recipeStats.missing, Icon: CircleAlert, tone: recipeStats.missing ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground" },
                  { label: t.recipes.ingredientCount, value: recipeStats.ingredientCount, Icon: Boxes, tone: "text-violet-600 dark:text-violet-400" },
                ].map(({ label, value, Icon, tone }) => (
                  <div key={label} className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background/70 px-3 py-2.5">
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted/70", tone)}><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0"><p className="truncate text-xs text-muted-foreground">{label}</p><p className="mt-0.5 text-lg font-bold tabular-nums">{formatNumber(value)}</p></div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.recipes.recipeFilters}>
                  {([
                    ["all", t.recipes.allProducts],
                    ["configured", t.recipes.configuredRecipes],
                    ["missing", t.recipes.missingRecipes],
                  ] as const).map(([key, label]) => (
                    <Button key={key} size="sm" variant={recipeFilter === key ? "default" : "outline"} onClick={() => setRecipeFilter(key)} aria-pressed={recipeFilter === key}>
                      {label}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                  <div className="relative min-w-0 flex-1">
                    <span className="pointer-events-none absolute start-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md bg-primary/10 text-primary"><Search className="h-4 w-4" /></span>
                    <Input value={recipeSearch} onChange={(event) => setRecipeSearch(event.target.value)} placeholder={t.recipes.searchProducts} aria-label={t.recipes.searchProducts} className="ps-11" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input ref={importInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleRecipeImport} />
                    <Button size="sm" variant="outline" onClick={exportRecipes}><Download className="h-4 w-4" />{t.recipes.exportRecipes}</Button>
                    <Button size="sm" variant="outline" onClick={downloadRecipeTemplate}><FileSpreadsheet className="h-4 w-4" />{t.recipes.downloadTemplate}</Button>
                    <Button size="sm" onClick={() => importInputRef.current?.click()} disabled={importing}><Upload className="h-4 w-4" />{importing ? t.common.loading : t.recipes.importRecipes}</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {rows.length === 0 || visibleRows.length === 0 ? (
              <Card>
                <CardContent className="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                  <ChefHat className="h-10 w-10 opacity-40" />
                  <p className="text-sm">{rows.length === 0 ? t.common.noResults : t.recipes.noMatchingProducts}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {visibleRows.map(({ product, cost, profit, margin }) => {
                  const index = rows.findIndex((row) => row.product.id === product.id);
                  const ingredientCount = product.recipe?.length ?? 0;
                  const hasRecipe = ingredientCount > 0;
                  return (
                    <button
                      key={product.id}
                      onClick={() => handleEdit(index)}
                      className="group flex min-h-36 flex-col rounded-xl border border-border bg-card p-3 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex w-full min-w-0 items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold group-hover:text-primary">{bilingual(product.name, locale)}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{hasRecipe ? t.recipes.ingredientCountLabel.replace("{count}", formatNumber(ingredientCount)) : t.recipes.missingRecipes}</p>
                        </div>
                        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold", hasRecipe ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300")}>
                          {hasRecipe ? <CheckCircle2 className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}{hasRecipe ? t.recipes.configuredStatus : t.recipes.missingStatus}
                        </span>
                      </div>
                      <div className="mt-auto grid w-full grid-cols-3 gap-2 border-t border-border/70 pt-2.5">
                        <div className="min-w-0"><p className="truncate text-[10px] text-muted-foreground">{t.products.recipeCost}</p><p className="mt-1 truncate text-xs font-semibold tabular-nums">{formatMoney(cost, settings.currencySymbol)}</p></div>
                        <div className="min-w-0"><p className="truncate text-[10px] text-muted-foreground">{t.products.estimatedProfit}</p><p className={cn("mt-1 truncate text-xs font-semibold tabular-nums", profit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>{formatMoney(profit, settings.currencySymbol)}</p></div>
                        <div className="min-w-0 text-end"><p className="truncate text-[10px] text-muted-foreground">{t.products.estimatedMargin}</p><p className={cn("mt-1 truncate text-xs font-bold tabular-nums", margin >= 0 ? "text-primary" : "text-destructive")}>{margin.toFixed(1)}%</p></div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === "inventory" && (
          <div className="space-y-4">
            <Card className="border-primary/15 bg-gradient-to-br from-primary/10 via-card to-card">
              <CardContent className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
                {[
                  { label: t.recipes.inventoryItemsCount, value: formatNumber(inventoryStats.itemCount), Icon: Package, tone: "text-primary" },
                  { label: t.recipes.lowStockItems, value: formatNumber(inventoryStats.lowStock), Icon: CircleAlert, tone: inventoryStats.lowStock ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400" },
                  { label: t.recipes.inventoryValue, value: formatMoney(inventoryStats.inventoryValue, settings.currencySymbol), Icon: Boxes, tone: "text-violet-600 dark:text-violet-400" },
                ].map(({ label, value, Icon, tone }) => (
                  <div key={label} className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/70 px-3.5 py-3">
                    <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted/70", tone)}><Icon className="h-5 w-5" /></span>
                    <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 truncate text-lg font-bold tabular-nums">{value}</p></div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div><CardTitle className="text-base">{t.recipes.inventoryReport}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{t.recipes.inventoryReportHint}</p></div>
                  <div className="relative w-full md:max-w-sm">
                    <span className="pointer-events-none absolute start-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md bg-primary/10 text-primary"><Search className="h-4 w-4" /></span>
                    <Input value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} placeholder={t.recipes.searchMaterials} aria-label={t.recipes.searchMaterials} className="ps-11" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {visibleInventoryItems.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">{t.common.noResults}</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] text-sm">
                      <thead className="border-y border-border bg-muted/40 text-xs text-muted-foreground"><tr>
                        <th className="px-4 py-3 text-start font-medium">{t.inventory.title}</th>
                        <th className="px-4 py-3 text-end font-medium">{t.inventory.currentStock}</th>
                        <th className="px-4 py-3 text-end font-medium">{t.recipes.costPerUnit}</th>
                        <th className="px-4 py-3 text-end font-medium">{t.recipes.stockValue}</th>
                        <th className="px-4 py-3 text-start font-medium">{t.recipes.lastPurchase}</th>
                      </tr></thead>
                      <tbody>{visibleInventoryItems.map((item) => {
                        const isLow = item.criticalThreshold !== undefined && item.quantity <= item.criticalThreshold;
                        const latestPurchase = purchasesByItem.get(item.id);
                        const purchaseUnit = latestPurchase?.purchaseUnit ?? item.purchaseUnit ?? item.unit ?? t.inventory.pieceUnit;
                        return <tr key={item.id} className="border-b border-border/60 last:border-0">
                          <td className="px-4 py-3"><p className="font-medium">{bilingual(item.name, locale)}</p>{item.purchaseUnit && item.type === "measured" && <p className="mt-0.5 text-xs text-muted-foreground">{t.recipes.purchaseUnit}: {item.purchaseUnit} · 1 {item.purchaseUnit} = {formatNumber(item.conversionFactor ?? 1)} {item.unit ?? t.inventory.pieceUnit}</p>}</td>
                          <td className="px-4 py-3 text-end tabular-nums"><span className={cn("font-semibold", isLow && "text-amber-700 dark:text-amber-300")}>{formatNumber(item.quantity, 0, 3)} {item.unit ?? t.inventory.pieceUnit}</span>{isLow && <span className="ms-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">{t.recipes.lowStockBadge}</span>}</td>
                          <td className="px-4 py-3 text-end tabular-nums">{formatMoney(item.lastPurchaseCost ?? 0, settings.currencySymbol)}<p className="text-xs text-muted-foreground">/ {item.unit ?? t.inventory.pieceUnit}</p></td>
                          <td className="px-4 py-3 text-end font-semibold tabular-nums">{formatMoney(item.quantity * (item.lastPurchaseCost ?? 0), settings.currencySymbol)}</td>
                          <td className="px-4 py-3">{latestPurchase ? <><p className="font-medium">{new Date(latestPurchase.createdAt).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US")}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatNumber(latestPurchase.purchaseQuantity ?? latestPurchase.quantity, 0, 3)} {purchaseUnit} · {t.recipes.purchaseTotal}: {formatMoney(latestPurchase.totalCost, settings.currencySymbol)}</p><p className="text-xs text-muted-foreground">{latestPurchase.supplier || latestPurchase.employeeName || "—"}</p></> : <span className="text-muted-foreground">{t.recipes.noPurchase}</span>}</td>
                        </tr>;
                      })}</tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "consumption" && (
          <div className="space-y-4">
            <DateFilterBar filter={consumptionDateFilter} onFilterChange={setConsumptionDateFilter} customFrom={consumptionCustomFrom} customTo={consumptionCustomTo} onCustomChange={(from, to) => { setConsumptionCustomFrom(from); setConsumptionCustomTo(to); }} />
            <Card className="border-primary/15 bg-gradient-to-br from-primary/10 via-card to-card">
              <CardContent className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
                {[
                  { label: t.recipes.productsSold, value: formatNumber(consumptionStats.products), Icon: Package, tone: "text-primary" },
                  { label: t.recipes.ingredientsUsed, value: formatNumber(consumptionStats.ingredients), Icon: Boxes, tone: "text-violet-600 dark:text-violet-400" },
                  { label: t.recipes.estimatedConsumptionCost, value: formatMoney(consumptionStats.totalCost, settings.currencySymbol), Icon: ScrollText, tone: "text-emerald-600 dark:text-emerald-400" },
                ].map(({ label, value, Icon, tone }) => <div key={label} className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/70 px-3.5 py-3"><span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted/70", tone)}><Icon className="h-5 w-5" /></span><div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 truncate text-lg font-bold tabular-nums">{value}</p></div></div>)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t.recipes.productConsumption}</CardTitle>
                <p className="text-sm text-muted-foreground">{t.recipes.productConsumptionHint}</p>
                <div className="grid gap-2 pt-2 md:grid-cols-2">
                  <div className="relative"><span className="pointer-events-none absolute start-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md bg-primary/10 text-primary"><Search className="h-4 w-4" /></span><Input value={productUsageSearch} onChange={(event) => setProductUsageSearch(event.target.value)} placeholder={t.recipes.searchProducts} aria-label={t.recipes.searchProducts} className="ps-11" /></div>
                  <div className="relative"><span className="pointer-events-none absolute start-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md bg-primary/10 text-primary"><Search className="h-4 w-4" /></span><Input value={ingredientUsageSearch} onChange={(event) => setIngredientUsageSearch(event.target.value)} placeholder={t.recipes.searchMaterials} aria-label={t.recipes.searchMaterials} className="ps-11" /></div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {visibleProductConsumption.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">{t.recipes.noConsumption}</p> : <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="border-y border-border bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-start font-medium">{t.products.title}</th><th className="px-4 py-3 text-start font-medium">{t.inventory.title}</th><th className="px-4 py-3 text-end font-medium">{t.recipes.recipeQuantity}</th><th className="px-4 py-3 text-end font-medium">{t.recipes.soldQuantity}</th><th className="px-4 py-3 text-end font-medium">{t.recipes.consumedQuantity}</th><th className="px-4 py-3 text-end font-medium">{t.recipes.estimatedConsumptionCost}</th></tr></thead>
                    <tbody>{visibleProductConsumption.map((row) => <tr key={`${row.product.id}:${row.item.id}`} className="border-b border-border/60 last:border-0"><td className="px-4 py-3 font-medium">{bilingual(row.product.name, locale)}</td><td className="px-4 py-3">{bilingual(row.item.name, locale)}</td><td className="px-4 py-3 text-end tabular-nums">{formatNumber(row.recipeQty, 0, 3)} {row.item.unit ?? t.inventory.pieceUnit}</td><td className="px-4 py-3 text-end tabular-nums">{formatNumber(row.soldQty, 0, 3)}</td><td className="px-4 py-3 text-end font-medium tabular-nums">{formatNumber(row.consumedQty, 0, 3)} {row.item.unit ?? t.inventory.pieceUnit}</td><td className="px-4 py-3 text-end font-semibold tabular-nums">{formatMoney(row.cost, settings.currencySymbol)}</td></tr>)}</tbody>
                  </table>
                </div>}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "movements" && (
          <div className="space-y-4">
            <DateFilterBar filter={movementDateFilter} onFilterChange={setMovementDateFilter} customFrom={movementCustomFrom} customTo={movementCustomTo} onCustomChange={(from, to) => { setMovementCustomFrom(from); setMovementCustomTo(to); }} />
            <Card className="border-primary/15 bg-gradient-to-br from-primary/10 via-card to-card">
              <CardContent className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
                {[
                  { label: t.recipes.movementCount, value: formatNumber(movementStats.movementCount), Icon: ScrollText, tone: "text-primary" },
                  { label: t.recipes.inboundMovements, value: formatNumber(rangeMovements.filter((movement) => movement.quantityDelta > 0).length), Icon: Package, tone: "text-emerald-600 dark:text-emerald-400" },
                  { label: t.recipes.outboundMovements, value: formatNumber(rangeMovements.filter((movement) => movement.quantityDelta < 0).length), Icon: Boxes, tone: "text-amber-600 dark:text-amber-400" },
                ].map(({ label, value, Icon, tone }) => <div key={label} className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/70 px-3.5 py-3"><span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted/70", tone)}><Icon className="h-5 w-5" /></span><div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 truncate text-lg font-bold tabular-nums">{value}</p></div></div>)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div><CardTitle className="text-base">{t.recipes.movementHistory}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{t.recipes.movementHistoryHint}</p></div>
                  <div className="relative w-full md:max-w-sm"><span className="pointer-events-none absolute start-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md bg-primary/10 text-primary"><Search className="h-4 w-4" /></span><Input value={movementSearch} onChange={(event) => setMovementSearch(event.target.value)} placeholder={t.recipes.searchMaterials} aria-label={t.recipes.searchMaterials} className="ps-11" /></div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {visibleMovements.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">{t.recipes.noMovements}</p> : <div className="max-h-[520px] overflow-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="sticky top-0 border-y border-border bg-card text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-start font-medium">{t.expenses.date}</th><th className="px-4 py-3 text-start font-medium">{t.inventory.title}</th><th className="px-4 py-3 text-end font-medium">{t.recipes.stockIn}</th><th className="px-4 py-3 text-end font-medium">{t.recipes.stockOut}</th><th className="px-4 py-3 text-start font-medium">{t.inventory.reason}</th><th className="px-4 py-3 text-start font-medium">{t.purchases.employee}</th></tr></thead>
                    <tbody>{visibleMovements.map((movement) => {
                      const item = inventoryItems.find((candidate) => candidate.id === movement.inventoryItemId);
                      const name = movement.itemName ? bilingual(movement.itemName, locale) : item ? bilingual(item.name, locale) : t.inventory.unknownItem;
                      const reason = t.inventory.reasons[movement.reason];
                      return <tr key={movement.id} className="border-b border-border/60 last:border-0"><td className="px-4 py-3 text-muted-foreground">{new Date(movement.createdAt).toLocaleString(locale === "ar" ? "ar-EG" : "en-US")}</td><td className="px-4 py-3 font-medium">{name}</td><td className="px-4 py-3 text-end tabular-nums text-success">{movement.quantityDelta > 0 ? `+${formatNumber(movement.quantityDelta, 0, 3)} ${item?.unit ?? t.inventory.pieceUnit}` : "—"}</td><td className="px-4 py-3 text-end tabular-nums text-destructive">{movement.quantityDelta < 0 ? `${formatNumber(Math.abs(movement.quantityDelta), 0, 3)} ${item?.unit ?? t.inventory.pieceUnit}` : "—"}</td><td className="px-4 py-3">{reason}</td><td className="px-4 py-3 text-muted-foreground">{movement.employeeName}{movement.orderId && <p className="mt-0.5 text-xs">{t.orders.orderNumber} #{movement.orderId.slice(0, 8)}</p>}</td></tr>;
                    })}</tbody>
                  </table>
                </div>}
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
    </AppShell>
  );
}
