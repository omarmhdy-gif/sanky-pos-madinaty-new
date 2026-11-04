import type { Metadata, Viewport } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/hooks/useTheme";
import { Toaster } from "@/components/ui/toast";
import { AppRuntime } from "@/components/layout/AppRuntime";

export const metadata: Metadata = {
  title: "NOVA — Point of Sale",
  description: "Next-Gen Operations · Virtual Automation",
  icons: { icon: "/nova-icon-green.svg", shortcut: "/nova-icon-green.svg", apple: "/nova-icon-green.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1310" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        <ThemeProvider>
          <I18nProvider>
            <AppRuntime>{children}</AppRuntime>
            <Toaster />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
