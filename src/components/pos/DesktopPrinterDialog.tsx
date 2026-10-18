"use client";

import { useEffect, useState } from "react";
import { Loader2, Printer, Radar, Usb, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDeviceSettingsStore, type PrinterConnectionType } from "@/lib/store/useDeviceSettingsStore";
import { toast } from "@/components/ui/toast";
import { bytesToHex } from "@/lib/printing/printerServerClient";

export function DesktopPrinterDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const settings = useDeviceSettingsStore();
  const [connectionType, setConnectionType] = useState<PrinterConnectionType>(settings.printerConnectionType);
  const [ip, setIp] = useState(settings.printerIp);
  const [port, setPort] = useState(String(settings.printerPort || 9100));
  const [usbPrinters, setUsbPrinters] = useState<{ name: string; portName: string; driverName: string }[]>([]);
  const [usbName, setUsbName] = useState(settings.usbPrinterName);
  const [scanning, setScanning] = useState(false);
  const [testing, setTesting] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!open || !window.sankyDesktop?.isDesktop) return;
    let cancelled = false;
    setScanning(true);
    window.sankyDesktop.printer.listUsb()
      .then((printers) => {
        if (!cancelled) {
          setUsbPrinters(printers);
          if (!settings.usbPrinterName && printers[0]) setUsbName(printers[0].name);
        }
      })
      .catch(() => { if (!cancelled) toast("Couldn't check Windows USB printers.", "error"); })
      .finally(() => { if (!cancelled) setScanning(false); });
    return () => { cancelled = true; };
  }, [open, settings.usbPrinterName]);

  const scanNetwork = async () => {
    setScanning(true);
    try {
      const found = await window.sankyDesktop?.printer.scanNetwork(Number(port));
      if (!found?.length) {
        toast("No network receipt printers were found on this Wi-Fi network.", "info");
        return;
      }
      setIp(found[0].ip);
      setPort(String(found[0].port));
      toast(`Found ${found.length} printer${found.length === 1 ? "" : "s"}. Selected ${found[0].ip}.`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Network scan failed.", "error");
    } finally {
      setScanning(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const online = connectionType === "usb"
        ? usbPrinters.some((printer) => printer.name === usbName)
        : await window.sankyDesktop?.printer.testNetwork(ip.trim(), Number(port));
      toast(online ? "Printer is connected." : "Printer is not connected. Check the cable or network settings.", online ? "success" : "info");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not check the printer.", "error");
    } finally {
      setTesting(false);
    }
  };

  const savePrinter = () => {
    settings.setPrinterConnectionType(connectionType);
    if (connectionType === "usb") {
      settings.setUsbPrinterName(usbName);
    } else {
      settings.setPrinterIp(ip.trim());
      settings.setPrinterPort(Number(port) || 9100);
    }
    toast("Printer settings saved on this computer.", "success");
  };

  const testPrint = async () => {
    setPrinting(true);
    try {
      const bytes = new Uint8Array([0x1b, 0x40, 0x1b, 0x61, 1, ...new TextEncoder().encode("SANKY POS\nPrinter test\n\n\n"), 0x1d, 0x56, 1]);
      await window.sankyDesktop?.printer.print({
        connectionType,
        ...(connectionType === "usb" ? { usbPrinterName: usbName } : { ip: ip.trim(), port: Number(port) || 9100 }),
        dataHex: bytesToHex(bytes),
      });
      savePrinter();
      toast("Test receipt sent to the printer.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Test print failed.", "error");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Printer className="h-5 w-5" /> Connect receipt printer</DialogTitle>
          <DialogDescription>Find a USB printer connected to this Windows computer or scan the local network.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={connectionType === "usb" ? "default" : "outline"} onClick={() => setConnectionType("usb")}><Usb className="mr-2 h-4 w-4" /> USB</Button>
            <Button type="button" variant={connectionType === "network" ? "default" : "outline"} onClick={() => setConnectionType("network")}><Wifi className="mr-2 h-4 w-4" /> Network</Button>
          </div>

          {connectionType === "usb" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="desktop-usb-printer">Windows USB printer</label>
              <select id="desktop-usb-printer" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={usbName} onChange={(event) => setUsbName(event.target.value)}>
                <option value="">Choose a printer</option>
                {usbPrinters.map((printer) => <option key={printer.name} value={printer.name}>{printer.name} ({printer.portName})</option>)}
              </select>
              <Button type="button" variant="outline" className="w-full" disabled={scanning} onClick={() => { setScanning(true); window.sankyDesktop?.printer.listUsb().then(setUsbPrinters).catch(() => toast("USB scan failed.", "error")).finally(() => setScanning(false)); }}>
                {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Usb className="mr-2 h-4 w-4" />} Scan USB printers on this PC
              </Button>
              {!usbPrinters.length && !scanning && <p className="text-xs text-muted-foreground">No USB receipt printer found. Connect it and make sure Windows has installed its driver.</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <Button type="button" variant="outline" className="w-full" disabled={scanning} onClick={scanNetwork}>
                {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radar className="mr-2 h-4 w-4" />} Scan this network for printers
              </Button>
              <div className="grid grid-cols-[1fr_110px] gap-2">
                <div className="space-y-1"><label htmlFor="desktop-printer-ip" className="text-sm font-medium">Printer IP</label><input id="desktop-printer-ip" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" placeholder="192.168.1.50" value={ip} onChange={(event) => setIp(event.target.value)} /></div>
                <div className="space-y-1"><label htmlFor="desktop-printer-port" className="text-sm font-medium">Port</label><input id="desktop-printer-port" inputMode="numeric" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={port} onChange={(event) => setPort(event.target.value)} /></div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" disabled={testing || (connectionType === "usb" ? !usbName : !ip)} onClick={testConnection}>{testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check connection"}</Button>
            <Button type="button" variant="outline" disabled={printing || (connectionType === "usb" ? !usbName : !ip)} onClick={testPrint}>{printing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test print"}</Button>
            <Button type="button" disabled={connectionType === "usb" ? !usbName : !ip} onClick={savePrinter}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
