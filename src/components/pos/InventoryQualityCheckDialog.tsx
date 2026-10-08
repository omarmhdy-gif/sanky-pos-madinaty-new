"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck, CheckCircle2, CircleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/lib/store/useDataStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";

export function InventoryQualityCheckDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { locale } = useI18n();
  const items = useDataStore((s) => s.inventoryItems);
  const recordCheck = useDataStore((s) => s.recordInventoryQualityCheck);
  const currentUser = useAuthStore((s) => s.currentUser);
  const [itemId, setItemId] = useState("");
  const [result, setResult] = useState<"good" | "needs_attention">("good");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const sortedItems = useMemo(() => [...items].sort((a, b) => bilingual(a.name, locale).localeCompare(bilingual(b.name, locale), locale)), [items, locale]);

  const handleSave = async () => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item || !currentUser) return;
    setSaving(true);
    try {
      await recordCheck({
        inventoryItemId: item.id,
        inventoryItemName: item.name,
        result,
        note: note.trim() || undefined,
        checkedById: currentUser.id,
        checkedByName: currentUser.name,
      });
      toast(locale === "ar" ? "تم حفظ فحص المخزون" : "Inventory check saved", "success");
      setItemId("");
      setResult("good");
      setNote("");
      onOpenChange(false);
    } catch (error) {
      toast(error instanceof Error ? error.message : (locale === "ar" ? "تعذر حفظ الفحص" : "Could not save check"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" />{locale === "ar" ? "فحص مواد المخزون" : "Inventory quality check"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block space-y-1.5 text-sm font-medium">
            <span>{locale === "ar" ? "مادة المخزون" : "Inventory item"}</span>
            <select value={itemId} onChange={(event) => setItemId(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" disabled={saving}>
              <option value="">{locale === "ar" ? "اختر المادة" : "Select an item"}</option>
              {sortedItems.map((item) => <option key={item.id} value={item.id}>{bilingual(item.name, locale)}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={result === "good" ? "default" : "outline"} className="h-auto min-h-12 gap-2 whitespace-normal" onClick={() => setResult("good")} aria-pressed={result === "good"}>
              <CheckCircle2 className="h-4 w-4 shrink-0" />{locale === "ar" ? "جيدة" : "Good"}
            </Button>
            <Button type="button" variant={result === "needs_attention" ? "destructive" : "outline"} className="h-auto min-h-12 gap-2 whitespace-normal" onClick={() => setResult("needs_attention")} aria-pressed={result === "needs_attention"}>
              <CircleAlert className="h-4 w-4 shrink-0" />{locale === "ar" ? "تحتاج متابعة" : "Needs attention"}
            </Button>
          </div>
          <label className="block space-y-1.5 text-sm font-medium">
            <span>{locale === "ar" ? "ملاحظة (اختياري)" : "Note (optional)"}</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={500} className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder={locale === "ar" ? "اكتب ملاحظة عن حالة المادة" : "Add a note about the item"} disabled={saving} />
          </label>
          <Button className="w-full" onClick={handleSave} disabled={!itemId || saving}>
            {saving ? (locale === "ar" ? "جارٍ الحفظ…" : "Saving…") : (locale === "ar" ? "حفظ الفحص" : "Save check")}
          </Button>
          {items.length === 0 && <p className="text-sm text-muted-foreground">{locale === "ar" ? "لا توجد مواد مخزون لهذا الفرع." : "There are no inventory items for this branch."}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
