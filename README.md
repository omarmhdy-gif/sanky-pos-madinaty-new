# Sanky POS

A tablet-first Point of Sale system for coffee shops — production system, not a demo. Owners manage the shop from a phone/tablet; cashiers run the till on an iPad or any tablet browser.

## Tech Stack

- **Next.js 15** (App Router), static export (`output: 'export'`), deployed to Vercel
- **TypeScript** (strict mode), **Zustand** for state
- **Supabase** (Postgres + PostgREST + RPC) — the real backend; see `supabase/schema.sql` and the `migration_*.sql` files
- **Tailwind CSS 3**, full dark mode, English/Arabic i18n with RTL layout switching (`src/lib/i18n`)
- **Recharts** for dashboard/report charts
- **`printer-server/`** — a small companion Node.js program that runs on a PC on the shop's Wi-Fi network, bridging the browser-based POS to a real EPSON ESC/POS receipt printer and cash drawer (browsers can't open raw TCP sockets, so this is a hard architectural requirement, not a convenience). Discovered automatically via mDNS/Bonjour — see `printer-server/README.md`.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase project URL + anon key.
3. Run `supabase/schema.sql` once in the Supabase SQL Editor (fresh setup) or apply the `migration_*.sql` files in order (existing database). Run `supabase/seed.sql` once for starter catalog data.
4. `npm run dev` for local development, or `npm run build && vercel deploy --prod` to ship.
5. Set up the printer server on a PC on the shop's Wi-Fi network — see `printer-server/README.md`.

## What's Included

- **Login** — PIN-based staff profile switcher, real Supabase-backed staff records
- **POS** — category tabs, live search, favorites/recent, modifier customization, cart with hold/resume, discounts, dine-in/takeaway/delivery, split payments
- **Dashboard** — sales/orders/average ticket, sales trend, top products, low-stock alerts, employees currently working
- **Products / Recipes / Inventory** — full CRUD, stock tracking, recipe-based ingredient deduction on sale, receive-stock/purchases
- **Orders / Reports** — history with date-range filters, void/refund, revenue by category, payment method breakdown, CSV export
- **Finance** — expenses, purchases, P&L
- **Employees / Attendance** — staff management, shift open/close (cash reconciliation), clock-in/out with late/overtime tracking
- **Devices** — printer setup (auto-discovered via mDNS, no IP/port entry needed), barcode scanner, and a full system dashboard: Device Server / Printer / Internet / Supabase / Sync status, queued receipts, offline orders pending sync, and a 500-event system log
- **Settings** — shop info, tax/VAT, language, theme, receipt footer

## Reliability

- **Offline protection**: if the internet drops mid-sale, the order still completes and the receipt still prints (printing goes through the local Device Server, not the internet) — the order itself queues locally and syncs automatically once connectivity returns, via the same code path a normal checkout uses.
- **Print queue**: a failed print is queued and retried automatically (and reprintable manually from Devices) — never silently lost.
- **Auto-recovery**: the Device Server is found via a fixed mDNS hostname (`sanky-device.local`), so a changed IP, a restarted server, or a Wi-Fi blip all self-heal without the owner reconfiguring anything. A background monitor (mounted app-wide, not just on the Devices page) checks Device Server/printer/internet/Supabase every 30 seconds and retries silently.

## Architecture Notes

- `src/lib/types.ts` defines the full domain model.
- `src/lib/store/*` — Zustand stores are the single write path for all data; each store's actions call `src/lib/supabase/api.ts`, which wraps the actual Supabase RPC calls.
- `src/components/layout/SystemMonitor.tsx` — the app-wide background health/reconnect/queue-flush loop.
- `printer-server/server.js` — the local printer bridge; see its own README for setup and troubleshooting.
- Currency, tax rate, and locale are all runtime-configurable via Settings.
