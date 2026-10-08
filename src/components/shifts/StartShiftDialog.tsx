"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShopLogo } from "@/components/layout/ShopLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDataStore } from "@/lib/store/useDataStore";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";

// When required at login, this dialog cannot be dismissed until a till is
// opened. Manual prompts remain cancellable.
export function StartShiftDialog({ open, required = false, onOpenChange }: { open: boolean; required?: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useI18n();
  const startShift = useDataStore((s) => s.startShift);
  const [openingCash, setOpeningCash] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setOpeningCash("");
  }, [open]);

  const handleStart = async () => {
    const parsed = parseFloat(openingCash);
    if (!openingCash || Number.isNaN(parsed) || parsed < 0) {
      toast(t.common.required, "error");
      return;
    }
    setSubmitting(true);
    try {
      await startShift(parsed);
      onOpenChange(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to open till", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (nextOpen || !required) onOpenChange(nextOpen);
    }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <ShopLogo className="mb-2 h-12 w-12 rounded-xl" />
          <DialogTitle>{t.shifts.startShift}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t.shifts.startShiftDesc}</p>
          <div>
            <Label>{t.shifts.openingCash}</Label>
            <Input
              className="mt-1.5"
              type="number"
              autoFocus
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        <DialogFooter>
          {!required && <Button variant="outline" onClick={() => onOpenChange(false)}>{t.common.cancel}</Button>}
          <Button className="flex-1" size="lg" disabled={submitting} onClick={handleStart}>
            {t.shifts.startShift}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
