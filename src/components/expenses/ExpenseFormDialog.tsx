"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useDataStore } from "@/lib/store/useDataStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import type { Expense, ExpenseCategory } from "@/lib/types";

const CATEGORIES: ExpenseCategory[] = ["electricity", "gas", "internet", "maintenance", "cleaning", "transport", "miscellaneous"];

export function ExpenseFormDialog({
  expense,
  open,
  onOpenChange,
}: {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const addExpense = useDataStore((s) => s.addExpense);
  const updateExpense = useDataStore((s) => s.updateExpense);
  const currentUser = useAuthStore((s) => s.currentUser);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("miscellaneous");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(expense?.title ?? "");
      setCategory(expense?.category ?? "miscellaneous");
      setAmount(expense ? String(expense.amount) : "");
      setNote(expense?.note ?? "");
    }
  }, [open, expense]);

  const handleSave = () => {
    if (!title.trim() || !amount) {
      toast(t.common.required, "error");
      return;
    }
    if (expense) {
      updateExpense(expense.id, {
        title: title.trim(),
        category,
        amount: parseFloat(amount) || 0,
        note: note.trim() || undefined,
      });
    } else {
      addExpense({
        title: title.trim(),
        category,
        amount: parseFloat(amount) || 0,
        note: note.trim() || undefined,
        createdBy: currentUser?.name ?? "Unknown",
      });
    }
    toast(t.common.save, "success");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{expense ? t.expenses.editExpense : t.expenses.addExpense}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t.expenses.expenseTitle}</Label>
            <Input className="mt-1.5" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t.common.category}</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t.expenses.categories[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t.expenses.amount}</Label>
              <Input className="mt-1.5" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>
              {t.expenses.note} <span className="text-muted-foreground">({t.common.optional})</span>
            </Label>
            <Input className="mt-1.5" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button onClick={handleSave}>{t.common.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
