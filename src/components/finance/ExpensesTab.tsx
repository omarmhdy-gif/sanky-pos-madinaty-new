"use client";

import { useMemo, useState } from "react";
import { Plus, Wallet, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { ExpenseFormDialog } from "@/components/expenses/ExpenseFormDialog";
import { useDataStore } from "@/lib/store/useDataStore";
import { useI18n } from "@/lib/i18n";
import { formatMoney, formatDate } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import type { Expense } from "@/lib/types";

const categoryColors: Record<string, string> = {
  electricity: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  gas: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  internet: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  maintenance: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  cleaning: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  transport: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  miscellaneous: "bg-muted text-muted-foreground",
};

export function ExpensesTab() {
  const { t, locale } = useI18n();
  const expenses = useDataStore((s) => s.expenses);
  const settings = useDataStore((s) => s.settings);
  const deleteExpense = useDataStore((s) => s.deleteExpense);

  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  const sorted = useMemo(
    () => [...expenses].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [expenses]
  );
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  const handleAdd = () => {
    setEditingExpense(null);
    setFormOpen(true);
  };
  const handleEdit = (e: Expense) => {
    setEditingExpense(e);
    setFormOpen(true);
  };
  const confirmDelete = () => {
    if (deleteTarget) {
      deleteExpense(deleteTarget.id);
      toast(t.common.delete, "success");
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t.expenses.subtitle}</p>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4" />
          {t.expenses.addExpense}
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">{t.expenses.totalExpenses}</p>
        <p className="mt-1 text-2xl font-bold text-destructive">{formatMoney(total, settings.currencySymbol)}</p>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Wallet className="h-10 w-10 opacity-30" />
          <p className="text-sm">{t.common.noResults}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border divide-y divide-border">
          {sorted.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 bg-card px-4 py-3.5">
              <div className="flex items-center gap-3">
                <Badge className={categoryColors[e.category] ?? categoryColors.miscellaneous} variant="outline">
                  {t.expenses.categories[e.category as keyof typeof t.expenses.categories] ?? e.category}
                </Badge>
                <div>
                  <p className="text-sm font-semibold">{e.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(e.createdAt, locale)} · {e.createdBy}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-destructive">
                  -{formatMoney(e.amount, settings.currencySymbol)}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(e)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => setDeleteTarget(e)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ExpenseFormDialog expense={editingExpense} open={formOpen} onOpenChange={setFormOpen} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.products.deleteConfirm}</AlertDialogTitle>
            <AlertDialogDescription>{t.products.deleteConfirmDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>{t.common.delete}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
