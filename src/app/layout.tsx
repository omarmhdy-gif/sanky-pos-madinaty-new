import type { Metadata, Viewport } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/hooks/useTheme";
import { Toaster } from "@/components/ui/toast";
import { DataBootstrap } from "@/components/layout/DataBootstrap";
import { SystemMonitor } from "@/components/layout/SystemMonitor";

export const metadata: Metadata = {
  title: "Sanky POS — Coffee Shop Point of Sale",
  description: "Fast, beautiful, bilingual point of sale for coffee shops. Built by Sanky.",
  icons: { icon: "/sanky-logo.jpg", shortcut: "/sanky-logo.jpg", apple: "/sanky-logo.jpg" },
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
            <SystemMonitor />
            <DataBootstrap>{children}</DataBootstrap>
            <Toaster />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
