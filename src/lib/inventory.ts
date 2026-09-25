import type { InventoryItem, Product, RecipeIngredient } from "@/lib/types";

export type StockLevel = "critical" | "low" | "good";

export function stockLevel(item: InventoryItem): StockLevel {
  if (item.criticalThreshold !== undefined && item.quantity <= item.criticalThreshold) return "critical";
  if (item.lowThreshold !== undefined && item.quantity <= item.lowThreshold) return "low";
  return "good";
}

export const STOCK_LEVEL_DOT: Record<StockLevel, string> = {
  critical: "bg-destructive",
  low: "bg-amber-500",
  good: "bg-success",
};

/**
 * How many more units of this product can be sold before an ingredient runs
 * out, based on the recipe. Returns null for products with no recipe (i.e.
 * not stock-tracked at all — always available, same as the old trackStock=false).
 */
export function productAvailableQty(product: Product, inventoryItems: InventoryItem[]): number | null {
  if (!product.recipe || product.recipe.length === 0) return null;
  let min = Infinity;
  for (const ing of product.recipe) {
    if (ing.qty <= 0) continue;
    const item = inventoryItems.find((i) => i.id === ing.inventoryItemId);
    if (!item) continue;
    min = Math.min(min, Math.floor(item.quantity / ing.qty));
  }
  return Number.isFinite(min) ? min : null;
}

/** Cost contribution of one recipe line, using the ingredient's last purchase price (0 if unknown). */
export function ingredientCost(ing: RecipeIngredient, inventoryItems: InventoryItem[]): number {
  const item = inventoryItems.find((i) => i.id === ing.inventoryItemId);
  return ing.qty * (item?.lastPurchaseCost ?? 0);
}

/** Total recipe cost — always computed live from current last purchase prices, never cached. */
export function recipeCost(product: Product, inventoryItems: InventoryItem[]): number {
  if (!product.recipe || product.recipe.length === 0) return 0;
  return product.recipe.reduce((sum, ing) => sum + ingredientCost(ing, inventoryItems), 0);
}

export function estimatedProfit(product: Product, inventoryItems: InventoryItem[]): number {
  return product.price - recipeCost(product, inventoryItems);
}

export function estimatedMargin(product: Product, inventoryItems: InventoryItem[]): number {
  if (product.price <= 0) return 0;
  return (estimatedProfit(product, inventoryItems) / product.price) * 100;
}

const COFFEE_CATEGORY_KEYWORDS = ["coffee", "frappe"];
const PIECE_CATEGORY_KEYWORDS = ["croissant", "dessert", "pops", "bakery", "sandwich"];

export type RecipeCategoryBucket = "coffee" | "piece" | "none";

/**
 * Classifies a category (by name, not the product's own name — category IDs
 * are branch-prefixed and inconsistent across branches, so this is always
 * matched by name substring) into which smart-default recipe applies.
 * "NON - Coffee" is explicitly excluded from the coffee bucket despite
 * containing the word "coffee".
 */
export function recipeCategoryBucket(categoryNameEn: string): RecipeCategoryBucket {
  const name = categoryNameEn.toLowerCase();
  if (name.includes("non") && name.includes("coffee")) return "none";
  if (COFFEE_CATEGORY_KEYWORDS.some((kw) => name.includes(kw))) return "coffee";
  if (PIECE_CATEGORY_KEYWORDS.some((kw) => name.includes(kw))) return "piece";
  return "none";
}

const COFFEE_DEFAULT_INGREDIENTS: { keyword: string; qty: number }[] = [
  { keyword: "espresso", qty: 16 },
  { keyword: "milk", qty: 240 },
  { keyword: "cup", qty: 1 },
  { keyword: "lid", qty: 1 },
];

function findItemByNameKeyword(inventoryItems: InventoryItem[], keyword: string): InventoryItem | undefined {
  return inventoryItems.find((i) => i.name.en.toLowerCase().includes(keyword));
}

/** Standard coffee-drink recipe (Espresso 16g + Milk 240g + Cup 1pc + Lid
 * 1pc), skipping any ingredient that doesn't exist yet in this branch's
 * inventory. Only a starting suggestion for the "coffee" category bucket —
 * never forced, the owner can freely edit or clear it before saving. */
export function defaultCoffeeRecipe(inventoryItems: InventoryItem[]): RecipeIngredient[] {
  return COFFEE_DEFAULT_INGREDIENTS.map((ing) => {
    const item = findItemByNameKeyword(inventoryItems, ing.keyword);
    return item ? { inventoryItemId: item.id, qty: ing.qty } : null;
  }).filter((ing): ing is RecipeIngredient => ing !== null);
}
