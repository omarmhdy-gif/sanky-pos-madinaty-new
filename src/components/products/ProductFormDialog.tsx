"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Trash2,
  Upload,
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  Copy,
  ClipboardPaste,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useDataStore } from "@/lib/store/useDataStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { formatMoney, isImageUrl } from "@/lib/utils";
import {
  ingredientCost,
  recipeCategoryBucket,
  defaultCoffeeRecipe,
} from "@/lib/inventory";
import { uploadImage } from "@/lib/supabase/api";
import {
  copyRecipeToClipboard,
  readRecipeClipboard,
} from "@/lib/recipeClipboard";
import type {
  Product,
  RecipeIngredient,
  InventoryItem,
} from "@/lib/types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EMOJI_OPTIONS = [
  "☕",
  "🥛",
  "🧊",
  "🥤",
  "🧋",
  "🍫",
  "🥐",
  "🧁",
  "🥮",
  "🍥",
  "🍰",
  "🍮",
  "🍪",
  "🥪",
  "🥑",
  "🥯",
  "🍋",
  "🍓",
];

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
  onNavigate?: (direction: "prev" | "next") => void;
  hasPrev?: boolean;
  hasNext?: boolean;
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
  const [selectedModGroups, setSelectedModGroups] = useState<string[]>(
    []
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    const defaultCategoryId =
      product?.categoryId ?? categories[0]?.id ?? "";

    setNameEn(product?.name.en ?? "");
    setNameAr(product?.name.ar ?? "");
    setCategoryId(defaultCategoryId);
    setPrice(product ? String(product.price) : "");
    setSecondaryPrice(
      product?.secondaryPrice != null
        ? String(product.secondaryPrice)
        : ""
    );
    setImage(product?.image ?? "☕");

    if (product) {
      setRecipe(product.recipe ?? []);
    } else {
      const categoryName =
        categories.find((c) => c.id === defaultCategoryId)?.name.en ??
        "";

      const bucket = recipeCategoryBucket(categoryName);

      setRecipe(
        bucket === "coffee"
          ? defaultCoffeeRecipe(inventoryItems)
          : []
      );
    }

    setSku(product?.sku ?? "");
    setBarcode(product?.barcode ?? "");
    setRecipeSynced(product?.recipeSynced ?? false);
    setIsActive(product?.isActive ?? true);
    setSelectedModGroups(product?.modifierGroupIds ?? []);
  }, [open, product, categories, inventoryItems]);

  const handleCategoryChange = (v: string) => {
    setCategoryId(v);

    if (!product) {
      const categoryName =
        categories.find((c) => c.id === v)?.name.en ?? "";

      const bucket = recipeCategoryBucket(categoryName);

      setRecipe(
        bucket === "coffee"
          ? defaultCoffeeRecipe(inventoryItems)
          : []
      );
    }
  };

  const toggleModGroup = (id: string) => {
    setSelectedModGroups((prev) =>
      prev.includes(id)
        ? prev.filter((g) => g !== id)
        : [...prev, id]
    );
  };

  const addIngredientRow = () => {
    if (inventoryItems.length === 0) {
      toast("No inventory items available.", "error");
      return;
    }

    const availableItem = inventoryItems.find(
      (item) =>
        !recipe.some(
          (ingredient) =>
            ingredient.inventoryItemId === item.id
        )
    );

    if (!availableItem) {
      toast("All inventory items are already added.", "error");
      return;
    }

    setRecipe((prev) => [
      ...prev,
      {
        inventoryItemId: availableItem.id,
        qty: 0,
      },
    ]);
  };

  const updateIngredientRow = (
    idx: number,
    patch: Partial<RecipeIngredient>
  ) => {
    setRecipe((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, ...patch } : r
      )
    );
  };

  const handleIngredientChange = (
    idx: number,
    inventoryItemId: string
  ) => {
    const alreadyUsed = recipe.some(
      (ingredient, ingredientIndex) =>
        ingredientIndex !== idx &&
        ingredient.inventoryItemId === inventoryItemId
    );

    if (alreadyUsed) {
      toast("This ingredient is already in the recipe.", "error");
      return;
    }

    updateIngredientRow(idx, {
      inventoryItemId,
    });
  };

  const removeIngredientRow = (idx: number) => {
    setRecipe((prev) =>
      prev.filter((_, i) => i !== idx)
    );
  };

  const clearRecipe = () => {
    setRecipe([]);
  };

  const handleCopyRecipe = () => {
    if (recipe.length === 0) return;

    copyRecipeToClipboard(recipe);
    toast(t.products.ingredientsCopied, "success");
  };

  const handlePasteRecipe = () => {
    const clipboard = readRecipeClipboard();

    if (!clipboard || clipboard.length === 0) {
      toast(t.products.noIngredientsToPaste, "error");
      return;
    }

    const valid = clipboard.filter((ing) =>
      inventoryItems.some(
        (i) => i.id === ing.inventoryItemId
      )
    );

    const unique: RecipeIngredient[] = [];

    for (const ingredient of valid) {
      const exists = unique.some(
        (item) =>
          item.inventoryItemId ===
          ingredient.inventoryItemId
      );

      if (!exists) {
        unique.push(ingredient);
      }
    }

    setRecipe(unique);

    toast(t.products.ingredientsPasted, "success");
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    e.target.value = "";

    if (!file) return;

    if (
      !file.type.startsWith("image/") ||
      file.size > MAX_IMAGE_BYTES
    ) {
      toast(t.products.imageUploadError, "error");
      return;
    }

    setUploading(true);

    try {
      const url = await uploadImage(file, "products");
      setImage(url);
    } catch (err) {
      toast(
        err instanceof Error
          ? err.message
          : "Upload failed",
        "error"
      );
    } finally {
      setUploading(false);
    }
  };

  const parsedPrice = parseFloat(price) || 0;

  const validRecipe = recipe.filter(
    (ingredient) =>
      ingredient.inventoryItemId &&
      ingredient.qty > 0
  );

  const recipeCostValue = validRecipe.reduce(
    (sum, ingredient) =>
      sum + ingredientCost(
        ingredient,
        inventoryItems
      ),
    0
  );

  const profitValue =
    parsedPrice - recipeCostValue;

  const marginValue =
    parsedPrice > 0
      ? (profitValue / parsedPrice) * 100
      : 0;

  const saveCore = async (): Promise<boolean> => {
    if (!nameEn.trim() || !categoryId || !price) {
      toast(t.common.required, "error");
      return false;
    }

    setSaving(true);

    let finalRecipe = recipe.filter(
      (r) =>
        r.inventoryItemId &&
        r.qty > 0
    );

    if (!product && finalRecipe.length === 0) {
      const categoryName =
        categories.find(
          (c) => c.id === categoryId
        )?.name.en ?? "";

      if (
        recipeCategoryBucket(categoryName) ===
        "piece"
      ) {
        const newItem =
          await addInventoryItem({
            name: {
              en: nameEn.trim(),
              ar:
                nameAr.trim() ||
                nameEn.trim(),
            },
            type: "piece",
            quantity: 0,
          });

        if (newItem) {
          finalRecipe = [
            {
              inventoryItemId: newItem.id,
              qty: 1,
            },
          ];
        }
      }
    }

    const payload = {
      name: {
        en: nameEn.trim(),
        ar:
          nameAr.trim() ||
          nameEn.trim(),
      },
      categoryId,
      price: parseFloat(price) || 0,
      secondaryPrice: secondaryPrice.trim()
        ? parseFloat(secondaryPrice) ||
          undefined
        : undefined,
      image,
      isActive,
      recipe: finalRecipe,
      sku: sku.trim() || undefined,
      barcode:
        barcode.trim() || undefined,
      recipeSynced,
      modifierGroupIds:
        selectedModGroups.length > 0
          ? selectedModGroups
          : undefined,
    };

    try {
      if (product) {
        const updated = await updateProduct(
          product.id,
          payload
        );
        if (!updated) {
          setSaving(false);
          return false;
        }

        toast(t.common.save, "success");
      } else {
        await addProduct(payload);

        toast(t.common.add, "success");
      }

      setSaving(false);
      return true;
    } catch {
      setSaving(false);
      return false;
    }
  };

  const handleSave = async () => {
    if (!(await saveCore())) return;

    if (onSaveAndNext && product) {
      onSaveAndNext();
    } else {
      onOpenChange(false);
    }
  };

  const getUnitLabel = (
    item?: InventoryItem
  ) => {
    if (!item) return "";

    if (item.type === "piece") {
      return t.inventory.pieceUnit;
    }

    return item.unit ?? "";
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {product
              ? t.products.editProduct
              : t.products.addProduct}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[72vh] space-y-5 overflow-y-auto scrollbar-thin px-0.5">
          {/* Product name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>
                {t.products.productName}
              </Label>

              <Input
                className="mt-1.5"
                value={nameEn}
                onChange={(e) =>
                  setNameEn(e.target.value)
                }
              />
            </div>

            <div>
              <Label>
                {t.products.productNameAr}
              </Label>

              <Input
                className="mt-1.5"
                value={nameAr}
                onChange={(e) =>
                  setNameAr(e.target.value)
                }
                dir="rtl"
              />
            </div>
          </div>

          {/* Category + price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>
                {t.common.category}
              </Label>

              <Select
                value={categoryId}
                onValueChange={
                  handleCategoryChange
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem
                      key={c.id}
                      value={c.id}
                    >
                      {bilingual(
                        c.name,
                        locale
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>
                {t.common.price}
              </Label>

              <Input
                className="mt-1.5"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) =>
                  setPrice(e.target.value)
                }
              />
            </div>
          </div>

          {/* Secondary price */}
          {settings.multiPricing?.enabled && (
            <div>
              <Label>
                {t.products.secondaryPrice}
              </Label>

              <Input
                className="mt-1.5"
                type="number"
                min="0"
                step="0.01"
                value={secondaryPrice}
                onChange={(e) =>
                  setSecondaryPrice(
                    e.target.value
                  )
                }
                placeholder={
                  t.common.optional
                }
              />
            </div>
          )}

          {/* Image */}
          <div>
            <Label>
              {t.products.image}
            </Label>

            <div className="mt-1.5 flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted text-2xl">
                {isImageUrl(image) ? (
                  <img
                    src={image}
                    alt=""
                    className="h-full w-full object-cover"
                  />
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
                onClick={() =>
                  fileInputRef.current?.click()
                }
              >
                <Upload className="h-3.5 w-3.5" />

                {uploading
                  ? t.common.loading
                  : t.products.uploadPhoto}
              </Button>
            </div>

            <p className="mt-2.5 text-xs text-muted-foreground">
              {t.products.orEmoji}
            </p>

            <div className="mt-1.5 flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() =>
                    setImage(e)
                  }
                  className={`flex h-11 w-11 items-center justify-center rounded-lg border text-xl ${
                    image === e
                      ? "border-primary bg-primary/10"
                      : "border-border"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* SKU + Barcode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>
                {t.products.sku}
              </Label>

              <Input
                className="mt-1.5"
                value={sku}
                onChange={(e) =>
                  setSku(e.target.value)
                }
              />
            </div>

            <div>
              <Label>
                {t.products.barcode}
              </Label>

              <Input
                className="mt-1.5"
                value={barcode}
                onChange={(e) =>
                  setBarcode(e.target.value)
                }
              />
            </div>
          </div>

          {/* ========================================================= */}
          {/* RECIPE */}
          {/* ========================================================= */}

          <div className="rounded-xl border border-border bg-background">
            {/* Recipe header */}
            <div className="border-b border-border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label className="text-base font-semibold">
                    {t.products.recipe}
                  </Label>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Add the ingredients used to prepare
                    one unit of this product.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={recipe.length === 0}
                    onClick={
                      handleCopyRecipe
                    }
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {t.products.copyIngredients}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={
                      handlePasteRecipe
                    }
                  >
                    <ClipboardPaste className="h-3.5 w-3.5" />
                    {t.products.pasteIngredients}
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      inventoryItems.length ===
                      0
                    }
                    onClick={
                      addIngredientRow
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t.products.addIngredient}
                  </Button>
                </div>
              </div>
            </div>

            {/* Recipe ingredients */}
            <div className="p-4">
              {recipe.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center">
                  <p className="text-sm font-medium">
                    {t.products.noIngredients}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Click{" "}
                    <span className="font-medium">
                      Add Ingredient
                    </span>{" "}
                    to build this recipe.
                  </p>

                  <Button
                    type="button"
                    size="sm"
                    className="mt-4"
                    disabled={
                      inventoryItems.length ===
                      0
                    }
                    onClick={
                      addIngredientRow
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Ingredient
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Table header */}
                  <div className="hidden grid-cols-[1fr_120px_90px_40px] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
                    <span>Ingredient</span>
                    <span>Quantity</span>
                    <span className="text-right">
                      Cost
                    </span>
                    <span />
                  </div>

                  {recipe.map(
                    (ing, idx) => {
                      const invItem =
                        inventoryItems.find(
                          (i) =>
                            i.id ===
                            ing.inventoryItemId
                        );

                      const unit =
                        getUnitLabel(
                          invItem
                        );

                      const cost =
                        ingredientCost(
                          ing,
                          inventoryItems
                        );

                      return (
                        <div
                          key={`${ing.inventoryItemId}-${idx}`}
                          className="grid gap-2 rounded-lg border border-border bg-muted/30 p-2 sm:grid-cols-[1fr_120px_90px_40px] sm:items-center"
                        >
                          <div className="min-w-0">
                            <IngredientSelect
                              value={
                                ing.inventoryItemId
                              }
                              onValueChange={(
                                v
                              ) =>
                                handleIngredientChange(
                                  idx,
                                  v
                                )
                              }
                              inventoryItems={
                                inventoryItems
                              }
                              locale={
                                locale
                              }
                              placeholder={
                                t.products
                                  .selectIngredient
                              }
                              searchPlaceholder={
                                t.products
                                  .searchIngredients
                              }
                              noResultsLabel={
                                t.products
                                  .noIngredientsFound
                              }
                            />

                            {invItem && (
                              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span>
                                  Unit:
                                </span>

                                <span className="rounded bg-background px-1.5 py-0.5 font-medium">
                                  {unit}
                                </span>

                                {invItem.type ===
                                  "measured" && (
                                  <span>
                                    measured
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.001"
                              className="w-full"
                              value={
                                ing.qty || ""
                              }
                              onChange={(
                                e
                              ) =>
                                updateIngredientRow(
                                  idx,
                                  {
                                    qty:
                                      parseFloat(
                                        e
                                          .target
                                          .value
                                      ) ||
                                      0,
                                  }
                                )
                              }
                              placeholder="0"
                            />

                            <span className="min-w-[32px] text-xs font-medium text-muted-foreground">
                              {unit}
                            </span>
                          </div>

                          <div className="text-right">
                            <p className="text-sm font-semibold">
                              {formatMoney(
                                cost,
                                settings.currencySymbol
                              )}
                            </p>
                          </div>

                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() =>
                                removeIngredientRow(
                                  idx
                                )
                              }
                              title="Remove ingredient"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>

            {/* Recipe totals */}
            {recipe.length > 0 && (
              <div className="border-t border-border bg-muted/40 p-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-border bg-background p-3">
                    <p className="text-xs text-muted-foreground">
                      Ingredients
                    </p>

                    <p className="mt-1 text-lg font-semibold">
                      {validRecipe.length}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-background p-3">
                    <p className="text-xs text-muted-foreground">
                      Recipe Cost
                    </p>

                    <p className="mt-1 text-lg font-semibold">
                      {formatMoney(
                        recipeCostValue,
                        settings.currencySymbol
                      )}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-background p-3">
                    <p className="text-xs text-muted-foreground">
                      Estimated Profit
                    </p>

                    <p
                      className={`mt-1 text-lg font-semibold ${
                        profitValue >= 0
                          ? "text-success"
                          : "text-destructive"
                      }`}
                    >
                      {formatMoney(
                        profitValue,
                        settings.currencySymbol
                      )}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-background p-3">
                    <p className="text-xs text-muted-foreground">
                      Estimated Margin
                    </p>

                    <p
                      className={`mt-1 text-lg font-semibold ${
                        marginValue >= 0
                          ? "text-success"
                          : "text-destructive"
                      }`}
                    >
                      {marginValue.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Detailed cost list */}
                <div className="mt-4 rounded-lg border border-border bg-background p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold">
                      Cost Breakdown
                    </p>

                    <button
                      type="button"
                      className="text-xs text-destructive hover:underline"
                      onClick={
                        clearRecipe
                      }
                    >
                      Clear Recipe
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {validRecipe.map(
                      (ing, idx) => {
                        const invItem =
                          inventoryItems.find(
                            (i) =>
                              i.id ===
                              ing.inventoryItemId
                          );

                        if (!invItem) {
                          return null;
                        }

                        return (
                          <div
                            key={`${ing.inventoryItemId}-${idx}`}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0">
                              <span className="font-medium">
                                {bilingual(
                                  invItem.name,
                                  locale
                                )}
                              </span>

                              <span className="ml-2 text-muted-foreground">
                                {ing.qty}{" "}
                                {getUnitLabel(
                                  invItem
                                )}
                              </span>
                            </div>

                            <span className="shrink-0 font-medium">
                              {formatMoney(
                                ingredientCost(
                                  ing,
                                  inventoryItems
                                ),
                                settings.currencySymbol
                              )}
                            </span>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Recipe sync */}
            {role === "owner" && (
              <div className="border-t border-border p-4">
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                  <div>
                    <Label>
                      {t.products.matchRecipeOtherBranch}
                    </Label>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {t.products.matchRecipeOtherBranchDesc}
                    </p>
                  </div>

                  <Switch
                    checked={recipeSynced}
                    onCheckedChange={
                      setRecipeSynced
                    }
                  />
                </div>
              </div>
            )}
          </div>

          {/* Modifier groups */}
          {modifierGroups.length > 0 && (
            <div>
              <Label>
                {t.pos.modifiers}
              </Label>

              <div className="mt-1.5 flex flex-wrap gap-2">
                {modifierGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() =>
                      toggleModGroup(g.id)
                    }
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-medium ${
                      selectedModGroups.includes(
                        g.id
                      )
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border"
                    }`}
                  >
                    {bilingual(
                      g.name,
                      locale
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label>
              {t.common.active}
            </Label>

            <Switch
              checked={isActive}
              onCheckedChange={
                setIsActive
              }
            />
          </div>
        </div>

        <DialogFooter
          className={
            onNavigate
              ? "sm:justify-between"
              : undefined
          }
        >
          {onNavigate && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasPrev}
                onClick={() =>
                  onNavigate("prev")
                }
              >
                <ChevronLeft className="h-3.5 w-3.5" />

                {t.recipes.previous}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasNext}
                onClick={() =>
                  onNavigate("next")
                }
              >
                {t.recipes.next}

                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                onOpenChange(false)
              }
            >
              {t.common.cancel}
            </Button>

            <Button
              disabled={saving}
              onClick={handleSave}
            >
              {t.common.save}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   Searchable Ingredient Selector
   ============================================================ */

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
  inventoryItems: InventoryItem[];
  locale: "en" | "ar";
  placeholder: string;
  searchPlaceholder: string;
  noResultsLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const searchRef =
    useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = search
      .trim()
      .toLowerCase();

    if (!q) {
      return inventoryItems;
    }

    return inventoryItems.filter(
      (item) =>
        item.name.en
          .toLowerCase()
          .includes(q) ||
        item.name.ar.includes(
          search.trim()
        )
    );
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
          requestAnimationFrame(() =>
            searchRef.current?.focus()
          );
        }
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue
          placeholder={placeholder}
        />
      </SelectTrigger>

      <SelectContent>
        <div className="sticky top-0 z-10 -mx-1 -mt-1 mb-1 border-b border-border bg-popover p-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />

            <input
              ref={searchRef}
              value={search}
              onChange={(e) =>
                setSearch(
                  e.target.value
                )
              }
              onKeyDown={(e) => {
                if (e.key !== "Escape") {
                  e.stopPropagation();
                }
              }}
              placeholder={
                searchPlaceholder
              }
              className="w-full rounded-md border border-input bg-background py-1.5 ps-7 pe-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            {noResultsLabel}
          </p>
        ) : (
          filtered.map((item) => (
            <SelectItem
              key={item.id}
              value={item.id}
            >
              <div className="flex w-full items-center justify-between gap-3">
                <span>
                  {bilingual(
                    item.name,
                    locale
                  )}
                </span>

                <span className="text-[10px] text-muted-foreground">
                  {item.type ===
                  "piece"
                    ? "piece"
                    : item.unit ?? ""}
                </span>
              </div>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
