# Sanky Printer Server

A tiny local server that lets Sanky POS (running on an iPad or any tablet)
print to a network EPSON ESC/POS receipt printer and open its cash drawer.

## Why this exists

Browsers cannot open a raw network connection to a printer — that's a
security restriction built into every browser, not something any website
can work around. This server runs on an ordinary Windows/Mac/Linux PC (or a
Raspberry Pi) that's on the **same Wi-Fi network** as both the iPad and the
printer, and does the one thing a browser can't:

```
iPad (Sanky POS)  --HTTPS-->  This server  --raw TCP-->  EPSON printer  --wired-->  cash drawer
```

## Setup (one-time)

1. Install [Node.js](https://nodejs.org) (LTS version) on the PC that will run this server.
2. Copy this `printer-server` folder onto that PC. **If you're extracting this from a ZIP file, extract it into a brand-new empty folder — never extract it directly on top of an existing `printer-server` folder or straight onto the Desktop.** Doing so can merge/nest the files incorrectly (e.g. `printer-server/printer-server/server.js` one level too deep), which makes `node server.js` fail immediately with "Cannot find module" — the server never starts, and nothing will ever show as Online no matter what's configured. If in doubt, delete any old copy first, then extract fresh. **This "fresh empty folder" advice is for first-time setup only — if a printer-server is already running on this PC and you're updating it to a newer version, do NOT follow this step. See "Updating to a new version" below instead**, which preserves the existing trusted certificate.
3. Open a terminal in this folder and run:
   ```
   npm install
   npm start
   ```
4. It will print `mDNS: advertising as sanky-device.local` — this is the address Sanky POS looks for automatically, so **you never need to note down an IP address.**
5. On the iPad (or any device running Sanky POS), open Safari and visit `https://sanky-device.local:9200/health` directly, **once**. Safari will show a "this connection is not private" warning — this is expected for a local server with no public certificate authority, and is an unavoidable one-time step for any self-signed local server (there is no way to script around it — it's a deliberate browser security decision). Tap **Show Details → visit this website** (wording varies by browser) to accept it. You only need to do this once per device. If this page doesn't load at all (not even the warning), see **Troubleshooting** below before continuing.
6. In Sanky POS, go to **Settings → Devices**. It searches for the Device Server automatically when the page opens; if it's the only one found, it **connects automatically** — no address to type in. Otherwise tap **Find Device Server**, then **Connect** once it appears (showing its name, IP, status, and version).
7. Enter your EPSON printer's own **IP address and port** (usually `9100`) — this part still needs manual entry, since there's no discovery mechanism for the printer itself, only for this server. Tap **Test Connection**, then **Test Print** to confirm everything's wired up correctly.

### How automatic discovery works (and its real limits)

Sanky POS finds this server via **mDNS/Bonjour** — the same technology
AirPrint and AirPlay use. This server advertises itself on the LAN as
`sanky-device.local`; iPadOS resolves that hostname to this PC's current IP
at the operating-system level (it's built into iOS/iPadOS, not something
Safari needs a special API for). Two honest limits worth knowing:
- **Safari cannot "browse" for multiple devices** — no web browser exposes
  an API for that. "Find Device Server" checks the one fixed, well-known
  address this server always advertises, which is why "if only one exists,
  connect automatically" works: with this app's one-Device-Server-per-shop
  design, there's only ever one thing to find.
- **mDNS depends on multicast traffic being allowed on the network.** Most
  home/small-business Wi-Fi allows it by default; some routers, mesh
  systems, and "Guest"/AP-isolated networks block multicast and will break
  discovery entirely. If "Find Device Server" never finds anything even
  though the server is clearly running, this is the most likely cause —
  use the **Advanced** section in Devices to enter the address directly as
  a fallback (see Troubleshooting below for how to find it).

## Updating to a new version

This server generates its HTTPS certificate **exactly once** and reuses it
forever after (see `getOrCreateCert()` in `server.js`) — every device that
has ever tapped through the "not private" warning once must keep trusting
that same certificate, or the owner would have to re-trust it on every
iPad, every time, for every future update. That only works if the
`.certs/` folder survives the update. **Extracting a new ZIP into a brand
new folder — the first-time-setup instructions above — does NOT carry
`.certs/` over, and would force every device to re-trust the server.**
Updating is a different, much simpler operation:

1. **If it's running as a Windows Service**, stop it first (as
   Administrator, from *this existing* folder):
   ```
   npm run uninstall-service
   ```
   (This does not touch `.certs/` — it only removes the OS-level service
   registration. If you're not running it as a service, just close the
   terminal window / stop the process instead.)
2. **Copy only the source files into this SAME existing folder**, overwriting
   the old ones: `server.js`, `package.json`, `package-lock.json`,
   `install-service.js`, `uninstall-service.js`, `README.md`. **Do not
   delete or replace this folder itself, and never touch `.certs/`** — leave
   it exactly as it is. (`node_modules/`, `daemon/`, and any `.log`/`.pid`
   files are runtime artifacts, not source — leave those alone too; `npm
   install` below regenerates `node_modules/` if `package.json` changed.)
3. From this folder:
   ```
   npm install
   ```
4. Start it again the same way you ran it before — `npm start` for a quick
   check, or reinstall the service:
   ```
   npm run install-service
   ```
5. Check the startup log line: it should say `Reusing the existing
   certificate, generated <original date> — no re-trust needed on any
   device.` If it instead says `Generated a NEW certificate`, something
   deleted or moved `.certs/` during the update — stop and check step 2
   before continuing, since every device will otherwise need to re-trust it.
   No iPad action is needed for a normal update; they keep working exactly
   as before.

## Running it permanently (recommended: install it as a Windows Service)

For daily use, this server needs to be running whenever the till is in use —
and ideally without anyone needing to remember to start it, or leaving a
terminal window open all day.

**Recommended, on Windows:** install it as a real Windows Service. This
makes it start automatically when the PC boots (even before anyone logs
in), restart itself automatically if it ever crashes, and run with **no
visible window** — you never need to open a terminal or keep this folder
open again.

1. Right-click PowerShell (or Command Prompt) and choose **"Run as
   administrator"** — this step genuinely requires it; installing a Windows
   Service is an OS-level operation regular permissions can't do.
2. `cd` into this `printer-server` folder.
3. Run:
   ```
   npm run install-service
   ```
4. That's it. Check it any time via Windows: **Start → "Services" → "Sanky
   Printer Server"**. To remove it later (also as Administrator):
   ```
   npm run uninstall-service
   ```
   This doesn't touch `.certs/` or any configuration — reinstalling later
   picks up exactly where it left off, same certificate, no devices need to
   re-trust anything.

**If you're not on Windows, or don't want a service:**
- Leave the PC on and the terminal window open during business hours, or
- Use a process manager like [pm2](https://pm2.keymetrics.io/) (`npm install -g pm2 && pm2 start server.js`) to keep it running in the background and restart it automatically if the PC reboots.

## If this PC is a laptop: stop it sleeping when the lid is closed

**A Windows Service still stops running the instant the PC goes to sleep** —
sleep suspends the entire machine at the hardware level (the CPU halts),
which is a fundamentally different thing from the process crashing or being
closed, and no application code (a service or otherwise) can keep running
through it. By default, Windows puts a laptop to sleep the moment its lid
closes, which is almost certainly why the server "stops" whenever the lid
is shut, even if it's installed as a service.

The fix is a one-time Windows power-settings change, not anything about
this server. Run, as Administrator, from this folder:
```
.\configure-power.ps1
```
This sets the lid-close action to "do nothing," disables automatic sleep,
and disables Windows' own power-saving that can otherwise silently turn off
the network adapter even while the PC stays awake (the same "Offline"
symptom, with a different cause — see Troubleshooting #3 below for that
one specifically). The screen can still turn off on its own to save power —
that's unrelated and fine, only actual system Sleep stops the server.

**This PC should stay plugged into power at all times** once sleep is
disabled — "do nothing" on battery still drains the battery normally, it
just never sleeps to conserve it, which is exactly what a till needs to
keep printing but is not what you want on unplugged battery power for long.

## Troubleshooting: iPad can't reach the server

The server always listens on `0.0.0.0`, meaning every network interface on the
PC, not just `localhost` — so it's reachable from other devices by design.
If the iPad still shows the printer as "Printer Server Offline" or the
`/health` page in step 5 never loads, check these **in order**:

1. **The certificate hasn't been trusted for the *exact* address the app
   actually uses.** This is the single most common cause once the server is
   confirmed running and reachable (ping/`Test-NetConnection` succeed), and
   it produces a confusing symptom: opening `https://192.168.8.104:9200/health`
   manually in a browser works fine after accepting the warning, but the POS
   still fails with a browser console error like `ERR_CERT_AUTHORITY_INVALID`.
   **Why both of those are true at once:** browsers scope a self-signed
   certificate trust decision to the *exact origin* (scheme + hostname +
   port) you clicked "proceed" on — not to the underlying server or
   certificate itself. Trusting `https://192.168.8.104:9200` does **not**
   also trust `https://sanky-device.local:9200`, even though it's the exact
   same server, the exact same certificate, and the certificate's SAN
   correctly covers both. They're two different origins as far as the
   browser's trust store is concerned, so each needs its own one-time visit.
   **Fix:** in Sanky POS, use the **Trust Device Server** button (Devices →
   Device Server card, shown when it can't connect) — it opens the *exact*
   `https://sanky-device.local:9200/health` URL the app itself uses, in a
   new tab. Accept the warning there, then switch back to the Sanky POS tab
   — it retries automatically. Do **not** substitute the IP address for
   this step; it has to be the same address the app requests.
2. **A stricter browser policy can still block it even after the certificate
   is trusted.** Chrome (and Chromium-based browsers) enforce "Private
   Network Access": a public website (like `sanky-pos.vercel.app`) calling
   `fetch()` against a private-network address (a LAN IP, or a `.local`
   hostname) requires the server to explicitly grant permission on its CORS
   preflight response, or Chrome silently blocks it — with no detail
   surfaced to the page's own JavaScript (browsers deliberately hide the
   specific reason from scripts; it only ever shows up in the browser's own
   DevTools console, never in an error message the app itself can display).
   This server already sends the required `Access-Control-Allow-Private-Network`
   header on every response (added in v1.4.0) — if you're running an older
   copy of this server, update it. Safari does not enforce this particular
   policy the same way Chrome does, so this specifically matters if you're
   ever testing/using this from Chrome (Windows/Android) rather than Safari.
3. **Windows has this Wi-Fi network categorized as "Public" instead of
   "Private."** This is the single most common cause of "works on this PC,
   Offline from every other device" and is invisible unless you specifically
   check for it. Windows silently blocks unsolicited inbound connections on
   networks it considers "Public" (its assumption is you're on a coffee
   shop/airport network with strangers on it) — even if you clicked "Allow"
   on the Windows Defender Firewall popup for **Private** networks, that
   permission simply doesn't apply if the network itself is categorized
   Public. Check it:
   ```powershell
   Get-NetConnectionProfile
   ```
   Look at `NetworkCategory` for your Wi-Fi adapter. If it says `Public`,
   fix it (run PowerShell **as Administrator**):
   ```powershell
   Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
   ```
   (Replace `"Wi-Fi"` with whatever `Get-NetConnectionProfile` showed as the
   `InterfaceAlias` if it's named differently.) This is safe to do for your
   shop's own dedicated router/network — it tells Windows "trust devices on
   this network," which is exactly what you want for a till talking to a
   printer and an iPad on the same private Wi-Fi.
4. **Add explicit firewall rules that aren't tied to the Public/Private
   checkbox at all** (the most robust fix, recommended in addition to #3 —
   run as Administrator):
   ```powershell
   New-NetFirewallRule -DisplayName "Sanky Printer Server" -Direction Inbound -Protocol TCP -LocalPort 9200,9201 -Action Allow -Profile Any
   New-NetFirewallRule -DisplayName "Sanky Printer Server (mDNS)" -Direction Inbound -Protocol UDP -LocalPort 5353 -Action Allow -Profile Any
   ```
   The first rule covers the HTTPS/HTTP ports; the second covers mDNS
   discovery itself (UDP port 5353, used by "Find Device Server") — both
   are needed, and either one being blocked produces the same "can't find
   it / Offline" symptom. These explicit rules keep working even if Windows
   ever re-categorizes the network later.
5. **The original Windows Defender Firewall popup.** The first time the
   server runs, Windows may still separately pop up *"Windows Defender
   Firewall has blocked some features of node.js."* Check both **Private**
   and **Public** networks and click **Allow access** (checking only Private
   is what causes this exact problem if the network is actually categorized
   Public — see #3). If you missed that prompt, add it manually via
   `Windows Security → Firewall & network protection → Allow an app through
   firewall → Change settings → Allow another app... → node.js`.
6. **Same network.** Confirm the iPad and the PC are on the same Wi-Fi
   network (not one on Wi-Fi and the other on cellular/a guest network with
   client isolation enabled). Some routers' "Guest" or "AP/Client Isolation"
   Wi-Fi mode deliberately blocks devices from reaching each other even
   though both show as "connected" — use the main network, not a guest one.
7. **Test from another device's browser first.** Before touching Sanky POS,
   open a plain browser on any other phone/laptop on the same network and
   visit `https://sanky-device.local:9200/health` (or the plain IP address
   printed in the terminal, e.g. `https://192.168.1.50:9200/health`, if that
   device doesn't support `.local` resolution — most non-Apple devices
   don't). You should see `{"ok":true,...}` (after accepting the certificate
   warning once). If this fails from a laptop too, it's a firewall/network
   issue, not a Sanky POS or iPad issue — fix #3–#5 first. Testing from the
   *same* PC (e.g. hitting its own LAN IP from a browser on that PC) is
   **not** a reliable substitute for this — Windows can special-case
   same-machine traffic in ways that don't reflect what a real second device
   experiences.
8. **"Find Device Server" finds nothing even though the server is running.**
   This means mDNS/multicast traffic is being blocked somewhere on this
   network (see "How automatic discovery works" above) — common on some
   routers, mesh Wi-Fi systems, and guest networks. Open Devices → **Advanced**
   and enter the address printed in the server's terminal directly (the
   `https://<ip>:9200` line) as a fallback; everything else (printing,
   status, diagnostics) works identically either way.
9. **The PC's LAN IP address changed.** Because Sanky POS now connects via
   the `sanky-device.local` hostname (not a raw IP), this mostly isn't a
   problem anymore — mDNS re-resolves the current IP on every connection,
   automatically. The certificate also auto-regenerates on the next server
   restart if it detects the machine's IP list has changed (you'll need to
   re-trust it once on the iPad in that case — same one-time step as
   initial setup). This item only still matters if you're using the
   **Advanced** manual-IP fallback instead of discovery — in that case, a
   changed IP does require updating the address by hand, or better, giving
   the PC a static IP/DHCP reservation so it never changes.
10. **Use Devices → Diagnostics → Ping Server in Sanky POS itself.** It
   shows the exact URL being called and whatever error text the browser
   allows JavaScript to see. Note this is necessarily generic (e.g. "Failed
   to fetch") — browsers deliberately don't expose the specific reason
   (cert vs. network vs. CORS) to page scripts, only to their own DevTools
   console. If Ping fails and the server is confirmed running and reachable
   by IP, treat it as the certificate-trust issue (#1) first — it's by far
   the most common cause of a generic failure at this point.
11. **Restart the server after any firewall/network change.** Stop it
   (`Ctrl+C` in the terminal) and run `npm start` again.

## What it does — and doesn't — do

- It only relays raw bytes to whatever IP/port the POS tells it to, over your local network. It has no access to your Supabase data, your sales, or the internet.
- It accepts connections from any device on your Wi-Fi network (no login) — this is intentional and safe for a private shop network, the same trust model as the printer itself.
- Adding another device later (a kitchen printer, a label printer) doesn't require changing this server at all — it's a generic relay; only the POS app needs to know that device's address.
