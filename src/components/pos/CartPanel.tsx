"use client";

import { useState } from "react";
import { ShoppingBag, Minus, Plus, Trash2, X, Tag, PauseCircle, Repeat, UserRound, Phone, Search, Star } from "lucide-react";
import { useCartStore, lineTotal, computeDiscountAmount } from "@/lib/store/useCartStore";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHeldOrdersStore } from "@/lib/store/useHeldOrdersStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { formatMoney, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { createCustomer, searchCustomers, updateCustomer } from "@/lib/supabase/api";

export function CartPanel({ onCharge }: { onCharge: () => void }) {
  const { t, locale } = useI18n();
  const {
    lines,
    incrementLine,
    decrementLine,
    removeLine,
    clearCart,
    orderType,
    discountPercent,
    setDiscountPercent,
    discountFixedAmount,
    setDiscountFixedAmount,
    applySecondaryPricing,
    tableNumber,
    customerName,
    setCustomerName,
  } = useCartStore();
  const settings = useDataStore((s) => s.settings);
  const products = useDataStore((s) => s.products);
  const holdOrder = useHeldOrdersStore((s) => s.holdOrder);
  const currentUser = useAuthStore((s) => s.currentUser);
  const multiPricing = settings.multiPricing;
  const [confirmClear, setConfirmClear] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [fixedDiscountInput, setFixedDiscountInput] = useState("");
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [customerInputName, setCustomerInputName] = useState(customerName ?? "");
  const [customerInputPhone, setCustomerInputPhone] = useState("");
  const [customerLoyaltyEnabled, setCustomerLoyaltyEnabled] = useState(false);
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [customerSaving, setCustomerSaving] = useState(false);

  const branchId = (currentUser as any)?.branchId ?? "";

  const openCustomerDialog = () => {
    setCustomerInputName(customerName ?? "");
    setCustomerInputPhone("");
    setCustomerResults([]);
    setCustomerLoyaltyEnabled(false);
    setShowCustomerDialog(true);
  };

  const handleSearchCustomer = async () => {
    const query = customerInputPhone.trim() || customerInputName.trim();
    if (!branchId || !query) return;

    setCustomerSearching(true);
    try {
      const results = await searchCustomers(branchId, query);
      setCustomerResults(results);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not search customers", "error");
    } finally {
      setCustomerSearching(false);
    }
  };

  const selectCustomer = (customer: any) => {
    setCustomerInputName(customer.name ?? "");
    setCustomerInputPhone(customer.phone ?? "");
    setCustomerLoyaltyEnabled(Boolean(customer.loyaltyEnabled));
    setCustomerResults([]);
  };

  const saveCustomerAndContinue = async () => {
    const name = customerInputName.trim();
    const phone = customerInputPhone.trim();

    if (!name || !phone) {
      toast(locale === "ar" ? "اكتب اسم العميل ورقم الهاتف" : "Enter customer name and phone", "error");
      return;
    }

    if (!branchId) {
      toast(locale === "ar" ? "لم يتم تحديد الفرع الحالي" : "Current branch is not available", "error");
      return;
    }

    setCustomerSaving(true);
    try {
      const existing = await searchCustomers(branchId, phone);
      const exactMatch = existing.find((c: any) => c.phone === phone);

      const saved = exactMatch
        ? await updateCustomer(exactMatch.id, {
            name,
            phone,
            loyaltyEnabled: customerLoyaltyEnabled,
          })
        : await createCustomer({
            branchId,
            name,
            phone,
            loyaltyEnabled: customerLoyaltyEnabled,
          });

      setCustomerName(saved.name);
      setCustomerInputName(saved.name);
      setCustomerInputPhone(saved.phone);
      setCustomerLoyaltyEnabled(saved.loyaltyEnabled);
      setShowCustomerDialog(false);
      toast(
        locale === "ar"
          ? `تم حفظ العميل${saved.loyaltyEnabled ? " وتفعيل الولاء" : ""}`
          : `Customer saved${saved.loyaltyEnabled ? " with loyalty enabled" : ""}`,
        "success"
      );
      onCharge();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save customer", "error");
    } finally {
      setCustomerSaving(false);
    }
  };

  const subtotal = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const discountAmount = computeDiscountAmount(subtotal, discountPercent, discountFixedAmount);
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = settings.taxEnabled ? Math.round(taxableAmount * (settings.taxRate / 100) * 100) / 100 : 0;
  const total = Math.round((taxableAmount + taxAmount) * 100) / 100;
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);

  const handleHold = () => {
    if (lines.length === 0) return;
    holdOrder({
      lines,
      orderType,
      tableNumber,
      customerName,
      discountPercent,
      discountFixedAmount,
      cashierName: currentUser?.name ?? "Unknown",
    });
    clearCart();
    toast(t.pos.holdSuccess, "info");
  };

  const applyDiscount = () => {
    const val = parseFloat(discountInput);
    setDiscountPercent(isNaN(val) ? 0 : val);
    setShowDiscount(false);
    setDiscountInput("");
    setFixedDiscountInput("");
  };

  const applyFixedDiscount = () => {
    const val = parseFloat(fixedDiscountInput);
    setDiscountFixedAmount(isNaN(val) ? 0 : val);
    setShowDiscount(false);
    setDiscountInput("");
    setFixedDiscountInput("");
  };

  const removeDiscount = () => {
    setDiscountPercent(0);
    setDiscountFixedAmount(0);
    setShowDiscount(false);
    setDiscountInput("");
    setFixedDiscountInput("");
  };

  // One-shot bulk action: converts every line CURRENTLY in the cart to its
  // product's secondary price. Not a persistent mode — products added
  // afterward still start at primary price until this is pressed again.
  const handleApplySecondaryPricing = () => {
    if (lines.length === 0) return;
    applySecondaryPricing((productId) => products.find((p) => p.id === productId)?.secondaryPrice);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-card">
      <div className="shrink-0 flex items-center justify-between border-b border-border px-4 py-3.5">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">{t.pos.cart}</h2>
          {itemCount > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
              {itemCount}
            </span>
          )}
        </div>
        {lines.length > 0 && (
          <button
            onClick={() => setConfirmClear(true)}
            className="text-xs font-medium text-muted-foreground hover:text-destructive"
          >
            {t.pos.clearCart}
          </button>
        )}
      </div>

      {/* The ONLY scrollable region in this panel — min-h-0 is load-bearing,
          not decorative: without it, a flex child's default min-height:auto
          can let its content's natural size push this section (and the
          whole cart) taller than the viewport on some browsers instead of
          shrinking to the space actually available, which is exactly the
          "have to scroll the whole page to reach Checkout" bug on short
          screens (e.g. a 1366x768 Chromebook). overflow-y-auto alone isn't
          sufficient guarantee across all Chrome/ChromeOS builds — min-h-0
          makes the shrink-to-fit behavior explicit instead of relying on
          browsers correctly applying that spec edge case. */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 py-2">
        {lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <ShoppingBag className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">{t.pos.emptyCart}</p>
            <p className="text-xs">{t.pos.emptyCartHint}</p>
          </div>
        ) : (
          <ul className="space-y-2.5 py-1">
            {lines.map((line) => (
              <li
                key={line.lineId}
                className="group relative rounded-xl border border-border bg-background p-3 animate-slide-up"
              >
                <button
                  onClick={() => removeLine(line.lineId)}
                  className="absolute end-2 top-2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <p className="pe-5 text-sm font-semibold leading-tight">{bilingual(line.name, locale)}</p>
                {line.modifiers.length > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {line.modifiers.map((m) => bilingual(m.name, locale)).join(", ")}
                  </p>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => decrementLine(line.lineId)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-border active:scale-90"
                    >
                      {line.qty === 1 ? <Trash2 className="h-3.5 w-3.5 text-destructive" /> : <Minus className="h-3.5 w-3.5" />}
                    </button>
                    <span className="w-5 text-center text-sm font-semibold">{line.qty}</span>
                    <button
                      onClick={() => incrementLine(line.lineId)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-border active:scale-90"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-sm font-bold text-primary">
                    {formatMoney(lineTotal(line), settings.currencySymbol)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Never scrolls, never shrinks — always visible at the bottom of the
          cart without the cashier needing to scroll, regardless of screen
          height. Only the item list above (flex-1 min-h-0) gives up space. */}
      <div className="shrink-0 space-y-2 border-t border-border p-4">
        {lines.length > 0 && (
          <div className="flex gap-2 pb-1">
            <button
              onClick={handleHold}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-accent"
            >
              <PauseCircle className="h-3.5 w-3.5" />
              {t.pos.holdOrder}
            </button>
            <button
              onClick={() => setShowDiscount(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-accent"
            >
              <Tag className="h-3.5 w-3.5" />
              {discountFixedAmount > 0
                ? `${formatMoney(discountFixedAmount, settings.currencySymbol)} ${t.common.discount}`
                : discountPercent > 0
                ? `${discountPercent}% ${t.common.discount}`
                : t.pos.discountApply}
            </button>
            {multiPricing?.enabled && (
              <button
                onClick={handleApplySecondaryPricing}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-accent"
                title={bilingual(multiPricing.secondaryLabel, locale)}
              >
                <Repeat className="h-3.5 w-3.5" />
                {bilingual(multiPricing.secondaryLabel, locale)}
              </button>
            )}
          </div>
        )}

        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{t.common.subtotal}</span>
          <span>{formatMoney(subtotal, settings.currencySymbol)}</span>
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between text-sm text-success">
            <span>{t.common.discount}{discountFixedAmount === 0 && discountPercent > 0 ? ` (${discountPercent}%)` : ""}</span>
            <span>-{formatMoney(discountAmount, settings.currencySymbol)}</span>
          </div>
        )}
        {settings.taxEnabled && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>
              {t.common.tax} ({settings.taxRate}%)
            </span>
            <span>{formatMoney(taxAmount, settings.currencySymbol)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
          <span>{t.common.total}</span>
          <span className="text-primary">{formatMoney(total, settings.currencySymbol)}</span>
        </div>
        <Button
          size="xl"
          className="w-full mt-2 shadow-lg"
          disabled={lines.length === 0}
          onClick={onCharge}
        >
          {t.pos.charge} · {formatMoney(total, settings.currencySymbol)}
        </Button>
      </div>

      {confirmClear && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6" onClick={() => setConfirmClear(false)}>
          <div
            className="w-full max-w-xs rounded-xl bg-background p-5 shadow-xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-4 text-sm font-medium">{t.pos.clearCart}?</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmClear(false)}>
                {t.common.cancel}
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  clearCart();
                  setConfirmClear(false);
                }}
              >
                {t.common.delete}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showCustomerDialog && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowCustomerDialog(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-background p-5 shadow-2xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">
                  {locale === "ar" ? "بيانات العميل" : "Customer details"}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {locale === "ar"
                    ? "سجل العميل ويمكنك تفعيل نقاط الولاء له"
                    : "Save the customer and optionally enable loyalty"}
                </p>
              </div>
              <button
                onClick={() => setShowCustomerDialog(false)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  {locale === "ar" ? "اسم العميل" : "Customer name"}
                </label>
                <input
                  value={customerInputName}
                  onChange={(e) => setCustomerInputName(e.target.value)}
                  placeholder={locale === "ar" ? "مثال: أحمد محمد" : "e.g. Ahmed Mohamed"}
                  className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  {locale === "ar" ? "رقم الهاتف" : "Phone number"}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Phone className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={customerInputPhone}
                      onChange={(e) => setCustomerInputPhone(e.target.value)}
                      placeholder="01xxxxxxxxx"
                      className="w-full rounded-lg border border-input bg-background py-2.5 ps-9 pe-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSearchCustomer}
                    disabled={customerSearching || (!customerInputName.trim() && !customerInputPhone.trim())}
                  >
                    <Search className="me-1.5 h-4 w-4" />
                    {locale === "ar" ? "بحث" : "Search"}
                  </Button>
                </div>
              </div>

              {customerResults.length > 0 && (
                <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-border p-2">
                  {customerResults.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => selectCustomer(customer)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-start hover:bg-accent"
                    >
                      <span>
                        <span className="block text-sm font-medium">{customer.name}</span>
                        <span className="block text-xs text-muted-foreground">{customer.phone}</span>
                      </span>
                      {customer.loyaltyEnabled && (
                        <Star className="h-4 w-4 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border p-3">
                <span className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-primary" />
                  <span>
                    <span className="block text-sm font-medium">
                      {locale === "ar" ? "تفعيل نقاط الولاء" : "Enable loyalty"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {locale === "ar"
                        ? "يمكن تغييره لكل عميل بشكل مستقل"
                        : "Can be changed independently for each customer"}
                    </span>
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={customerLoyaltyEnabled}
                  onChange={(e) => setCustomerLoyaltyEnabled(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
              </label>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowCustomerDialog(false)}
                >
                  {locale === "ar" ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={customerSaving}
                  onClick={saveCustomerAndContinue}
                >
                  {customerSaving
                    ? locale === "ar"
                      ? "جاري الحفظ..."
                      : "Saving..."
                    : locale === "ar"
                      ? "حفظ ومتابعة الدفع"
                      : "Save & continue"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDiscount && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6" onClick={() => setShowDiscount(false)}>
          <div
            className="w-full max-w-xs rounded-xl bg-background p-5 shadow-xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-sm font-semibold">{t.pos.discountPercent}</p>
            <div className="mb-3 grid grid-cols-4 gap-2">
              {[5, 10, 15, 20].map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setDiscountInput(String(p));
                    setFixedDiscountInput("");
                  }}
                  className={cn(
                    "rounded-lg border py-2 text-sm font-semibold",
                    discountInput === String(p) ? "border-primary bg-primary text-primary-foreground" : "border-border"
                  )}
                >
                  {p}%
                </button>
              ))}
            </div>
            <input
              type="number"
              value={discountInput}
              onChange={(e) => {
                setDiscountInput(e.target.value);
                if (e.target.value) setFixedDiscountInput("");
              }}
              placeholder="0"
              className="mb-4 w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
            />

            <div className="mb-4 flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium text-muted-foreground">{t.common.or}</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <p className="mb-2 text-sm font-semibold">{t.pos.discountFixedAmount}</p>
            <div className="relative mb-4">
              <input
                type="number"
                value={fixedDiscountInput}
                onChange={(e) => {
                  setFixedDiscountInput(e.target.value);
                  if (e.target.value) setDiscountInput("");
                }}
                placeholder="0"
                className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {settings.currencySymbol}
              </span>
            </div>

            <div className="flex gap-2">
              {(discountPercent > 0 || discountFixedAmount > 0) && (
                <Button variant="outline" className="flex-1" onClick={removeDiscount}>
                  {t.pos.removeDiscount}
                </Button>
              )}
              <Button className="flex-1" onClick={fixedDiscountInput ? applyFixedDiscount : applyDiscount}>
                {t.pos.applyDiscount}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
