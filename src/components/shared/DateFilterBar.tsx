"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { DateFilterKey } from "@/lib/analytics";

export function DateFilterBar({
  filter,
  onFilterChange,
  customFrom,
  customTo,
  onCustomChange,
}: {
  filter: DateFilterKey;
  onFilterChange: (f: DateFilterKey) => void;
  customFrom: string;
  customTo: string;
  onCustomChange: (from: string, to: string) => void;
}) {
  const { t } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);

  const presets: [DateFilterKey, string][] = [
    ["today", t.orders.filterToday],
    ["yesterday", t.orders.filterYesterday],
    ["week", t.orders.filterWeek],
    ["month", t.orders.filterMonth],
    ["all", t.orders.filterAll],
  ];

  return (
    <div className="relative flex items-center gap-2">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {presets.map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setPickerOpen(false);
              onFilterChange(key);
            }}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-xs font-medium border",
              filter === key ? "bg-primary text-primary-foreground border-primary" : "border-border"
            )}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className={cn(
            "shrink-0 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium border",
            filter === "custom" ? "bg-primary text-primary-foreground border-primary" : "border-border"
          )}
        >
          <Calendar className="h-3.5 w-3.5" />
          {t.orders.filterCustom}
        </button>
      </div>

      {pickerOpen && (
        <div
          className="absolute end-0 top-full z-30 mt-2 w-64 rounded-xl border border-border bg-popover p-3 shadow-md"
          onClick={(e) => e.stopPropagation()}
        >
          <label className="text-xs text-muted-foreground">{t.orders.fromDate}</label>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => onCustomChange(e.target.value, customTo || e.target.value)}
            className="mb-2 mt-1 w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm"
          />
          <label className="text-xs text-muted-foreground">{t.orders.toDate}</label>
          <input
            type="date"
            value={customTo}
            onChange={(e) => onCustomChange(customFrom || e.target.value, e.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm"
          />
          <button
            onClick={() => {
              if (!customFrom || !customTo) return;
              onFilterChange("custom");
              setPickerOpen(false);
            }}
            disabled={!customFrom || !customTo}
            className="mt-3 w-full rounded-lg bg-primary py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {t.common.apply}
          </button>
        </div>
      )}
    </div>
  );
}
