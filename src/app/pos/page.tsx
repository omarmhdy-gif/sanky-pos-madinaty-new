"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { CategoryTabs } from "@/components/pos/CategoryTabs";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { CartPanel } from "@/components/pos/CartPanel";
import { ModifierDialog } from "@/components/pos/ModifierDialog";
import { PaymentDialog } from "@/components/pos/PaymentDialog";
import { HeldOrdersDialog } from "@/components/pos/HeldOrdersDialog";
import { useDataStore } from "@/lib/store/useDataStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useCartStore } from "@/lib/store/useCartStore";
import { useI18n } from "@/lib/i18n";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { toast } from "@/components/ui/toast";
import type { Product } from "@/lib/types";
import { Printer, ShoppingBag, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StartupValidation } from "@/components/pos/StartupValidation";
import { InventoryQualityCheckDialog } from "@/components/pos/InventoryQualityCheckDialog";
import { ClipboardCheck } from "lucide-react";
import { Wallet } from "lucide-react";
import { StartShiftDialog } from "@/components/shifts/StartShiftDialog";
import { ShiftDialog } from "@/components/shifts/ShiftDialog";
import { StaffAttendanceButton } from "@/components/attendance/StaffAttendanceButton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DesktopPrinterDialog } from "@/components/pos/DesktopPrinterDialog";
import { useTableStore } from "@/lib/store/useTableStore";
import { getDiningPosition, getDiningSectionLabel, getDiningTableLabel } from "@/lib/tables";

