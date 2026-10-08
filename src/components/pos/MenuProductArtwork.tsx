import type { Product } from "@/lib/types";
import { bilingual } from "@/lib/i18n";

function paletteFor(name: string) {
  const n = name.toLowerCase();
  if (/matcha|pistachio|kiwi/.test(n)) return { drink: "#91a86a", foam: "#dce7c3", accent: "#607d42" };
  if (/blue|berry|passion|curacao/.test(n)) return { drink: "#639ac2", foam: "#d7ebf7", accent: "#39749c" };
  if (/strawberry|cherry|pink|red|mojito/.test(n)) return { drink: "#d97778", foam: "#f7d9cf", accent: "#b94c55" };
  if (/caramel|dulce|latte|cappuccino|coffee|espresso|mocha|tiramisu/.test(n)) return { drink: "#aa704b", foam: "#f0d4aa", accent: "#765039" };
  if (/chocolate|cocoa|brownie|cookie/.test(n)) return { drink: "#76503e", foam: "#d8b79b", accent: "#4f362d" };
  if (/lemon|citrus|orange|mango/.test(n)) return { drink: "#e9b64f", foam: "#f8e7b5", accent: "#bf8433" };
  return { drink: "#bd8a63", foam: "#f2dfc6", accent: "#876348" };
}

function isSweet(name: string) {
  return /cake|cheesecake|tiramisu|cookie|croissant|bakery|bread|bundle|snack|pops/i.test(name);
}

export function MenuProductArtwork({ product }: { product: Product }) {
  const name = bilingual(product.name, "en");
  const colors = paletteFor(name);
  const lower = name.toLowerCase();

  if (/pops/i.test(name)) {
    return (
      <svg viewBox="0 0 200 130" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${name} product illustration`} className="h-full w-full">
        <ellipse cx="100" cy="112" rx="38" ry="7" fill="#74563d" opacity=".10" />
        <path d="M92 82h16v31a8 8 0 0 1-16 0z" fill="#d4a679" />
        <rect x="66" y="15" width="68" height="82" rx="30" fill={colors.drink} />
        <path d="M73 58c15-19 28 19 54-3v20c-20 17-35-14-54 5z" fill={colors.foam} opacity=".9" />
        <path d="M84 27c8-8 21-8 29-2" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" opacity=".65" />
        <circle cx="108" cy="53" r="5" fill={colors.accent} opacity=".8" />
      </svg>
    );
  }

  if (isSweet(name)) {
    const isRound = /cookie|tiramisu|bundle|snack/i.test(name);
    return (
      <svg viewBox="0 0 200 130" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${name} product illustration`} className="h-full w-full">
        <ellipse cx="100" cy="108" rx="57" ry="8" fill="#74563d" opacity=".10" />
        {isRound ? (
          <>
            <ellipse cx="100" cy="83" rx="47" ry="23" fill={colors.accent} opacity=".22" />
            <ellipse cx="100" cy="76" rx="43" ry="22" fill={colors.foam} />
            <ellipse cx="100" cy="69" rx="36" ry="17" fill={colors.drink} />
            <circle cx="82" cy="65" r="3" fill="#fff4dc" /><circle cx="111" cy="73" r="3" fill="#fff4dc" />
            {lower.includes("bundle") && <rect x="138" y="42" width="20" height="45" rx="7" fill="#d4a679" />}
          </>
        ) : (
          <>
            <path d="M49 93 111 33l45 60z" fill={colors.foam} stroke="#d8c5ac" strokeWidth="2" />
            <path d="m57 84 54-51 10 16-48 47z" fill={colors.drink} />
            <path d="m73 96 41-43 25 40z" fill={colors.accent} opacity=".8" />
            <path d="m49 93 107 0-5 12H54z" fill="#f8eddb" />
            <circle cx="109" cy="42" r="5" fill="#bd5c59" />
          </>
        )}
      </svg>
    );
  }

  const isIced = /iced|cold|frappe|shake|boba|mojito|lemonade|tea|redbull|water/i.test(name);
  return (
    <svg viewBox="0 0 200 130" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${name} product illustration`} className="h-full w-full">
      <ellipse cx="100" cy="112" rx="38" ry="7" fill="#74563d" opacity=".10" />
      {isIced ? (
        <>
          <path d="M70 33h60l-8 68a9 9 0 0 1-9 8H87a9 9 0 0 1-9-8z" fill="#fff" opacity=".75" stroke="#d8c8b4" strokeWidth="2" />
          <path d="M76 56h48l-5 43H83z" fill={colors.drink} opacity=".9" />
          <path d="m94 27 23-17" stroke="#8a5d43" strokeWidth="5" strokeLinecap="round" />
          <path d="M81 34h38" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".8" />
          <circle cx="93" cy="70" r="6" fill={colors.foam} opacity=".85" /><circle cx="108" cy="84" r="5" fill={colors.accent} opacity=".65" />
          <path d="M84 47c9-5 22-5 32 0" stroke="#fff" strokeWidth="3" opacity=".55" />
        </>
      ) : (
        <>
          <path d="M65 53h70l-6 51a9 9 0 0 1-9 8H80a9 9 0 0 1-9-8z" fill="#fff" stroke="#d8c8b4" strokeWidth="2" />
          <path d="M70 68h60l-4 35a8 8 0 0 1-8 7H82a8 8 0 0 1-8-7z" fill={colors.drink} />
          <path d="M62 51h76v9H62z" fill={colors.accent} />
          <path d="M79 48c4-15 36-17 43 0" fill={colors.foam} />
          <circle cx="101" cy="42" r="5" fill={colors.accent} opacity=".8" />
          <path d="M89 13v31" stroke="#8a5d43" strokeWidth="4" strokeLinecap="round" />
          <path d="M83 77h3v20h-3zm30-3h3v22h-3z" fill="#fff" opacity=".45" />
        </>
      )}
    </svg>
  );
}
