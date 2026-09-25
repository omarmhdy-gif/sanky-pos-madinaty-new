import type { RecipeIngredient } from "@/lib/types";

const KEY = "sanky_pos_recipe_clipboard";

export function copyRecipeToClipboard(recipe: RecipeIngredient[]): void {
  localStorage.setItem(KEY, JSON.stringify(recipe));
}

export function readRecipeClipboard(): RecipeIngredient[] | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