export default function PosPage() {
  const { t, locale } = useI18n();
  const products = useDataStore((s) => s.products);
  const categories = useDataStore((s) => s.categories);
  const shifts = useDataStore((s) => s.shifts);
  const attendance = useDataStore((s) => s.attendance);
  const currentUser = useAuthStore((s) => s.currentUser);
  const addLine = useCartStore((s) => s.addLine);
  const cartLines = useCartStore((s) => s.lines);
  const cartTableId = useCartStore((s) => s.tableId);
  const cartDiscountPercent = useCartStore((s) => s.discountPercent);
  const cartDiscountFixedAmount = useCartStore((s) => s.discountFixedAmount);
  const cartPromoCode = useCartStore((s) => s.promoCode);
  const cartCustomerName = useCartStore((s) => s.customerName);
  const cartCustomerId = useCartStore((s) => s.customerId);
  const setCartState = useCartStore.setState;
  const diningTables = useTableStore((s) => s.tables);
  const diningSections = useTableStore((s) => s.sections);
  const occupiedTableIds = useTableStore((s) => s.occupiedTableIds);
  const tableOrders = useTableStore((s) => s.tableOrders);
  const occupyTable = useTableStore((s) => s.occupyTable);
  const saveTableOrder = useTableStore((s) => s.saveTableOrder);

  // Browsing/scanning/building a cart never requires a shift — only
  // charging does (gated in handleCharge below). Closing a shift no longer
  // forces an immediate reopen; the user opens one from POS when needed.
  // Deliberately role-agnostic (not "only cashiers need a shift"): POS is
  // now reachable by anyone granted the "pos" permission, including an
  // owner — every order still needs a real shift_id (see create_order),
  // so charging without one would silently produce an order no shift
  // report can ever reconcile (see the shift-accuracy audit findings).
  const needsShift = !shifts.some((s) => s.cashierId === currentUser?.id && s.status === "open");
  const openShift = shifts.find((s) => s.cashierId === currentUser?.id && s.status === "open") ?? null;
  const hasOpenAttendance = attendance.some(
    (record) => record.shiftKey === "staff" && record.employeeId === currentUser?.id && !record.checkOutAt
  );

  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [modifierProduct, setModifierProduct] = useState<Product | null>(null);
  const [modifierOpen, setModifierOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [inventoryCheckOpen, setInventoryCheckOpen] = useState(false);
  const [startShiftOpen, setStartShiftOpen] = useState(false);
  const [startShiftRequired, setStartShiftRequired] = useState(false);
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [attendancePromptOpen, setAttendancePromptOpen] = useState(false);
  const [desktopMode, setDesktopMode] = useState(false);
  const [printerSetupOpen, setPrinterSetupOpen] = useState(false);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [activeDiningSectionId, setActiveDiningSectionId] = useState("");

  useEffect(() => {
    setDesktopMode(Boolean(window.sankyDesktop?.isDesktop));
  }, []);

  useEffect(() => {
    if (!cartTableId) return;
    saveTableOrder(cartTableId, {
      lines: cartLines,
      discountPercent: cartDiscountPercent,
      discountFixedAmount: cartDiscountFixedAmount,
      promoCode: cartPromoCode,
      customerName: cartCustomerName,
      customerId: cartCustomerId,
    });
  }, [cartTableId, cartLines, cartDiscountPercent, cartDiscountFixedAmount, cartPromoCode, cartCustomerName, cartCustomerId, saveTableOrder]);

  useEffect(() => {
    if (!activeDiningSectionId && diningSections[0]) setActiveDiningSectionId(diningSections[0].id);
    else if (activeDiningSectionId && !diningSections.some((section) => section.id === activeDiningSectionId)) {
      setActiveDiningSectionId(diningSections[0]?.id ?? "");
    }
  }, [diningSections, activeDiningSectionId]);

  const activeDiningTables = useMemo(() => diningTables
    .filter((table) => table.sectionId === activeDiningSectionId)
    .sort((a, b) => a.position - b.position)
    .map((table, index) => ({ table, ...getDiningPosition(table, index) })), [activeDiningSectionId, diningTables]);
  const diningTableRows = Math.max(4, ...activeDiningTables.map((item) => item.y + 1));
  const diningTablesByCell = new Map(activeDiningTables.map((item) => [`${item.x}:${item.y}`, item.table]));

  const filteredProducts = useMemo(() => {
    let list = products.filter((p) => p.isActive);

    if (activeCategory !== "all") {
      list = list.filter((p) => p.categoryId === activeCategory);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) => p.name.en.toLowerCase().includes(q) || p.name.ar.includes(q) || p.sku?.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => a.sortOrder - b.sortOrder);
  }, [products, activeCategory, search]);

  const visibleCategories = useMemo(() => {
    const activeCategoryIds = new Set(products.filter((product) => product.isActive).map((product) => product.categoryId));
    return categories
      .filter((category) => activeCategoryIds.has(category.id))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, products]);

  const handleSelectProduct = (product: Product) => {
    if (product.modifierGroupIds && product.modifierGroupIds.length > 0) {
      setModifierProduct(product);
      setModifierOpen(true);
    } else {
      addLine({
        productId: product.id,
        name: product.name,
        unitPrice: product.price,
        qty: 1,
        modifiers: [],
      });
    }
  };

  const handleScan = useCallback(
    (code: string) => {
      const product = products.find((p) => p.barcode === code);
      if (!product) {
        toast(t.pos.productNotFound, "error");
        return;
      }
      handleSelectProduct(product);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products]
  );
  useBarcodeScanner(handleScan, true);

  const handleCharge = () => {
    if (needsShift) {
      setStartShiftRequired(true);
      setStartShiftOpen(true);
      return;
    }
    if (!hasOpenAttendance) {
      setAttendancePromptOpen(true);
      return;
    }
    setPaymentOpen(true);
  };

  const itemCount = cartLines.reduce((s, l) => s + l.qty, 0);

  return (
    <AppShell title={t.pos.title}>
      <StartupValidation />
      {desktopMode && <DesktopPrinterDialog open={printerSetupOpen} onOpenChange={setPrinterSetupOpen} />}
      <div className="flex h-full min-h-0">
        {/* Product browsing area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="flex items-center gap-2">
              {desktopMode && <Button variant="outline" size="sm" className="gap-2" onClick={() => setPrinterSetupOpen(true)}><Printer className="h-4 w-4" /> Printer</Button>}
              <StaffAttendanceButton />
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setTablePickerOpen(true)}>
                <Utensils className="h-4 w-4" />{locale === "ar" ? "الطاولات" : "Tables"}
              </Button>
              {openShift ? (
                <>
                  <span className="flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-medium text-success">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
                    {t.shifts.shiftOpen}
                  </span>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => setShiftDialogOpen(true)}>
                    <Wallet className="h-4 w-4" />
                    {t.shifts.closeShift}
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => { setStartShiftRequired(false); setStartShiftOpen(true); }}>
                  <Wallet className="h-4 w-4" />
                  {t.shifts.startShift}
                </Button>
              )}
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setInventoryCheckOpen(true)}>
              <ClipboardCheck className="h-4 w-4" />
              {locale === "ar" ? "فحص مواد المخزون" : "Check inventory"}
            </Button>
          </div>
          <CategoryTabs
            categories={visibleCategories}
            activeId={activeCategory}
            onSelect={setActiveCategory}
            search={search}
            onSearchChange={setSearch}
            onOpenHeld={() => setHeldOpen(true)}
          />
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin pb-24 md:pb-0">
            <ProductGrid
              products={filteredProducts}
              onSelect={handleSelectProduct}
            />
          </div>
        </div>

        {/* Cart panel - desktop/tablet */}
        <div className="hidden md:block md:w-[240px] lg:w-[300px] shrink-0 overflow-hidden border-s border-border">
          <CartPanel onCharge={handleCharge} />
        </div>
      </div>

      {/* Mobile floating cart trigger */}
      {itemCount > 0 && (
        <button
          onClick={() => setMobileCartOpen(true)}
          className="md:hidden fixed bottom-20 end-4 z-30 flex items-center gap-2 rounded-full bg-primary px-5 py-3.5 text-primary-foreground shadow-xl animate-slide-up"
        >
          <ShoppingBag className="h-5 w-5" />
          <span className="text-sm font-bold">{itemCount}</span>
        </button>
      )}

      {/* Mobile cart drawer */}
      {mobileCartOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col bg-background animate-slide-up">
          <div className="flex items-center justify-between border-b border-border p-4">
            <h2 className="font-semibold">{t.pos.cart}</h2>
            <Button variant="ghost" size="sm" onClick={() => setMobileCartOpen(false)}>
              {t.common.close}
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <CartPanel
              onCharge={() => {
                setMobileCartOpen(false);
                handleCharge();
              }}
            />
          </div>
        </div>
      )}

      <ModifierDialog product={modifierProduct} open={modifierOpen} onOpenChange={setModifierOpen} />
      <PaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} onOrderComplete={() => setSearch("")} />
      <HeldOrdersDialog open={heldOpen} onOpenChange={setHeldOpen} />
      <InventoryQualityCheckDialog open={inventoryCheckOpen} onOpenChange={setInventoryCheckOpen} />
      <Dialog open={tablePickerOpen} onOpenChange={setTablePickerOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{locale === "ar" ? "اختيار طاولة وبدء طلب محلي" : "Choose a table and start a dine-in order"}</DialogTitle>
            <DialogDescription>{locale === "ar" ? "الطاولات تُضاف وتُدار من الإعدادات." : "Tables are added and managed in Settings."}</DialogDescription>
          </DialogHeader>
          {cartTableId && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary/5 p-3"><span className="text-sm">{locale === "ar" ? `الطلب الحالي محفوظ على ${useTableStore.getState().tables.find((table) => table.id === cartTableId)?.name ?? "الطاولة"}` : `Current order is on ${getDiningTableLabel(useTableStore.getState().tables.find((table) => table.id === cartTableId)?.name ?? "Table", locale)}`}</span><Button type="button" size="sm" variant="outline" onClick={() => {
            const cart = useCartStore.getState();
            if (cart.tableId) saveTableOrder(cart.tableId, { lines: cart.lines, discountPercent: cart.discountPercent, discountFixedAmount: cart.discountFixedAmount, promoCode: cart.promoCode, customerName: cart.customerName, customerId: cart.customerId });
            cart.clearCart();
            setTablePickerOpen(false);
            toast(locale === "ar" ? "تم حفظ الطلب على الطاولة ويمكنك فتحه لاحقًا" : "Order saved on the table; you can reopen it later", "success");
          }}>{locale === "ar" ? "حفظ وترك الطاولة" : "Save and leave table"}</Button></div>}
          {diningSections.length ? <div className="flex flex-wrap gap-2 border-b pb-3">{diningSections.map((section) => <Button key={section.id} type="button" variant={activeDiningSectionId === section.id ? "default" : "outline"} size="sm" onClick={() => setActiveDiningSectionId(section.id)}>{getDiningSectionLabel(section.name, locale)}<span className="ms-1 opacity-75">{diningTables.filter((table) => table.sectionId === section.id).length}</span></Button>)}</div> : null}
          {diningSections.length ? <div className="max-h-[55vh] overflow-y-auto rounded-2xl border border-dashed bg-muted/30 p-3"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{getDiningSectionLabel(diningSections.find((section) => section.id === activeDiningSectionId)?.name ?? "", locale)}</h3><span className="text-xs text-muted-foreground">{locale === "ar" ? "مخطط الطاولات والمساحات الفارغة" : "Tables and open spaces"}</span></div><div className="grid min-w-[420px] grid-cols-4 gap-2 sm:gap-3">{Array.from({ length: diningTableRows * 4 }, (_, cellIndex) => {
            const table = diningTablesByCell.get(`${cellIndex % 4}:${Math.floor(cellIndex / 4)}`);
            if (!table) return <div key={`empty-${cellIndex}`} aria-hidden="true" className="aspect-square min-h-20 rounded-xl border border-dashed border-border/40 bg-background/20" />;
            const occupied = occupiedTableIds.includes(table.id);
            const draft = tableOrders[table.id];
            const count = draft?.lines.reduce((sum, line) => sum + line.qty, 0) ?? 0;
            const displayName = getDiningTableLabel(table.name, locale);
            return <div key={table.id} className={`flex aspect-square min-h-20 flex-col justify-between rounded-2xl border p-2 transition ${occupied ? "border-amber-500/30 bg-amber-500/5" : "border-emerald-500/25 bg-card"}`}>
              <div className="flex items-center justify-between gap-1"><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${occupied ? "bg-amber-500/10 text-amber-700" : "bg-emerald-500/10 text-emerald-700"}`}>{occupied ? (locale === "ar" ? "مشغولة" : "Occupied") : (locale === "ar" ? "فاضية" : "Available")}</span><span className="text-[10px] text-muted-foreground">{table.seats} {locale === "ar" ? "مقاعد" : "seats"}</span></div>
              <Button type="button" variant={occupied ? "secondary" : "outline"} className="h-16 w-full flex-col gap-1 px-1 text-xs sm:h-20 sm:text-sm" onClick={() => {
                const currentCart = useCartStore.getState();
                if (currentCart.lines.length && currentCart.tableId !== table.id) { toast(locale === "ar" ? "احفظ الطلب الحالي على طاولته قبل فتح طاولة أخرى" : "Save the current table order before opening another table", "error"); return; }
                const saved = tableOrders[table.id];
                setCartState({ lines: saved?.lines ?? [], orderType: "dine_in", tableId: table.id, tableNumber: displayName, discountPercent: saved?.discountPercent ?? 0, discountFixedAmount: saved?.discountFixedAmount ?? 0, promoCode: saved?.promoCode, customerName: saved?.customerName, customerId: saved?.customerId });
                occupyTable(table.id);
                setTablePickerOpen(false);
                toast(occupied && count ? (locale === "ar" ? `تم استكمال طلب ${table.name} (${count} صنف)` : `Reopened ${displayName} order (${count} items)`) : (locale === "ar" ? `بدأ طلب على ${table.name}` : `Order started at ${displayName}`), "success");
              }}><Utensils className="h-4 w-4" /><span className="font-semibold">{displayName}</span>{occupied && count > 0 && <span className="text-[10px]">{count} {locale === "ar" ? "صنف" : "items"}</span>}</Button>
            </div>;
          })}</div></div> : <div className="rounded-xl border border-dashed p-7 text-center text-sm text-muted-foreground">{locale === "ar" ? "أضف قسمًا وطاولات من صفحة الإعدادات." : "Add sections and tables first from Settings."}</div>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setTablePickerOpen(false)}>{t.common.close}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <StartShiftDialog
        open={startShiftOpen}
        required={startShiftRequired}
        onOpenChange={(open) => {
          setStartShiftOpen(open);
          if (!open) setStartShiftRequired(false);
        }}
      />
      <ShiftDialog shift={openShift} open={shiftDialogOpen} onOpenChange={setShiftDialogOpen} />
      <Dialog open={attendancePromptOpen} onOpenChange={(nextOpen) => { if (nextOpen) setAttendancePromptOpen(true); }}>
        <DialogContent hideClose className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t.attendance.requiredForSaleTitle}</DialogTitle>
            <DialogDescription>{t.attendance.requiredForSaleDesc}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <StaffAttendanceButton
              onCheckedIn={() => {
                setAttendancePromptOpen(false);
                setPaymentOpen(true);
              }}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
