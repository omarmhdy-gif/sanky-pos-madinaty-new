"use client";

import type { Product } from "@/lib/types";
import { useI18n, bilingual } from "@/lib/i18n";
import { useDataStore } from "@/lib/store/useDataStore";
import { formatMoney, formatNumber, cn, isImageUrl } from "@/lib/utils";
import { productAvailableQty } from "@/lib/inventory";
import { PackageX, Plus } from "lucide-react";
import { MenuProductArtwork } from "@/components/pos/MenuProductArtwork";
import { productMenuPhoto } from "@/lib/productImages";

export function ProductGrid({
  products,
  onSelect,
}: {
  products: Product[];
  onSelect: (p: Product) => void;
}) {
  const { t, locale } = useI18n();
  const currencySymbol = useDataStore((s) => s.settings.currencySymbol);
  const inventoryItems = useDataStore((s) => s.inventoryItems);
  const categories = useDataStore((s) => s.categories);

  if (products.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-muted-foreground">
        <PackageX className="h-10 w-10 opacity-40" />
        <p className="text-sm">{t.common.noResults}</p>
      </div>
    );
  }

  return (
    // lg is the primary target here (iPad landscape, ~1024-1280px) — it
    // deliberately gets FEWER columns than a naive "more space = more
    // columns" scaling would give it (4, not 5+), because the point of
    // freeing up width from the sidebar/cart is bigger, more comfortable
    // cards on the device cashiers actually use, not just more of them.
    <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 sm:gap-4 sm:p-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-4 lg:p-5 xl:grid-cols-5">
      {products.map((p) => {
        const availableQty = productAvailableQty(p, inventoryItems);
        // Informational only — selling out-of-stock ingredients is allowed
        // and expected (inventory is permitted to go negative), so the
        // product card is never disabled, just labeled.
        const outOfStock = availableQty !== null && availableQty <= 0;
        const categoryName = categories.find((category) => category.id === p.categoryId)?.name.en ?? "";
        const menuPhoto = productMenuPhoto(p, categoryName);
        const hasCustomImage = isImageUrl(p.image) || Boolean(p.image?.startsWith("/"));
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className="group relative flex aspect-[4/5] min-h-[178px] flex-col overflow-hidden rounded-[1.35rem] border border-border/75 bg-[#17271f] text-start shadow-[0_3px_10px_hsl(var(--foreground)/0.045),0_14px_28px_hsl(var(--foreground)/0.05)] transition-all duration-200 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_8px_18px_hsl(var(--primary)/0.12),0_20px_34px_hsl(var(--foreground)/0.12)] active:scale-[0.98]"
          >
            {hasCustomImage ? (
              <img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
            ) : menuPhoto ? (
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-no-repeat transition-transform duration-500 group-hover:scale-[1.04]"
                style={{
                  backgroundImage: `url(${menuPhoto.src})`,
                  backgroundSize: `${menuPhoto.columns * 100}% ${menuPhoto.rows * 100}%`,
                  backgroundPosition: `${(menuPhoto.column / (menuPhoto.columns - 1)) * 100}% ${(menuPhoto.row / (menuPhoto.rows - 1)) * 100}%`,
                }}
              />
            ) : (
              <div className="absolute inset-0 h-full w-full bg-[radial-gradient(ellipse_at_50%_28%,#526c54_0%,#263c30_52%,#17271f_100%)] transition-transform duration-500 group-hover:scale-[1.04]">
                <MenuProductArtwork product={p} />
              </div>
            )}
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#101b16]/95 via-[#101b16]/35 to-[#101b16]/5" />
            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5 sm:p-3">
              {availableQty !== null ? (
                <span className={cn("rounded-full border border-white/15 px-2 py-1 text-[9px] font-semibold backdrop-blur-md sm:text-[10px]", outOfStock ? "bg-red-950/65 text-red-100" : "bg-black/25 text-white")}>
                  {outOfStock ? (locale === "ar" ? "نفد" : "Sold out") : `${formatNumber(availableQty, 0, 2)} ${locale === "ar" ? "متاح" : "left"}`}
                </span>
              ) : <span />}
              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/15 text-white shadow-sm backdrop-blur-md transition-colors group-hover:bg-[#d7bd83] group-hover:text-[#182820]">
                <Plus className="h-4 w-4" />
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-3 text-white sm:p-3.5">
              <p className="line-clamp-2 text-[13px] font-semibold leading-[1.25] tracking-[-0.01em] text-white sm:text-sm lg:text-[15px]">
                {bilingual(p.name, locale)}
              </p>
              <div className="mt-2 flex items-end justify-between gap-1 border-t border-white/20 pt-2">
                <span className="text-sm font-bold tracking-tight text-[#f0dba9] lg:text-base">
                {formatMoney(p.price, currencySymbol)}
                </span>
                <span className="text-[9px] font-medium text-white/65 sm:text-[10px]">{locale === "ar" ? "إضافة للطلب" : "Add to order"}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
