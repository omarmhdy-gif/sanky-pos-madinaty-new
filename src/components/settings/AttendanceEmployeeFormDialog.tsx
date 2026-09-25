"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useDataStore } from "@/lib/store/useDataStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { FIXED_SHIFT_WINDOWS, DEFAULT_SHIFT_TEMPLATES } from "@/lib/attendance";
import type { AttendanceEmployee } from "@/lib/types";

export function AttendanceEmployeeFormDialog({
  employee,
  open,
  onOpenChange,
}: {
  employee: AttendanceEmployee | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const addAttendanceEmployee = useDataStore((s) => s.addAttendanceEmployee);
  const updateAttendanceEmployee = useDataStore((s) => s.updateAttendanceEmployee);

  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [assignedShiftKey, setAssignedShiftKey] = useState("");
  const [shiftStart, setShiftStart] = useState("");
  const [shiftEnd, setShiftEnd] = useState("");
  const [graceMinutes, setGraceMinutes] = useState("15");

  useEffect(() => {
    if (open) {
      setName(employee?.name ?? "");
      setPin("");
      setIsActive(employee?.isActive ?? true);
      setAssignedShiftKey(employee?.assignedShiftKey ?? "");
      setShiftStart(employee?.shiftStart ?? "");
      setShiftEnd(employee?.shiftEnd ?? "");
      setGraceMinutes(employee?.graceMinutes != null ? String(employee.graceMinutes) : "15");
    }
  }, [open, employee]);

  // Picking an assigned shift pre-fills its default start/end as a
  // starting point — the owner can still edit either time freely.
  const handleSelectShift = (key: string) => {
    setAssignedShiftKey(key);
    const fallback = DEFAULT_SHIFT_TEMPLATES.find((tp) => tp.key === key);
    if (fallback && !shiftStart && !shiftEnd) {
      setShiftStart(fallback.officialStart);
      setShiftEnd(fallback.officialEnd);
    }
  };

  const handleSave = () => {
    const pinProvided = pin.length > 0;
    if (!name.trim() || (pinProvided && pin.length !== 4) || (!employee && !pinProvided)) {
      toast(t.common.required, "error");
      return;
    }
    const parsedGrace = parseInt(graceMinutes, 10);
    const payload = {
      name: name.trim(),
      isActive,
      assignedShiftKey: assignedShiftKey || undefined,
      shiftStart: shiftStart || undefined,
      shiftEnd: shiftEnd || undefined,
      graceMinutes: Number.isFinite(parsedGrace) ? Math.max(0, parsedGrace) : 0,
    };
    if (employee) {
      updateAttendanceEmployee(employee.id, { ...payload, pin: pinProvided ? pin : undefined });
    } else {
      addAttendanceEmployee({ ...payload, pin });
    }
    toast(t.common.save, "success");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{employee ? t.employees.editEmployee : t.employees.addEmployee}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t.common.name}</Label>
            <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t.employees.attendancePin}{employee ? ` — ${t.employees.pinKeepCurrent}` : ""}</Label>
            <Input
              className="mt-1.5"
              value={pin}
              maxLength={4}
              placeholder={employee ? "••••" : ""}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label>{t.common.active}</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs font-semibold text-muted-foreground">{t.employees.deductionSettings}</p>
            <div>
              <Label>{t.employees.assignedShift}</Label>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {FIXED_SHIFT_WINDOWS.map((win) => (
                  <button
                    key={win.key}
                    type="button"
                    onClick={() => handleSelectShift(win.key)}
                    className={`rounded-lg border px-2 py-2 text-xs font-medium ${
                      assignedShiftKey === win.key ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    {bilingual(win.name, locale)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t.employees.shiftStart}</Label>
                <Input className="mt-1.5" type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} />
              </div>
              <div>
                <Label>{t.employees.shiftEnd}</Label>
                <Input className="mt-1.5" type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>{t.employees.gracePeriod}</Label>
              <Input
                className="mt-1.5"
                type="number"
                min={0}
                value={graceMinutes}
                onChange={(e) => setGraceMinutes(e.target.value)}
              />
            </div>
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
