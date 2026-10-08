"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, CreditCard, CheckCircle2, Printer, Plus, Split, CloudOff, Trash2, Search, UserRound, Phone, Gift } from "lucide-react";
import { externalPaymentMethods, getExternalPaymentIcon } from "@/lib/externalPayment";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCartStore, lineTotal, computeDiscountAmount } from "@/lib/store/useCartStore";
import { useDataStore } from "@/lib/store/useDataStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { useDeviceSettingsStore } from "@/lib/store/useDeviceSettingsStore";
import { useOrderQueueStore } from "@/lib/store/useOrderQueueStore";
import { useSystemLogStore } from "@/lib/store/useSystemLogStore";
import { isLikelyNetworkFailure } from "@/lib/network";
import { useI18n, bilingual } from "@/lib/i18n";
import { formatMoney, cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import type { Customer, ExternalPaymentMethod, LoyaltySettings, Order, PaymentMethod, SplitPaymentPart } from "@/lib/types";
import { createCustomer, searchCustomers, refreshCustomerLoyalty, fetchLoyaltySettings } from "@/lib/supabase/api";
import { supabase } from "@/lib/supabase/client";
import { ReceiptView } from "@/components/pos/ReceiptView";
import { printOrderReceipt } from "@/lib/printing/printReceipt";

// How long the completed-order confirmation screen stays up before
// automatically returning to POS with an empty cart — no click required
// (see reset()/handleNewOrder() below). Manual Print/New Order buttons stay
// available the whole time for a cashier who wants to act before the timer.
const AUTO_RETURN_MS = 1800;

// A long press on the Cash button is a shortcut for the entire cash flow
// (method + Exact Amount + Complete Sale) in one gesture — a normal tap
// still opens the tender screen exactly as before. See PaymentMethodButton.
const LONG_PRESS_MS = 700;

export function PaymentDialog({
  open,
  onOpenChange,
  onOrderComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOrderComplete?: () => void;
}) {
  const { t, locale } = useI18n();
  const cart = useCartStore();
  const settings = useDataStore((s) => s.settings);
  const addOrder = useDataStore((s) => s.addOrder);
  const shifts = useDataStore((s) => s.shifts);
  const currentUser = useAuthStore((s) => s.currentUser);
  const branches = useBranchStore((s) => s.branches);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);
  const deviceSettings = useDeviceSettingsStore();
  const enqueueOfflineOrder = useOrderQueueStore((s) => s.enqueue);
  const openShift = currentUser
    ? shifts.find((s) => s.cashierId === currentUser.id && s.status === "open")
    : undefined;
  const externalMethods = externalPaymentMethods(settings);

  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [tendered, setTendered] = useState<number | null>(null);
  const [splitCash, setSplitCash] = useState("");
  const [wasteReason, setWasteReason] = useState("");
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [queuedOffline, setQueuedOffline] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [printing, setPrinting] = useState(false);

  // Customer information is collected before payment for normal sales.
  const [checkoutStep, setCheckoutStep] = useState<"customer" | "payment">("customer");
  const [skipCustomerAndLoyalty, setSkipCustomerAndLoyalty] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerNameInput, setCustomerNameInput] = useState("");
  const [customerPhoneInput, setCustomerPhoneInput] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearchResults, setCustomerSearchResults] = useState<Customer[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [loyaltyEnabledInput, setLoyaltyEnabledInput] = useState(false);
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerError, setCustomerError] = useState("");
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings | null>(null);
  const [loyaltyRedeemPoints, setLoyaltyRedeemPoints] = useState(0);

  const branchName = bilingual(branches.find((b) => b.id === currentBranchId)?.name ?? { en: "", ar: "" }, locale);

  useEffect(() => {
    if (!open || !cart.promoCode || !cart.customerId) return;
    let cancelled = false;
    setCustomerSaving(true);
    refreshCustomerLoyalty(cart.customerId)
      .then((customer) => {
        if (cancelled) return;
        setSelectedCustomer(customer);
        setCustomerNameInput(customer.name);
        setCustomerPhoneInput(customer.phone);
        setLoyaltyEnabledInput(customer.loyaltyEnabled);
        setSkipCustomerAndLoyalty(false);
      })
      .catch((err) => {
        if (!cancelled) setCustomerError(err instanceof Error ? err.message : "Failed to load the promo customer");
      })
      .finally(() => {
        if (!cancelled) setCustomerSaving(false);
      });
    return () => { cancelled = true; };
  }, [open, cart.promoCode, cart.customerId]);

  // Never lets a printer failure block or freeze checkout — the order is
  // already completed by the time this runs; printing is a best-effort
  // side effect the cashier can always retry via the button below.
  const handlePrint = async (order: Order, openDrawer: boolean) => {
    setPrinting(true);
    try {
      await printOrderReceipt({ order, settings, branchName, locale, openDrawer });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to print receipt", "error");
    } finally {
      setPrinting(false);
    }
  };

  const subtotal = cart.lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const discountAmount = computeDiscountAmount(subtotal, cart.discountPercent, cart.discountFixedAmount);
  const baseTaxable = Math.max(0, subtotal - discountAmount);

  const maxRedeemablePoints = useMemo(() => {
    if (!selectedCustomer || !loyaltySettings?.enabled || !selectedCustomer.loyaltyEnabled) return 0;
    if (loyaltySettings.pointsPerReward <= 0 || loyaltySettings.rewardAmount <= 0) return 0;
    if (selectedCustomer.loyaltyPoints < loyaltySettings.pointsPerReward) return 0;
    const maxByPoints = Math.floor(selectedCustomer.loyaltyPoints / loyaltySettings.pointsPerReward) * loyaltySettings.pointsPerReward;
    const maxByOrderValue = Math.floor(Math.max(0, (baseTaxable - 0.01) / loyaltySettings.rewardAmount)) * loyaltySettings.pointsPerReward;
    return Math.max(0, Math.min(maxByPoints, maxByOrderValue));
  }, [selectedCustomer, loyaltySettings, baseTaxable]);

  const loyaltyDiscount = loyaltySettings && loyaltySettings.pointsPerReward > 0
    ? (loyaltyRedeemPoints / loyaltySettings.pointsPerReward) * loyaltySettings.rewardAmount
    : 0;
  const totalDiscountAmount = discountAmount + loyaltyDiscount;
  const taxable = Math.max(0, subtotal - totalDiscountAmount);
  const taxAmount = settings.taxEnabled ? Math.round(taxable * (settings.taxRate / 100) * 100) / 100 : 0;
  const total = Math.round((taxable + taxAmount) * 100) / 100;

  const quickAmounts = useMemo(() => {
    const rounded = Math.ceil(total / 10) * 10;
    const set = new Set([total, rounded, rounded + 20, rounded + 50]);
    return Array.from(set).sort((a, b) => a - b).slice(0, 4);
  }, [total]);

  const changeDue = tendered !== null ? Math.max(0, tendered - total) : 0;

  const reset = () => {
    setMethod(null);
    setTendered(null);
    setSplitCash("");
    setWasteReason("");
    setCompletedOrder(null);
    setQueuedOffline(false);
    setCheckoutStep("customer");
    setSkipCustomerAndLoyalty(false);
    setCustomerQuery("");
    setCustomerNameInput("");
    setCustomerPhoneInput("");
    setSelectedCustomer(null);
    setCustomerSearchResults([]);
    setLoyaltyEnabledInput(false);
    setCustomerSaving(false);
    setCustomerError("");
    setLoyaltySettings(null);
    setLoyaltyRedeemPoints(0);
  };

  const chooseCustomer = async (customer: Customer) => {
    setCustomerSaving(true);
    setCustomerError("");
    try {
      const refreshedCustomer = await refreshCustomerLoyalty(customer.id);
      setSelectedCustomer(refreshedCustomer);
      setCustomerNameInput(refreshedCustomer.name);
      setCustomerPhoneInput(refreshedCustomer.phone);
      setLoyaltyEnabledInput(refreshedCustomer.loyaltyEnabled);
      setCustomerQuery("");
      setCustomerSearchResults([]);
      setLoyaltyRedeemPoints(0);
    } catch (err) {
      setCustomerError(err instanceof Error ? err.message : "Failed to refresh customer loyalty");
    } finally {
      setCustomerSaving(false);
    }
  };

  useEffect(() => {
    if (checkoutStep !== "payment" || !currentBranchId || !selectedCustomer) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchLoyaltySettings(currentBranchId);
        if (!cancelled) setLoyaltySettings(data);
      } catch (err) {
        if (!cancelled) setCustomerError(err instanceof Error ? err.message : "Failed to load loyalty settings");
      }
    })();
    return () => { cancelled = true; };
  }, [checkoutStep, currentBranchId, selectedCustomer?.id]);

  useEffect(() => {
    setLoyaltyRedeemPoints((current) => Math.min(current, maxRedeemablePoints));
  }, [maxRedeemablePoints]);

  const handleCustomerSearch = async () => {
    const query = customerQuery.trim();
    if (!query || !currentBranchId) {
      setCustomerSearchResults([]);
      return;
    }
    setCustomerSearching(true);
    setCustomerError("");
    try {
      setCustomerSearchResults(await searchCustomers(currentBranchId, query));
    } catch (err) {
      setCustomerError(err instanceof Error ? err.message : "Failed to search customers");
    } finally {
      setCustomerSearching(false);
    }
  };

  const continueToPayment = async () => {
    if (cart.promoCode && (!cart.customerId || selectedCustomer?.id !== cart.customerId)) {
      setCustomerError(locale === "ar" ? "اختَر العميل المسجل المرتبط بكود الخصم للمتابعة." : "Select the registered customer linked to this promo code to continue.");
      return;
    }
    if (skipCustomerAndLoyalty) {
      setSelectedCustomer(null);
      setCustomerNameInput("");
      setCustomerPhoneInput("");
      setLoyaltyRedeemPoints(0);
      setCustomerError("");
      setCheckoutStep("payment");
      return;
    }
    const name = customerNameInput.trim();
    const phone = customerPhoneInput.trim();
    if (!name || !phone) {
      setCustomerError("Please enter customer name and phone number.");
      return;
    }
    if (!currentBranchId) {
      setCustomerError("No active branch selected.");
      return;
    }
    setCustomerSaving(true);
    setCustomerError("");
    try {
      let customer = selectedCustomer;
      if (!customer) {
        customer = await createCustomer({
          branchId: currentBranchId,
          name,
          phone,
          loyaltyEnabled: loyaltyEnabledInput,
        });
      } else if (customer.name !== name || customer.phone !== phone || customer.loyaltyEnabled !== loyaltyEnabledInput) {
        const { data, error } = await supabase
          .from("customers")
          .update({ name, phone, loyalty_enabled: loyaltyEnabledInput })
          .eq("id", customer.id)
          .eq("branch_id", currentBranchId)
          .select()
          .single();
        if (error) throw new Error(error.message);
        customer = { ...customer, name: data.name, phone: data.phone, loyaltyEnabled: data.loyalty_enabled };
      }
      setSelectedCustomer(customer);
      setCustomerNameInput(customer.name);
      setCustomerPhoneInput(customer.phone);
      setLoyaltyEnabledInput(customer.loyaltyEnabled);
      setCheckoutStep("payment");
    } catch (err) {
      setCustomerError(err instanceof Error ? err.message : "Failed to save customer");
    } finally {
      setCustomerSaving(false);
    }
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleNewOrder = () => {
    reset();
    onOpenChange(false);
    onOrderComplete?.();
  };

  // Auto-return to POS once an order completes (success or offline-queued)
  // — cashier is ready for the next customer with no extra click. The
  // Print Receipt / New Order buttons below stay available for anyone who
  // wants to act sooner (e.g. reprint before the timer fires).
  useEffect(() => {
    if (!completedOrder) return;
    const id = setTimeout(handleNewOrder, AUTO_RETURN_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedOrder]);

  const finalizeOrder = async (
    paymentMethod: PaymentMethod,
    tenderedAmount?: number,
    splitParts?: SplitPaymentPart[],
    wasteReasonText?: string,
    externalMethod?: ExternalPaymentMethod
  ) => {
    if (cart.promoCode && (!cart.customerId || selectedCustomer?.id !== cart.customerId)) {
      setCheckoutStep("customer");
      setCustomerError(locale === "ar" ? "لا يمكن استخدام البرومو كود بدون العميل المسجل المرتبط به." : "A promo code requires its registered customer.");
      return;
    }
    setSubmitting(true);
    const payload = {
      shiftId: openShift?.id,
      lines: cart.lines,
      subtotal,
      discountAmount: totalDiscountAmount,
      discountPercent: cart.discountPercent,
      promoCode: cart.promoCode,
      taxAmount,
      taxRate: settings.taxEnabled ? settings.taxRate : 0,
      total,
      payment: {
        method: paymentMethod,
        amount: total,
        tenderedAmount,
        changeDue: tenderedAmount ? Math.max(0, tenderedAmount - total) : undefined,
        splitParts,
        externalMethodId: externalMethod?.id,
        externalMethodName: externalMethod?.name,
        externalMethodIcon: externalMethod?.icon,
      },
      status: "completed" as const,
      type: cart.orderType,
      tableNumber: cart.tableNumber,
      customerName: (selectedCustomer?.name ?? customerNameInput.trim()) || undefined,
      customerId: selectedCustomer?.id,
      cashierId: currentUser?.id ?? "unknown",
      cashierName: currentUser?.name ?? "Unknown",
      createdAt: new Date().toISOString(),
      wasteReason: wasteReasonText,
    };
    try {
      const order = await addOrder(payload);

      if (loyaltyRedeemPoints > 0 && selectedCustomer) {
        const { error: loyaltyError } = await supabase.rpc("redeem_customer_points", {
          p_customer_id: selectedCustomer.id,
          p_order_id: order.id,
          p_points: loyaltyRedeemPoints,
        });
        if (loyaltyError) {
          toast(`Order completed, but loyalty redemption failed: ${loyaltyError.message}`, "error");
        }
      }

      setCompletedOrder(order);
      setQueuedOffline(false);
      cart.clearCart();
      toast(`${t.pos.orderComplete} #${order.orderNumber}`, "success");
      if (deviceSettings.autoPrintReceipt) {
        handlePrint(order, paymentMethod === "cash" && deviceSettings.autoOpenDrawer);
      }
    } catch (err) {
      // Offline protection: a network-shaped failure doesn't lose the sale
      // or freeze the till. The payload is queued (not injected into
      // useDataStore.orders as a fake Order — see useOrderQueueStore for
      // why) and the background monitor syncs it automatically once
      // Supabase is reachable again, getting its real id/orderNumber only
      // at that point. The cashier sees this as a normal completed sale —
      // the cart clears and a receipt still prints (printing never
      // depended on Supabase in the first place).
      if (currentBranchId && isLikelyNetworkFailure(err)) {
        enqueueOfflineOrder(currentBranchId, payload);
        useSystemLogStore.getState().log(`Order queued offline (${formatMoney(total, settings.currencySymbol)}) — will sync automatically`, "warning");
        const previewOrder: Order = { ...payload, id: "pending", orderNumber: 0, branchId: currentBranchId };
        setCompletedOrder(previewOrder);
        setQueuedOffline(true);
        cart.clearCart();
        if (deviceSettings.autoPrintReceipt) {
          handlePrint(previewOrder, paymentMethod === "cash" && deviceSettings.autoOpenDrawer);
        }
      } else {
        toast(err instanceof Error ? err.message : "Failed to complete order", "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (cart.lines.length === 0 && !completedOrder) return null;

  return (
    <>
      <Dialog open={open && checkoutStep === "customer" && !completedOrder} onOpenChange={(v) => { if (!v) handleClose(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Customer Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
              Enter the customer name and phone number. Loyalty can be activated or deactivated for this customer.
            </div>

            <button
              type="button"
              role="checkbox"
              aria-checked={skipCustomerAndLoyalty}
              onClick={() => {
                if (cart.promoCode) {
                  setCustomerError(locale === "ar" ? "البرومو كود يتطلب عميلًا مسجلًا." : "A promo code requires a registered customer.");
                  return;
                }
                const skip = !skipCustomerAndLoyalty;
                setSkipCustomerAndLoyalty(skip);
                setCustomerError("");
                if (skip) {
                  setSelectedCustomer(null);
                  setCustomerNameInput("");
                  setCustomerPhoneInput("");
                  setCustomerQuery("");
                  setCustomerSearchResults([]);
                  setLoyaltyRedeemPoints(0);
                }
              }}
              disabled={Boolean(cart.promoCode)}
              className={cn("flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors", skipCustomerAndLoyalty ? "border-primary bg-primary/5" : "border-border bg-card", cart.promoCode && "cursor-not-allowed opacity-50")}
            >
              <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs", skipCustomerAndLoyalty ? "border-primary bg-primary text-primary-foreground" : "border-input")}>{skipCustomerAndLoyalty ? "✓" : ""}</span>
              <span>
                <span className="block font-semibold">Skip customer and loyalty for this order</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Continue without customer details or loyalty points. This applies to this order only.</span>
              </span>
            </button>

            {!skipCustomerAndLoyalty && <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Search existing customer</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCustomerSearch(); }} placeholder="Name or phone" className="w-full rounded-lg border border-input bg-background py-2.5 pl-9 pr-3" />
                </div>
                <Button type="button" variant="outline" onClick={handleCustomerSearch} disabled={customerSearching}>
                  {customerSearching ? "..." : "Search"}
                </Button>
              </div>
              {customerSearchResults.length > 0 && (
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-1">
                  {customerSearchResults.map((customer) => (
                    <button key={customer.id} type="button" onClick={() => chooseCustomer(customer)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-accent">
                      <span className="font-medium">{customer.name}</span>
                      <span className="text-xs text-muted-foreground">{customer.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>}

            {!skipCustomerAndLoyalty && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Customer name</label>
                <div className="relative">
                  <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={customerNameInput} onChange={(e) => { setCustomerNameInput(e.target.value); if (selectedCustomer) setSelectedCustomer(null); }} placeholder="Customer name" className="w-full rounded-lg border border-input bg-background py-2.5 pl-9 pr-3" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Phone number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input type="tel" value={customerPhoneInput} onChange={(e) => { setCustomerPhoneInput(e.target.value); if (selectedCustomer) setSelectedCustomer(null); }} placeholder="Phone number" className="w-full rounded-lg border border-input bg-background py-2.5 pl-9 pr-3" />
                </div>
              </div>
            </div>}

            {!skipCustomerAndLoyalty && <button type="button" onClick={() => setLoyaltyEnabledInput((v) => !v)} className={cn("flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors", loyaltyEnabledInput ? "border-primary bg-primary/5" : "border-border bg-card")}>
              <div className="flex items-center gap-3">
                <Gift className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold">Loyalty Program</p>
                  <p className="text-xs text-muted-foreground">{loyaltyEnabledInput ? "Active for this customer" : "Not active for this customer"}</p>
                </div>
              </div>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", loyaltyEnabledInput ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                {loyaltyEnabledInput ? "ON" : "OFF"}
              </span>
            </button>}

            {!skipCustomerAndLoyalty && selectedCustomer && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                <div className="flex justify-between"><span>Orders</span><span className="font-semibold">{selectedCustomer.totalOrders}</span></div>
                <div className="flex justify-between"><span>Spent</span><span className="font-semibold">{formatMoney(selectedCustomer.totalSpent, settings.currencySymbol)}</span></div>
                <div className="flex justify-between"><span>Points</span><span className="font-semibold">{selectedCustomer.loyaltyPoints}</span></div>
              </div>
            )}

            {customerError && <p className="text-sm font-medium text-destructive">{customerError}</p>}
            <Button size="lg" className="w-full" disabled={customerSaving} onClick={continueToPayment}>
              {customerSaving ? "Saving..." : "Continue to Payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={(open && checkoutStep === "payment") || !!completedOrder} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" hideClose={!!completedOrder}>
        {completedOrder ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center animate-pop">
            <div
              className={cn(
                "flex h-20 w-20 items-center justify-center rounded-full",
                queuedOffline ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-success/15 text-success"
              )}
            >
              {queuedOffline ? <CloudOff className="h-11 w-11" /> : <CheckCircle2 className="h-11 w-11" />}
            </div>
            <div>
              <h2 className="text-xl font-bold">{queuedOffline ? t.pos.orderQueuedOffline : t.pos.orderComplete}</h2>
              <p className="text-sm text-muted-foreground">
                {queuedOffline ? t.pos.orderQueuedOfflineNote : `${t.pos.orderNumber} #${completedOrder.orderNumber}`}
              </p>
            </div>
            <p className="text-3xl font-extrabold text-primary">
              {formatMoney(completedOrder.total, settings.currencySymbol)}
            </p>
            {completedOrder.payment.changeDue !== undefined && completedOrder.payment.changeDue > 0 && (
              <div className="rounded-lg bg-muted px-4 py-2 text-sm">
                {t.pos.changeDue}:{" "}
                <span className="font-bold">
                  {formatMoney(completedOrder.payment.changeDue, settings.currencySymbol)}
                </span>
              </div>
            )}

            <div className="w-full border-t border-dashed border-border pt-4">
              <ReceiptView order={completedOrder} />
            </div>

            <div className="grid w-full grid-cols-2 gap-2 pt-2">
              <Button
                variant="outline"
                size="lg"
                disabled={printing}
                onClick={() =>
                  handlePrint(completedOrder, deviceSettings.autoOpenDrawer && completedOrder.payment.method === "cash")
                }
              >
                <Printer className="h-4 w-4" />
                {t.pos.printReceipt}
              </Button>
              <Button size="lg" onClick={handleNewOrder}>
                <Plus className="h-4 w-4" />
                {t.pos.newOrder}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t.pos.payment}</DialogTitle>
            </DialogHeader>

            <div className="rounded-xl bg-muted p-4 text-center">
              <p className="text-xs text-muted-foreground">{t.common.total}</p>
              <p className="text-3xl font-extrabold text-primary">{formatMoney(total, settings.currencySymbol)}</p>
            </div>

            {selectedCustomer && loyaltySettings?.enabled && selectedCustomer.loyaltyEnabled && maxRedeemablePoints > 0 && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">Loyalty Reward</p>
                    <p className="text-xs text-muted-foreground">
                      {loyaltyRedeemPoints > 0
                        ? `${loyaltyRedeemPoints} points = ${formatMoney(loyaltyDiscount, settings.currencySymbol)} discount`
                        : `${selectedCustomer.loyaltyPoints} points available`}
                    </p>
                  </div>
                  {loyaltyRedeemPoints > 0 ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setLoyaltyRedeemPoints(0)} disabled={submitting}>
                      Remove
                    </Button>
                  ) : (
                    <Button type="button" size="sm" onClick={() => setLoyaltyRedeemPoints(maxRedeemablePoints)} disabled={submitting}>
                      Use {maxRedeemablePoints} points
                    </Button>
                  )}
                </div>
              </div>
            )}

            {!method ? (
              <div className="grid grid-cols-3 gap-2.5">
                <PaymentMethodButton
                  icon={Banknote}
                  label={t.pos.cash}
                  disabled={submitting}
                  onClick={() => {
                    // Exact Amount pre-selected and tendered already equals
                    // the total — cashier can press Complete immediately.
                    setMethod("cash");
                    setTendered(total);
                  }}
                  // Long-press shortcut: skips the tender screen entirely
                  // and charges Cash for the exact total right away — same
                  // finalizeOrder() path a normal Cash-then-Complete tap
                  // uses, so printing/inventory/logging are all unchanged.
                  onLongPress={() => finalizeOrder("cash", total)}
                />
                <PaymentMethodButton
                  icon={CreditCard}
                  label={t.pos.card}
                  disabled={submitting}
                  onClick={() => finalizeOrder("card")}
                />
                <PaymentMethodButton
                  icon={Split}
                  label={t.pos.split}
                  onClick={() => setMethod("split")}
                />
                {externalMethods.map((externalMethod) => {
                  const ExternalIcon = getExternalPaymentIcon(externalMethod.icon);
                  return (
                    <PaymentMethodButton
                      key={externalMethod.id}
                      icon={ExternalIcon}
                      label={bilingual(externalMethod.name, locale)}
                      disabled={submitting}
                      iconClassName="text-[#FF5A00]"
                      onClick={() => finalizeOrder("talabat", undefined, undefined, undefined, externalMethod)}
                    />
                  );
                })}
                {/* Waste represents discarded product, not revenue — no
                    payment is collected, a reason is mandatory instead (see
                    the method === "waste" branch below). */}
                <PaymentMethodButton
                  icon={Trash2}
                  label={t.pos.waste}
                  disabled={submitting}
                  iconClassName="text-destructive"
                  onClick={() => setMethod("waste")}
                />
              </div>
            ) : method === "split" ? (
              <div className="space-y-4">
                <p className="text-sm font-medium text-muted-foreground">{t.pos.splitPayment}</p>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t.pos.cash}</label>
                  <input
                    type="number"
                    value={splitCash}
                    onChange={(e) => setSplitCash(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="flex justify-between rounded-lg bg-muted px-4 py-2.5 text-sm font-semibold">
                  <span>{t.pos.card}</span>
                  <span>
                    {formatMoney(Math.max(0, total - (parseFloat(splitCash) || 0)), settings.currencySymbol)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="lg" className="flex-1" onClick={() => setMethod(null)}>
                    {t.common.back}
                  </Button>
                  <Button
                    size="lg"
                    className="flex-1"
                    disabled={submitting || !splitCash || parseFloat(splitCash) <= 0 || parseFloat(splitCash) >= total}
                    onClick={() => {
                      const cashAmt = parseFloat(splitCash) || 0;
                      const cardAmt = Math.max(0, total - cashAmt);
                      finalizeOrder("split", undefined, [
                        { method: "cash", amount: cashAmt },
                        { method: "card", amount: cardAmt },
                      ]);
                    }}
                  >
                    {t.pos.completePayment}
                  </Button>
                </div>
              </div>
            ) : method === "waste" ? (
              <div className="space-y-4">
                <p className="text-sm font-medium text-muted-foreground">{t.pos.wasteReason}</p>
                <textarea
                  autoFocus
                  rows={3}
                  value={wasteReason}
                  onChange={(e) => setWasteReason(e.target.value)}
                  placeholder={t.pos.wasteReasonPlaceholder}
                  className="w-full resize-none rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="flex gap-2">
                  <Button variant="outline" size="lg" className="flex-1" onClick={() => setMethod(null)}>
                    {t.common.back}
                  </Button>
                  <Button
                    size="lg"
                    className="flex-1"
                    disabled={submitting || wasteReason.trim().length === 0}
                    onClick={() => finalizeOrder("waste", undefined, undefined, wasteReason.trim())}
                  >
                    {t.pos.completePayment}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm font-medium text-muted-foreground">{t.pos.amountTendered}</p>
                <div className="grid grid-cols-4 gap-2">
                  {quickAmounts.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setTendered(amt)}
                      className={cn(
                        "rounded-lg border py-3 text-sm font-semibold transition-colors",
                        tendered === amt
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card hover:bg-accent"
                      )}
                    >
                      {amt === total ? t.pos.exactAmount : formatMoney(amt, "").trim()}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t.pos.customerPaid}</label>
                  {/* Same `tendered` state as the quick buttons above — typing
                      here and tapping a quick button both just set it, so
                      whichever was used last wins and change-due always
                      reflects the current value, exactly like the buttons. */}
                  <input
                    type="number"
                    autoFocus
                    value={tendered ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        setTendered(null);
                        return;
                      }
                      const val = parseFloat(raw);
                      setTendered(Number.isNaN(val) ? null : val);
                    }}
                    placeholder="0"
                    className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                {tendered !== null && changeDue > 0 && (
                  <div className="flex justify-between rounded-lg bg-success/10 px-4 py-2.5 text-sm font-semibold text-success">
                    <span>{t.pos.changeDue}</span>
                    <span>{formatMoney(changeDue, settings.currencySymbol)}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="lg" className="flex-1" onClick={() => setMethod(null)}>
                    {t.common.back}
                  </Button>
                  <Button
                    size="lg"
                    className="flex-1"
                    disabled={submitting || tendered === null}
                    onClick={() => tendered !== null && finalizeOrder("cash", tendered)}
                  >
                    {t.pos.completePayment}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

function PaymentMethodButton({
  icon: Icon,
  label,
  onClick,
  onLongPress,
  disabled,
  iconClassName,
}: {
  icon: typeof Banknote;
  label: string;
  onClick: () => void;
  /** Optional — only the Cash button uses this today. Fires once after
   * holding for LONG_PRESS_MS; the click that follows pointer-up is
   * swallowed so a long press never ALSO triggers the normal onClick. */
  onLongPress?: () => void;
  disabled?: boolean;
  iconClassName?: string;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  const startPress = () => {
    if (!onLongPress || disabled) return;
    longPressFiredRef.current = false;
    timerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  };

  const cancelPress = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleClick = () => {
    // A long press still dispatches a trailing click on pointer-up in every
    // browser — swallow exactly that one so it can't also fire the normal
    // (short-tap) behavior right after the shortcut already ran.
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      disabled={disabled}
      className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
    >
      <Icon className={cn("h-6 w-6", iconClassName ?? "text-primary")} />
      <span className="text-xs font-semibold">{label}</span>
    </button>
  );
}
