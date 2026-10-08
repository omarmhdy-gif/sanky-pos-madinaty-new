import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  accent = "primary",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  trend?: { value: string; positive: boolean };
  accent?: "primary" | "success" | "amber" | "sky";
}) {
  const styles = {
    primary: {
      icon: "bg-[#eadfd3] text-[#6f4528]",
      line: "bg-[#6f4528]",
    },
    success: {
      icon: "bg-[#e5edda] text-[#628047]",
      line: "bg-[#628047]",
    },
    amber: {
      icon: "bg-[#fff0d8] text-[#df8a12]",
      line: "bg-[#df8a12]",
    },
    sky: {
      icon: "bg-[#dff2fb] text-[#168bc9]",
      line: "bg-[#168bc9]",
    },
  };

  const style = styles[accent];

  return (
    <div className="group relative overflow-hidden rounded-[20px] border border-[#e7ded2] bg-white p-5 shadow-[0_3px_16px_rgba(72,48,30,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(72,48,30,0.10)]">
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-[18px]",
            style.icon
          )}
        >
          <Icon className="h-8 w-8" strokeWidth={2} />
        </div>

        <div className="min-w-0 flex-1 pt-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[14px] font-medium text-[#786b5f]">
              {label}
            </p>

            <span className="text-[#8d8175] opacity-0 transition-opacity group-hover:opacity-100">
              •••
            </span>
          </div>

          <p className="mt-1 text-[29px] font-bold leading-none tracking-[-0.025em] text-[#241b15]">
            {value}
          </p>

          {trend && (
            <p
              className={cn(
                "mt-2 text-xs font-medium",
                trend.positive ? "text-[#4d8b43]" : "text-destructive"
              )}
            >
              {trend.positive ? "↗" : "↘"} {trend.positive ? "+" : ""}
              {trend.value}
            </p>
          )}
        </div>
      </div>

      <div
        className={cn(
          "absolute bottom-0 left-6 right-6 h-[2px] origin-left scale-x-0 transition-transform duration-200 group-hover:scale-x-100",
          style.line
        )}
      />
    </div>
  );
}