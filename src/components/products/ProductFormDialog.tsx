"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2, Upload, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useDataStore } from "@/lib/store/useDataStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { formatMoney, isImageUrl } from "@/lib/utils";
import { ingredientCost, recipeCategoryBucket, defaultCoffeeRecipe } from "@/lib/inventory";
import { uploadImage } from "@/lib/supabase/api";
import { copyRecipeToClipboard, readRecipeClipboard } from "@/lib/recipeClipboard";
import type { Product, RecipeIngredient } from "@/lib/types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EMOJI_OPTIONS = ["☕", "🥛", "🧊", "🥤", "🧋", "🍫", "🥐", "🧁", "🥮", "🍥", "🍰", "🍮", "🍪", "🥪", "🥑", "🥯", "🍋", "🍓"];

export function ProductFormDialog({
  product,
  open,
  onOpenChange,
  onNavigate,
  hasPrev,
  hasNext,
  onSaveAndNext,
}: {
  product: Product | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Only passed by the Recipes page — lets the owner move between products
   * without closing and reopening this dialog from the list every time. */
  onNavigate?: (direction: "prev" | "next") => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  /** Only passed by the Products page — called after successfully saving an
   * EXISTING product instead of closing the dialog, so the parent can
   * advance `product` to the next item in its filtered list (or close if
   * there isn't one) for fast bulk recipe entry. Adding a brand-new product
   * always just closes, regardless of this prop. */
  onSaveAndNext?: () => void;
}) {
  const { t, locale } = useI18n();
  const categories = useDataStore((s) => s.categories);
  const modifierGroups = useDataStore((s) => s.modifierGroups);
  const inventoryItems = useDataStore((s) => s.inventoryItems);
  const settings = useDataStore((s) => s.settings);
  const addProduct = useDataStore((s) => s.addProduct);
  const updateProduct = useDataStore((s) => s.updateProduct);
  const addInventoryItem = useDataStore((s) => s.addInventoryItem);
  const role = useAuthStore((s) => s.currentUser?.role);

  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [price, setPrice] = useState("");
  const [secondaryPrice, setSecondaryPrice] = useState("");
  const [image, setImage] = useState("☕");
  const [recipe, setRecipe] = useState<RecipeIngredient[]>([]);
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [recipeSynced, setRecipeSynced] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [selectedModGroups, setSelectedModGroups] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const defaultCategoryId = product?.categoryId ?? categories[0]?.id ?? "";
      setNameEn(product?.name.en ?? "");
      setNameAr(product?.name.ar ?? "");
      setCategoryId(defaultCategoryId);
      setPrice(product ? String(product.price) : "");
      setSecondaryPrice(product?.secondaryPrice != null ? String(product.secondaryPrice) : "");
      setImage(product?.image ?? "☕");
      // Only suggest a starting recipe for brand-new products — never
      // overwrites an existing product's recipe, and only computed once
      // on open so it can't clobber an in-progress manual edit. Detection
      // is purely category-based (never the product's own name).
      if (product) {
        setRecipe(product.recipe ?? []);
      } else {
        const categoryName = categories.find((c) => c.id === defaultCategoryId)?.name.en ?? "";
        const bucket = recipeCategoryBucket(categoryName);
        setRecipe(bucket === "coffee" ? defaultCoffeeRecipe(inventoryItems) : []);
      }
      setSku(product?.sku ?? "");
      setBarcode(product?.barcode ?? "");
      setRecipeSynced(product?.recipeSynced ?? false);
      setIsActive(product?.isActive ?? true);
      setSelectedModGroups(product?.modifierGroupIds ?? []);
    }
  }, [open, product, categories, inventoryItems]);

  // Re-suggests the category-based default recipe when the category changes
  // while creating a new product (before anything's been saved) — e.g.
  // picking "Hot Coffee" after initially landing on a non-coffee default.
  const handleCategoryChange = (v: string) => {
    setCategoryId(v);
    if (!product) {
      const categoryName = categories.find((c) => c.id === v)?.name.en ?? "";
      const bucket = recipeCategoryBucket(categoryName);
      setRecipe(bucket === "coffee" ? defaultCoffeeRecipe(inventoryItems) : []);
    }
  };

  const toggleModGroup = (id: string) => {
    setSelectedModGroups((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  };

  const addIngredientRow = () => {
    if (inventoryItems.length === 0) return;
    setRecipe((prev) => [...prev, { inventoryItemId: inventoryItems[0].id, qty: 0 }]);
  };
  const updateIngredientRow = (idx: number, patch: Partial<RecipeIngredient>) => {
    setRecipe((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const removeIngredientRow = (idx: number) => {
    setRecipe((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCopyRecipe = () => {
    copyRecipeToClipboard(recipe);
    toast(t.products.ingredientsCopied, "success");
  };

  const handlePasteRecipe = () => {
    const clipboard = readRecipeClipboard();
    if (!clipboard || clipboard.length === 0) {
      toast(t.products.noIngredientsToPaste, "error");
      return;
    }
    const valid = clipboard.filter((ing) => inventoryItems.some((i) => i.id === ing.inventoryItemId));
    setRecipe(valid);
    toast(t.products.ingredientsPasted, "success");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > MAX_IMAGE_BYTES) {
      toast(t.products.imageUploadError, "error");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadImage(file, "products");
      setImage(url);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  };

  // Live cost/margin — recomputed on every render from current average costs
  // and the in-progress recipe/price, so it's never a stale cached value.
  const parsedPrice = parseFloat(price) || 0;
  const recipeCostValue = recipe.reduce((sum, ing) => sum + ingredientCost(ing, inventoryItems), 0);
  const profitValue = parsedPrice - recipeCostValue;
  const marginValue = parsedPrice > 0 ? (profitValue / parsedPrice) * 100 : 0;

  // Shared by both Save (closes the dialog) and Save & Next (advances to
  // the next product in the parent's filtered list instead) — returns
  // whether the save actually succeeded so each caller can decide what to
  // do next.
  const saveCore = async (): Promise<boolean> => {
    if (!nameEn.trim() || !categoryId || !price) {
      toast(t.common.required, "error");
      return false;
    }
    setSaving(true);
    let finalRecipe = recipe.filter((r) => r.inventoryItemId && r.qty > 0);

    // Piece-category smart default (Croissant/Dessert/Sanky POPS-style):
    // only for a brand-new product that still has no recipe at all, auto-
    // provision a dedicated piece-type inventory item for it and consume 1
    // — detection is category-only, never the product's own name.
    if (!product && finalRecipe.length === 0) {
      const categoryName = categories.find((c) => c.id === categoryId)?.name.en ?? "";
      if (recipeCategoryBucket(categoryName) === "piece") {
        const newItem = await addInventoryItem({
          name: { en: nameEn.trim(), ar: nameAr.trim() || nameEn.trim() },
          type: "piece",
          quantity: 0,
        });
        if (newItem) finalRecipe = [{ inventoryItemId: newItem.id, qty: 1 }];
      }
    }

    const payload = {
      name: { en: nameEn.trim(), ar: nameAr.trim() || nameEn.trim() },
      categoryId,
      price: parseFloat(price) || 0,
      secondaryPrice: secondaryPrice.trim() ? parseFloat(secondaryPrice) || undefined : undefined,
      image,
      isActive,
      recipe: finalRecipe,
      sku: sku.trim() || undefined,
      barcode: barcode.trim() || undefined,
      recipeSynced,
      modifierGroupIds: selectedModGroups.length > 0 ? selectedModGroups : undefined,
    };
    if (product) {
      await updateProduct(product.id, payload);
      toast(t.common.save, "success");
    } else {
      await addProduct(payload);
      toast(t.common.add, "success");
    }
    setSaving(false);
    return true;
  };

  // On pages that wire onSaveAndNext (currently just Products), saving an
  // EXISTING product advances straight to the next one in the caller's
  // filtered list instead of closing — see onSaveAndNext's doc comment
  // above for why the parent (not this dialog) owns "what's next".
  // Creating a brand-new product has no "next" in that sense, so it always
  // just closes, same as before.
  const handleSave = async () => {
    if (!(await saveCore())) return;
    if (onSaveAndNext && product) {
      onSaveAndNext();
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? t.products.editProduct : t.products.addProduct}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto scrollbar-thin px-0.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t.products.productName}</Label>
              <Input className="mt-1.5" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </div>
            <div>
              <Label>{t.products.productNameAr}</Label>
              <Input className="mt-1.5" value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t.common.category}</Label>
              <Select value={categoryId} onValueChange={handleCategoryChange}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {bilingual(c.name, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t.common.price}</Label>
              <Input
                className="mt-1.5"
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>

          {settings.multiPricing?.enabled && (
            <div>
              <Label>{t.products.secondaryPrice}</Label>
              <Input
                className="mt-1.5"
                type="number"
                value={secondaryPrice}
                onChange={(e) => setSecondaryPrice(e.target.value)}
                placeholder={t.common.optional}
              />
            </div>
          )}

          <div>
            <Label>{t.products.image}</Label>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted text-2xl">
                {isImageUrl(image) ? (
                  <img src={image} alt="" className="h-full w-full object-cover" />
                ) : (
                  image || "☕"
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                {uploading ? t.common.loading : t.products.uploadPhoto}
              </Button>
            </div>
            <p className="mt-2.5 text-xs text-muted-foreground">{t.products.orEmoji}</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => setImage(e)}
                  className={`flex h-11 w-11 items-center justify-center rounded-lg border text-xl ${
                    image === e ? "border-primary bg-primary/10" : "border-border"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t.products.sku}</Label>
              <Input className="mt-1.5" value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div>
              <Label>{t.products.barcode}</Label>
              <Input className="mt-1.5" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>{t.products.recipe}</Label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCopyRecipe}
                  disabled={recipe.length === 0}
                  className="text-xs font-medium text-muted-foreground hover:underline disabled:opacity-50"
                >
                  {t.products.copyIngredients}
                </button>
                <button
                  type="button"
                  onClick={handlePasteRecipe}
                  className="text-xs font-medium text-muted-foreground hover:underline"
                >
                  {t.products.pasteIngredients}
                </button>
                <button
                  type="button"
                  onClick={addIngredientRow}
                  disabled={inventoryItems.length === 0}
                  className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                >
                  + {t.products.addIngredient}
                </button>
              </div>
            </div>
            <div className="mt-1.5 space-y-2">
              {recipe.length === 0 && <p className="text-xs text-muted-foreground">{t.products.noIngredients}</p>}
              {recipe.map((ing, idx) => {
                const invItem = inventoryItems.find((i) => i.id === ing.inventoryItemId);
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <IngredientSelect
                      value={ing.inventoryItemId}
                      onValueChange={(v) => updateIngredientRow(idx, { inventoryItemId: v })}
                      inventoryItems={inventoryItems}
                      locale={locale}
                      placeholder={t.products.selectIngredient}
                      searchPlaceholder={t.products.searchIngredients}
                      noResultsLabel={t.products.noIngredientsFound}
                    />
                    <Input
                      type="number"
                      className="w-24 shrink-0"
                      value={ing.qty || ""}
                      onChange={(e) => updateIngredientRow(idx, { qty: parseFloat(e.target.value) || 0 })}
                      placeholder={invItem?.unit ?? t.inventory.pieceUnit}
                    />
                    <button
                      type="button"
                      onClick={() => removeIngredientRow(idx)}
                      className="shrink-0 text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            {recipe.length > 0 && (
              <div className="mt-3 space-y-1.5 rounded-lg bg-muted p-3 text-xs">
                {recipe.map((ing, idx) => {
                  const invItem = inventoryItems.find((i) => i.id === ing.inventoryItemId);
                  return (
                    <div key={idx} className="flex justify-between text-muted-foreground">
                      <span>{invItem ? bilingual(invItem.name, locale) : "—"}</span>
                      <span>{formatMoney(ingredientCost(ing, inventoryItems), settings.currencySymbol)}</span>
                    </div>
                  );
                })}
                <div className="my-1.5 border-t border-dashed border-border" />
                <div className="flex justify-between font-semibold">
                  <span>{t.products.recipeCost}</span>
                  <span>{formatMoney(recipeCostValue, settings.currencySymbol)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>{t.common.price}</span>
                  <span>{formatMoney(parsedPrice, settings.currencySymbol)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>{t.products.estimatedProfit}</span>
                  <span className={profitValue >= 0 ? "text-success" : "text-destructive"}>
                    {formatMoney(profitValue, settings.currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>{t.products.estimatedMargin}</span>
                  <span className={marginValue >= 0 ? "text-success" : "text-destructive"}>
                    {marginValue.toFixed(1)}%
                  </span>
                </div>
              </div>
            )}
            {role === "owner" && (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label>{t.products.matchRecipeOtherBranch}</Label>
                  <p className="text-xs text-muted-foreground">{t.products.matchRecipeOtherBranchDesc}</p>
                </div>
                <Switch checked={recipeSynced} onCheckedChange={setRecipeSynced} />
              </div>
            )}
          </div>

          {modifierGroups.length > 0 && (
            <div>
              <Label>{t.pos.modifiers}</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {modifierGroups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => toggleModGroup(g.id)}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-medium ${
                      selectedModGroups.includes(g.id)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border"
                    }`}
                  >
                    {bilingual(g.name, locale)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label>{t.common.active}</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter className={onNavigate ? "sm:justify-between" : undefined}>
          {onNavigate && (
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={!hasPrev} onClick={() => onNavigate("prev")}>
                <ChevronLeft className="h-3.5 w-3.5" />
                {t.recipes.previous}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={!hasNext} onClick={() => onNavigate("next")}>
                {t.recipes.next}
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button disabled={saving} onClick={handleSave}>
              {t.common.save}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A normal Select, except its dropdown has a search field pinned to the
 * top that filters which inventory items are listed below it — like
 * Select2/react-select's searchable combobox. Filtering only affects what's
 * shown while THIS dropdown is open; it never touches the recipe rows
 * themselves. The search text is local to one open/close cycle — it's
 * cleared as soon as an item is picked or the dropdown is closed any other
 * way, so the next time it opens (this row or another), it starts blank. */
function IngredientSelect({
  value,
  onValueChange,
  inventoryItems,
  locale,
  placeholder,
  searchPlaceholder,
  noResultsLabel,
}: {
  value: string;
  onValueChange: (v: string) => void;
  inventoryItems: { id: string; name: { en: string; ar: string }; unit?: string }[];
  locale: "en" | "ar";
  placeholder: string;
  searchPlaceholder: string;
  noResultsLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return inventoryItems;
    return inventoryItems.filter((i) => i.name.en.toLowerCase().includes(q) || i.name.ar.includes(search.trim()));
  }, [inventoryItems, search]);

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        onValueChange(v);
        setSearch("");
      }}
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setSearch("");
        } else {
          // Radix focuses the selected/first item by default when it opens
          // — grab focus back for the search box right after, so typing
          // works immediately without an extra click.
          requestAnimationFrame(() => searchRef.current?.focus());
        }
      }}
    >
      <SelectTrigger className="flex-1">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <div className="sticky top-0 z-10 -mx-1 -mt-1 mb-1 border-b border-border bg-popover p-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                // Prevent Radix Select's built-in typeahead/arrow-key
                // handling from hijacking keystrokes meant for this input —
                // Escape is let through so it still closes the dropdown.
                if (e.key !== "Escape") e.stopPropagation();
              }}
              placeholder={searchPlaceholder}
              className="w-full rounded-md border border-input bg-background py-1.5 ps-7 pe-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">{noResultsLabel}</p>
        ) : (
          filtered.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              {bilingual(i.name, locale)}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
