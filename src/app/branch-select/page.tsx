"use client";

import { useRouter } from "next/navigation";
import { Moon, Sun, Languages, ChevronRight } from "lucide-react";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { ShopLogo } from "@/components/layout/ShopLogo";

export default function BranchSelectPage() {
  const router = useRouter();
  const branches = useBranchStore((s) => s.branches);
  const setBranch = useBranchStore((s) => s.setBranch);
  const { t, locale, setLocale } = useI18n();
  const { theme, toggleTheme } = useTheme();

  const handleSelect = (id: string) => {
    setBranch(id);
    router.replace("/login");
  };

  return (
    <div className="flex h-app w-full flex-col bg-gradient-to-br from-espresso-50 to-amber-50 dark:from-background dark:to-background">
      <header className="flex items-center justify-between p-5">
        <div className="flex items-center gap-2.5">
          <ShopLogo className="h-10 w-10 rounded-xl" />
          <div>
            <p className="font-semibold leading-tight">{t.app.name}</p>
            <p className="text-xs text-muted-foreground leading-tight">{t.app.tagline}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setLocale(locale === "en" ? "ar" : "en")}
            title="Toggle language"
          >
            <Languages className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={toggleTheme} title="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-10">
        <div className="mb-8 text-center animate-fade-in">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.branchSelect.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.branchSelect.subtitle}</p>
        </div>

        <div className="grid w-full max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
          {branches.map((branch) => (
            <button
              key={branch.id}
              onClick={() => handleSelect(branch.id)}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-6 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-95"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-2xl">☕</div>
                <div>
                  <p className="font-semibold">{bilingual(branch.name, locale)}</p>
                  <p className="text-xs text-muted-foreground">{t.branchSelect.selectHint}</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground rtl:rotate-180" />
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
