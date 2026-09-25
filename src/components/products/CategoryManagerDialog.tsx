"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDataStore } from "@/lib/store/useDataStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import type { Category } from "@/lib/types";

const COLOR_OPTIONS: Record<string, string> = {
  espresso: "#8f6339",
  amber: "#d97706",
  emerald: "#059669",
  sky: "#0284c7",
  pink: "#db2777",
  violet: "#7c3aed",
};

export function CategoryManagerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, locale } = useI18n();
  const categories = useDataStore((s) => s.categories);
  const products = useDataStore((s) => s.products);
  const addCategory = useDataStore((s) => s.addCategory);
  const updateCategory = useDataStore((s) => s.updateCategory);
  const deleteCategory = useDataStore((s) => s.deleteCategory);

  const [editing, setEditing] = useState<Category | null>(null);
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [color, setColor] = useState("espresso");
  const [formOpen, setFormOpen] = useState(false);

  const startAdd = () => {
    setEditing(null);
    setNameEn("");
    setNameAr("");
    setColor("espresso");
    setFormOpen(true);
  };

  const startEdit = (c: Category) => {
    setEditing(c);
    setNameEn(c.name.en);
    setNameAr(c.name.ar);
    setColor(c.color);
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!nameEn.trim()) {
      toast(t.common.required, "error");
      return;
    }
    if (editing) {
      updateCategory(editing.id, { name: { en: nameEn.trim(), ar: nameAr.trim() || nameEn.trim() }, color });
    } else {
      addCategory({ name: { en: nameEn.trim(), ar: nameAr.trim() || nameEn.trim() }, color });
    }
    setFormOpen(false);
  };

  const handleDelete = (id: string) => {
    const inUse = products.some((p) => p.categoryId === id);
    if (inUse) {
      toast(locale === "ar" ? "لا يمكن حذف فئة تحتوي على منتجات" : "Cannot delete a category with products", "error");
      return;
    }
    deleteCategory(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.products.manageCategories}</DialogTitle>
        </DialogHeader>

        {!formOpen ? (
          <>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto scrollbar-thin">
              {categories.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <span className="text-sm font-medium">{bilingual(c.name, locale)}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleDelete(c.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full" onClick={startAdd}>
              <Plus className="h-4 w-4" />
              {t.products.addCategory}
            </Button>
          </>
        ) : (
          <div className="space-y-4">
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
            <div>
              <Label>Color</Label>
              <div className="mt-1.5 flex gap-2">
                {Object.entries(COLOR_OPTIONS).map(([name, hex]) => (
                  <button
                    key={name}
                    onClick={() => setColor(name)}
                    className={`h-8 w-8 rounded-full border-2 ${color === name ? "border-primary" : "border-transparent"}`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setFormOpen(false)}>
                {t.common.cancel}
              </Button>
              <Button className="flex-1" onClick={handleSave}>
                {t.common.save}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
