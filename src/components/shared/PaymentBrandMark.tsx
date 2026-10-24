import { cn } from "@/lib/utils";

type PaymentBrand = "cash" | "visa" | "instapay";

export function PaymentBrandMark({
  brand,
  className,
}: {
  brand: PaymentBrand;
  className?: string;
}) {
  if (brand === "visa") {
    return (
      <span className={cn("inline-flex h-6 min-w-10 items-center justify-center rounded px-1 text-current", className)} aria-label="Visa">
        <svg viewBox="0 0 48 20" className="h-full w-full" role="img" aria-hidden="true">
          <text x="2" y="16" fill="currentColor" fontFamily="Arial, Helvetica, sans-serif" fontSize="18" fontStyle="italic" fontWeight="900" letterSpacing="-1.4">VISA</text>
        </svg>
      </span>
    );
  }

  if (brand === "instapay") {
    return (
      <span className={cn("inline-flex h-6 w-11 shrink-0 items-center justify-center rounded-md text-current", className)} aria-label="InstaPay">
        <svg viewBox="0 0 68 22" className="h-auto max-h-full w-full" role="img" aria-hidden="true">
          <text x="1" y="16" fill="currentColor" fontFamily="Arial, Helvetica, sans-serif" fontSize="9.5" fontWeight="800" letterSpacing="-.25">INSTA</text>
          <path d="m27 4 5 7-5 7m7-14 5 7-5 7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          <text x="42" y="16" fill="currentColor" fontFamily="Arial, Helvetica, sans-serif" fontSize="9.5" fontWeight="800" letterSpacing="-.25">PAY</text>
        </svg>
      </span>
    );
  }

  return (
    <span className={cn("inline-flex h-7 w-8 shrink-0 items-center justify-center rounded-lg text-current", className)} aria-label="Cash">
      <svg viewBox="0 0 32 24" className="h-5 w-7" role="img" aria-hidden="true">
        <rect x="1.5" y="2" width="29" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3 7c2.2 0 3.5-1.2 3.8-3M29 17c-2.2 0-3.5 1.2-3.8 3" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="16" cy="12" r="5" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="1.2" />
        <text x="16" y="15" textAnchor="middle" fill="currentColor" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="700">ج</text>
      </svg>
    </span>
  );
}
