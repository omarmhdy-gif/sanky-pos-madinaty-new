"use client";

import { useCallback, useMemo, useState } from "react";
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
import { useFavoritesStore } from "@/lib/store/useHeldOrdersStore";
import { useI18n } from "@/lib/i18n";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useShiftUIStore } from "@/lib/store/useShiftUIStore";
import { toast } from "@/components/ui/toast";
import type { Product } from "@/lib/types";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StartupValidation } from "@/components/pos/StartupValidation";

export default function PosPage() {
  const { t } = useI18n();
  const products = useDataStore((s) => s.products);
  const categories = useDataStore((s) => s.categories);
  const shifts = useDataStore((s) => s.shifts);
  const currentUser = useAuthStore((s) => s.currentUser);
  const addLine = useCartStore((s) => s.addLine);
  const cartLines = useCartStore((s) => s.lines);
  const { favoriteIds, recentIds, toggleFavorite, trackRecent } = useFavoritesStore();
  const openStartShift = useShiftUIStore((s) => s.openStartShift);

  // Browsing/scanning/building a cart never requires a shift — only
  // charging does (gated in handleCharge below). Closing a shift no longer
  // forces an immediate reopen; the user opens one again whenever they
  // choose, via the Topbar's "Open Shift" button or by trying to charge.
  // Deliberately role-agnostic (not "only cashiers need a shift"): POS is
  // now reachable by anyone granted the "pos" permission, including an
  // owner — every order still needs a real shift_id (see create_order),
  // so charging without one would silently produce an order no shift
  // report can ever reconcile (see the shift-accuracy audit findings).
  const needsShift = !shifts.some((s) => s.cashierId === currentUser?.id && s.status === "open");

  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [modifierProduct, setModifierProduct] = useState<Product | null>(null);
  const [modifierOpen, setModifierOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  const filteredProducts = useMemo(() => {
    let list = products.filter((p) => p.isActive);

    if (activeCategory === "favorites") {
      list = list.filter((p) => favoriteIds.includes(p.id));
    } else if (activeCategory === "recent") {
      list = recentIds.map((id) => list.find((p) => p.id === id)).filter(Boolean) as Product[];
    } else if (activeCategory !== "all") {
      list = list.filter((p) => p.categoryId === activeCategory);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) => p.name.en.toLowerCase().includes(q) || p.name.ar.includes(q) || p.sku?.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => a.sortOrder - b.sortOrder);
  }, [products, activeCategory, search, favoriteIds, recentIds]);

  const handleSelectProduct = (product: Product) => {
    trackRecent(product.id);
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
      openStartShift();
      return;
    }
    setPaymentOpen(true);
  };

  const itemCount = cartLines.reduce((s, l) => s + l.qty, 0);

  return (
    <AppShell title={t.pos.title}>
      <StartupValidation />
      <div className="flex h-full min-h-0">
        {/* Product browsing area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <CategoryTabs
            categories={categories.sort((a, b) => a.sortOrder - b.sortOrder)}
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
              favoriteIds={favoriteIds}
              onToggleFavorite={toggleFavorite}
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
    </AppShell>
  );
}
