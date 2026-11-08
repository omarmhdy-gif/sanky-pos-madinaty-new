import type { OrderCancellationReason, OrderCancellationSettings } from "@/lib/types";

export const DEFAULT_ORDER_CANCELLATION_REASONS: OrderCancellationReason[] = [
  { id: "changed_mind", name: { en: "Customer changed their mind", ar: "العميل غير رأيه" } },
  { id: "entered_by_mistake", name: { en: "Order entered by mistake", ar: "تم إدخال الطلب بالخطأ" } },
  { id: "item_unavailable", name: { en: "Item unavailable", ar: "الصنف غير متوفر" } },
  { id: "long_wait", name: { en: "Long waiting time", ar: "طول وقت الانتظار" } },
];

export const DEFAULT_ORDER_CANCELLATION_SETTINGS: OrderCancellationSettings = {
  requireReason: true,
  allowCustomReason: true,
  reasons: DEFAULT_ORDER_CANCELLATION_REASONS,
};

export function getOrderCancellationSettings(
  value?: Partial<OrderCancellationSettings> | null
): OrderCancellationSettings {
  const reasons = Array.isArray(value?.reasons)
    ? value.reasons.filter((reason): reason is OrderCancellationReason =>
        Boolean(reason && typeof reason.id === "string" && typeof reason.name?.en === "string" && typeof reason.name?.ar === "string")
      )
    : DEFAULT_ORDER_CANCELLATION_REASONS;

  return {
    requireReason: value?.requireReason ?? true,
    allowCustomReason: value?.allowCustomReason ?? true,
    reasons,
  };
}
