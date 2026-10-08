"use client";

import { useState, type MouseEvent } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { bilingual, useI18n } from "@/lib/i18n";
import { PDF_MENU, PDF_MENU_ITEM_COUNT } from "@/lib/pdfMenu";
import { useDataStore } from "@/lib/store/useDataStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { applyPdfMenu } from "@/lib/supabase/api";
import { toast } from "@/components/ui/toast";

export function PdfMenuImportButton() {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const categories = useDataStore((s) => s.categories);
  const products = useDataStore((s) => s.products);
  const branchId = useBranchStore((s) => s.currentBranchId);
  const branch = useBranchStore((s) => s.branches.find((entry) => entry.id === branchId));
  const branchName = branch ? bilingual(branch.name, locale) : "";
  const isArabic = locale === "ar";

  const handleApply = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!branchId || saving) return;
    setSaving(true);
    try {
      const result = await applyPdfMenu(branchId, categories, products);
      useDataStore.setState({ categories: result.categories, products: result.products });
      toast(
        isArabic
          ? `تم تحديث المنيو: ${result.added} جديد، ${result.updated} محدّث، ${result.deactivated} غير نشط.`
          : `Menu updated: ${result.added} added, ${result.updated} updated, ${result.deactivated} deactivated.`,
        "success"
      );
      setOpen(false);
    } catch (error) {
      toast(error instanceof Error ? error.message : isArabic ? "تعذر تحديث المنيو" : "Could not update the menu", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <ClipboardList className="h-4 w-4" />
        {isArabic ? "مراجعة منيو PDF" : "Review PDF menu"}
      </Button>

      <AlertDialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        <AlertDialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isArabic ? "مراجعة المنيو قبل تطبيقه" : "Review the menu before applying it"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isArabic
                ? `الفرع: ${branchName || "غير محدد"} · ${PDF_MENU.length} تصنيف · ${PDF_MENU_ITEM_COUNT} منتج · الأسعار بالجنيه المصري.`
                : `Branch: ${branchName || "not selected"} · ${PDF_MENU.length} categories · ${PDF_MENU_ITEM_COUNT} products · prices in EGP.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-xl border border-border bg-background p-3 scrollbar-thin sm:p-4">
            {PDF_MENU.map((category) => (
              <section key={category.name.en}>
                <h3 className="mb-2 border-b border-border pb-1.5 text-sm font-bold text-primary">
                  {isArabic ? category.name.ar : category.name.en}
                </h3>
                <div className="grid gap-x-5 sm:grid-cols-2">
                  {category.items.map((item, index) => (
                    <div key={`${item.name.en}-${index}`} className="flex justify-between gap-3 py-1 text-xs sm:text-sm">
                      <span>{isArabic ? item.name.ar : item.name.en}</span>
                      <span className="shrink-0 font-semibold">{item.price} EGP</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="space-y-1.5 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
            <p>
              {isArabic
                ? "المنتجات غير الموجودة في PDF ستتحول إلى غير نشطة، وستظل محفوظة لسجل الطلبات. المنتجات المطابقة ستحتفظ بصورها ووصفاتها الحالية."
                : "Products missing from the PDF will be marked inactive and kept for order history. Exact matches keep their existing photos and recipes."}
            </p>
            <p className="font-semibold">
              {isArabic
                ? "المنتجات الجديدة بلا وصفات مخزون؛ لن تخصم مكونات عند البيع حتى تُضاف لها وصفة من صفحة المنتجات."
                : "New products have no inventory recipes yet, so sales will not deduct ingredients until recipes are added on the Products page."}
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>{isArabic ? "رجوع" : "Back"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApply}
              disabled={!branchId || saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving
                ? isArabic ? "جاري التحديث..." : "Applying..."
                : isArabic ? "تطبيق المنيو على هذا الفرع" : "Apply menu to this branch"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
