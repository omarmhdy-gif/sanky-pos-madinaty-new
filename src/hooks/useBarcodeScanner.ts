import { useEffect, useRef } from "react";

const SCAN_MAX_GAP_MS = 60;
const MIN_CODE_LENGTH = 3;

/** Detects USB barcode scanners, which behave like a keyboard typing very
 * fast (a few ms between characters) followed by Enter — much faster than
 * any human typing, which is what tells a scan apart from someone using the
 * search box. Listens on `window` regardless of what currently has focus,
 * so scanning works without clicking into the search field first. */
export function useBarcodeScanner(onScan: (code: string) => void, enabled = true) {
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      const gap = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === "Enter") {
        const code = bufferRef.current;
        bufferRef.current = "";
        if (code.length >= MIN_CODE_LENGTH) {
          onScan(code);
        }
        return;
      }

      if (e.key.length !== 1) return; // ignore Shift/Control/Backspace/arrows/etc.

      bufferRef.current = gap > SCAN_MAX_GAP_MS ? e.key : bufferRef.current + e.key;
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onScan]);
}
