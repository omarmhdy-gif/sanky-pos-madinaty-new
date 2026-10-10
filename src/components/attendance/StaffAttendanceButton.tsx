"use client";

import { useState } from "react";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { useDataStore } from "@/lib/store/useDataStore";

function timeOfDay(date: Date) {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function StaffAttendanceButton({ onCheckedIn }: { onCheckedIn?: () => void }) {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.currentUser);
  const branchId = useBranchStore((s) => s.currentBranchId);
  const attendance = useDataStore((s) => s.attendance);
  const checkInAttendance = useDataStore((s) => s.checkInAttendance);
  const checkOutAttendance = useDataStore((s) => s.checkOutAttendance);
  const [submitting, setSubmitting] = useState(false);

  const openRecord = attendance.find(
    (record) => record.shiftKey === "staff" && record.employeeId === user?.id && !record.checkOutAt
  );

  const handleClick = async () => {
    if (!user || !branchId || submitting) return;
    setSubmitting(true);
    try {
      if (openRecord) {
        await checkOutAttendance(openRecord.id);
        toast(t.attendance.checkedOut, "success");
      } else {
        const now = new Date();
        const time = timeOfDay(now);
        // Login-account attendance has no configured work schedule, so use
        // the punch time as the official start and end-of-day as its boundary.
        await checkInAttendance("staff", time, "23:59", user.id, user.name, 0);
        toast(t.attendance.checkedIn, "success");
        onCheckedIn?.();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save attendance", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={!user || submitting}
      aria-label={openRecord ? t.attendance.checkOut : t.attendance.checkIn}
      title={openRecord ? t.attendance.checkOut : t.attendance.checkIn}
      className="gap-1.5 px-2.5 sm:px-3"
    >
      <Clock3 className="h-4 w-4" />
      <span className="hidden lg:inline">{openRecord ? t.attendance.checkOut : t.attendance.checkIn}</span>
    </Button>
  );
}
