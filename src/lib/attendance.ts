import type { ShiftTemplate } from "@/lib/types";

// Fixed attendance selection windows — replaces the old per-branch
// "closest shift" window matching entirely. Exactly one of these three is
// ever enabled at a time, purely based on the current time; there is no
// owner-configurable override for these specific boundaries.
export const FIXED_SHIFT_WINDOWS: { key: string; name: { en: string; ar: string }; windowStart: string; windowEnd: string }[] = [
  { key: "morning", name: { en: "Morning Shift", ar: "الوردية الصباحية" }, windowStart: "07:00", windowEnd: "11:00" },
  { key: "between", name: { en: "Between Shift", ar: "الوردية المسائية" }, windowStart: "11:00", windowEnd: "15:00" },
  { key: "night", name: { en: "Night Shift", ar: "الوردية الليلية" }, windowStart: "15:00", windowEnd: "19:00" },
];

// Default official start/end per shift key, used only as a fallback for
// lateness/overtime math when an employee has no owner-configured Shift
// Start/End Time of their own yet (see Employees > deduction settings).
export const DEFAULT_SHIFT_TEMPLATES: ShiftTemplate[] = [
  { key: "morning", name: { en: "Morning", ar: "صباحي" }, officialStart: "08:00", officialEnd: "16:00", windowStart: "07:00", windowEnd: "11:00" },
  { key: "between", name: { en: "Between", ar: "مسائي" }, officialStart: "12:00", officialEnd: "20:00", windowStart: "11:00", windowEnd: "15:00" },
  { key: "night", name: { en: "Night", ar: "ليلي" }, officialStart: "16:00", officialEnd: "00:00", windowStart: "15:00", windowEnd: "19:00" },
];

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** True if `now` falls within [start, end), handling windows that wrap past midnight (e.g. 23:30 -> 02:00). */
export function isWithinWindow(now: Date, start: string, end: string): boolean {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s <= e) return nowMin >= s && nowMin < e;
  return nowMin >= s || nowMin < e;
}

/** Which single fixed shift window (if any) is currently open, based purely
 * on the current time. At most one is ever open — the three windows
 * (07:00-11:00, 11:00-15:00, 15:00-19:00) don't overlap and don't cover the
 * full 24h day, so outside all three this returns null. */
export function selectableShiftKey(now: Date = new Date()): string | null {
  const match = FIXED_SHIFT_WINDOWS.find((w) => isWithinWindow(now, w.windowStart, w.windowEnd));
  return match?.key ?? null;
}

/** Minutes between `officialTime` (HH:MM, today) and `at` — positive if `at` is later. */
export function minutesPastOfficialTime(at: Date, officialTime: string): number {
  const [h, m] = officialTime.split(":").map(Number);
  const official = new Date(at);
  official.setHours(h, m, 0, 0);
  return Math.round((at.getTime() - official.getTime()) / 60000);
}
