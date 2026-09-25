"use client";

import { useState } from "react";
import { Lock, CheckCircle2, Delete } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useDataStore } from "@/lib/store/useDataStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { verifyAttendancePin, getOpenAttendance } from "@/lib/supabase/api";
import { useI18n, bilingual } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { FIXED_SHIFT_WINDOWS, DEFAULT_SHIFT_TEMPLATES, selectableShiftKey, minutesPastOfficialTime } from "@/lib/attendance";
import type { Attendance, AttendanceEmployee } from "@/lib/types";

// Attendance is independent from the login account — it uses its own
// AttendanceEmployee roster (name + PIN, no role) managed by the owner on
// the Employees page, entirely separate from `staff`/login credentials.
export default function AttendancePage() {
  const { t, locale } = useI18n();
  const attendanceEmployees = useDataStore((s) => s.attendanceEmployees);
  const checkInAttendance = useDataStore((s) => s.checkInAttendance);
  const checkOutAttendance = useDataStore((s) => s.checkOutAttendance);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);

  const [selected, setSelected] = useState<AttendanceEmployee | null>(null);
  const [pin, setPin] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [shake, setShake] = useState(false);
  // undefined = PIN not verified yet; null = verified, no open attendance (show check-in); Attendance = verified, open record (show check-out)
  const [openRecord, setOpenRecord] = useState<Attendance | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const now = new Date();
  const selectableKey = selectableShiftKey(now);

  const reset = () => {
    setSelected(null);
    setPin("");
    setOpenRecord(undefined);
  };

  const handleSelectEmployee = (emp: AttendanceEmployee) => {
    setSelected(emp);
    setPin("");
  };

  const attemptVerify = async (candidate: string) => {
    if (!selected || !currentBranchId) return;
    setVerifying(true);
    try {
      const emp = await verifyAttendancePin(selected.id, candidate, currentBranchId);
      if (emp) {
        const existing = await getOpenAttendance(currentBranchId, selected.id);
        setOpenRecord(existing);
        setVerifying(false);
        return;
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    }
    setVerifying(false);
    setShake(true);
    setTimeout(() => {
      setShake(false);
      setPin("");
    }, 400);
  };

  const handleDigit = (d: string) => {
    if (!selected || verifying) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      setTimeout(() => attemptVerify(next), 150);
    }
  };

  const handleCheckIn = async (shiftKey: string) => {
    if (!selected) return;
    // Prefer this employee's own owner-configured Shift Start/End/Grace
    // (see Employees > deduction settings); fall back to the shift's
    // generic default official times with 0 grace when unconfigured.
    const fallback = DEFAULT_SHIFT_TEMPLATES.find((tp) => tp.key === shiftKey);
    const officialStart = selected.shiftStart || fallback?.officialStart;
    const officialEnd = selected.shiftEnd || fallback?.officialEnd;
    if (!officialStart || !officialEnd) return;
    const graceMinutes = selected.shiftStart ? selected.graceMinutes ?? 0 : 0;
    setSubmitting(true);
    try {
      await checkInAttendance(shiftKey, officialStart, officialEnd, selected.id, selected.name, graceMinutes);
      toast(t.attendance.checkedIn, "success");
      reset();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckOut = async () => {
    if (!openRecord) return;
    setSubmitting(true);
    try {
      await checkOutAttendance(openRecord.id);
      toast(t.attendance.checkedOut, "success");
      reset();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const activeEmployees = attendanceEmployees.filter((e) => e.isActive);

  return (
    <AppShell title={t.attendance.title}>
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 p-4 sm:p-6 pb-10">
        {!selected ? (
          activeEmployees.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">{t.common.noResults}</p>
          ) : (
            <div className="grid w-full grid-cols-3 gap-3 py-2">
              {activeEmployees.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => handleSelectEmployee(emp)}
                  className="flex flex-col items-center gap-2 rounded-xl border border-border p-3 hover:bg-accent"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {emp.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <p className="text-center text-xs font-medium">{emp.name}</p>
                </button>
              ))}
            </div>
          )
        ) : openRecord === undefined ? (
          <div className={cn("flex flex-col items-center gap-5 py-2", shake && "animate-shake")}>
            <p className="text-sm font-medium">{selected.name}</p>
            <div className="flex gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "h-3.5 w-3.5 rounded-full border-2",
                    pin.length > i ? "border-primary bg-primary" : "border-border"
                  )}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button
                  key={d}
                  onClick={() => handleDigit(d)}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border text-lg font-semibold active:scale-90"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => setSelected(null)}
                className="flex h-14 w-14 items-center justify-center rounded-2xl text-xs text-muted-foreground"
              >
                {t.common.back}
              </button>
              <button
                onClick={() => handleDigit("0")}
                className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border text-lg font-semibold active:scale-90"
              >
                0
              </button>
              <button
                onClick={() => setPin((p) => p.slice(0, -1))}
                className="flex h-14 w-14 items-center justify-center rounded-2xl text-muted-foreground"
              >
                <Delete className="h-5 w-5" />
              </button>
            </div>
          </div>
        ) : openRecord ? (
          <div className="w-full space-y-4 py-2">
            <div className="space-y-2 rounded-xl bg-muted p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.attendance.checkOutTime}</span>
                <span className="font-medium">
                  {now.toLocaleTimeString(locale === "ar" ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.attendance.lateMinutes}</span>
                <span className="font-medium">{openRecord.lateMinutes} min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.attendance.workedHours}</span>
                <span className="font-medium">
                  {Math.max(0, Math.round((now.getTime() - new Date(openRecord.checkInAt).getTime()) / 60000))} min
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.attendance.overtime}</span>
                <span className="font-medium">{Math.max(0, minutesPastOfficialTime(now, openRecord.officialEnd))} min</span>
              </div>
            </div>
            <button
              className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              disabled={submitting}
              onClick={handleCheckOut}
            >
              {t.attendance.checkOut}
            </button>
          </div>
        ) : selectableKey === null ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Lock className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">{t.attendance.noWindowOpen}</p>
          </div>
        ) : (
          <div className="w-full space-y-3 py-2">
            <p className="text-xs text-muted-foreground">{t.attendance.selectShift}</p>
            {FIXED_SHIFT_WINDOWS.map((win) => {
              const enabled = win.key === selectableKey;
              return (
                <button
                  key={win.key}
                  disabled={!enabled || submitting}
                  onClick={() => handleCheckIn(win.key)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border p-4",
                    enabled ? "border-primary bg-primary/5" : "border-border opacity-50"
                  )}
                >
                  <div className="text-start">
                    <p className="text-sm font-semibold">{bilingual(win.name, locale)}</p>
                    <p className="text-xs text-muted-foreground">
                      {win.windowStart} - {win.windowEnd}
                    </p>
                  </div>
                  {enabled ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
