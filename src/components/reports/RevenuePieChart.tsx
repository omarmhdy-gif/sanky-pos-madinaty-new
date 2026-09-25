"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatMoney } from "@/lib/utils";

const PIE_COLORS = ["#8f6339", "#d97706", "#059669", "#0284c7", "#db2777", "#7c3aed", "#dc2626"];

export function RevenuePieChart({
  data,
  currencySymbol,
}: {
  data: { name: string; revenue: number }[];
  currencySymbol: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={(entry) => entry.name}>
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => formatMoney(value, currencySymbol)} />
      </PieChart>
    </ResponsiveContainer>
  );
}
