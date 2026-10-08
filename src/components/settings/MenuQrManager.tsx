"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, FileText, Loader2, QrCode, Upload } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toast";

const MAX_MENU_PDF_BYTES = 25 * 1024 * 1024;
const MENU_FILE_NAME = "public-menu.pdf";

export function MenuQrManager() {
  const { locale } = useI18n();
  const isArabic = locale === "ar";
  const branchId = useBranchStore((state) => state.currentBranchId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<SVGSVGElement>(null);
  const [menuUrl, setMenuUrl] = useState("");
  const [hasMenu, setHasMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const folder = useMemo(
    () => (branchId ? `menus/${branchId}` : ""),
    [branchId]
  );
  const qrValue = useMemo(() => {
    if (!menuUrl) return "";
    const downloadUrl = new URL(menuUrl);
    downloadUrl.searchParams.set("download", "menu.pdf");
    return downloadUrl.toString();
  }, [menuUrl]);

  useEffect(() => {
    let cancelled = false;
    setMenuUrl("");
    setHasMenu(false);

    if (!branchId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data } = supabase.storage
      .from("media")
      .getPublicUrl(`${folder}/${MENU_FILE_NAME}`);
    setMenuUrl(data.publicUrl);

    void supabase.storage
      .from("media")
      .list(folder, { limit: 20, search: MENU_FILE_NAME })
      .then(({ data: files, error }) => {
        if (cancelled) return;
        if (error) throw error;
        setHasMenu(files.some((file) => file.name === MENU_FILE_NAME));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast(
          error instanceof Error
            ? error.message
            : isArabic
              ? "تعذر التحقق من ملف المنيو الحالي"
              : "Could not check the current menu PDF",
          "error"
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [branchId, folder, isArabic]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !branchId) return;

    if (!file.name.toLowerCase().endsWith(".pdf") || file.size > MAX_MENU_PDF_BYTES) {
      toast(
        isArabic
          ? "اختر ملف PDF حجمه 25 ميجابايت أو أقل"
          : "Choose a PDF file no larger than 25 MB",
        "error"
      );
      return;
    }

    const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...signature) !== "%PDF-") {
      toast(isArabic ? "الملف المحدد ليس ملف PDF صالحًا" : "The selected file is not a valid PDF", "error");
      return;
    }

    setUploading(true);
    try {
      const { error } = await supabase.storage.from("media").upload(
        `${folder}/${MENU_FILE_NAME}`,
        file,
        {
          upsert: true,
          contentType: "application/pdf",
          cacheControl: "0",
        }
      );
      if (error) throw error;
      setHasMenu(true);
      toast(
        isArabic
          ? "تم تحديث ملف المنيو. كود QR ورابطه لم يتغيرا."
          : "Menu PDF updated. The QR code and its link are unchanged.",
        "success"
      );
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : isArabic
            ? "تعذر رفع ملف المنيو"
            : "Could not upload the menu PDF",
        "error"
      );
    } finally {
      setUploading(false);
    }
  };

  const downloadQr = () => {
    if (!qrRef.current || !menuUrl) return;
    const svg = new XMLSerializer().serializeToString(qrRef.current);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "sanky-menu-qr.svg";
    link.click();
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5" />
          {isArabic ? "منيو PDF وQR Code" : "PDF Menu & QR Code"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {isArabic
            ? "ارفع ملف المنيو أو استبدله في أي وقت. مسح كود QR ينزّل أحدث ملف PDF مباشرة، والكود يظل ثابتًا لهذا الفرع."
            : "Upload or replace the menu PDF at any time. Scanning this branch’s fixed QR code downloads the latest PDF directly."}
        </p>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex min-h-44 min-w-44 items-center justify-center rounded-xl border bg-white p-3">
            {menuUrl ? (
              <QRCodeSVG
                ref={qrRef}
                value={qrValue}
                size={160}
                level="H"
                includeMargin
                bgColor="#ffffff"
                fgColor="#173b2e"
                title={isArabic ? "QR Code لمنيو Sanky" : "Sanky menu QR code"}
              />
            ) : (
              <QrCode className="h-14 w-14 text-muted-foreground/40" />
            )}
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <Label>{isArabic ? "ملف المنيو الحالي" : "Current menu PDF"}</Label>
              <div className="mt-1.5 flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {loading
                    ? isArabic ? "جارٍ التحقق..." : "Checking..."
                    : hasMenu
                      ? MENU_FILE_NAME
                      : isArabic ? "لم يتم رفع ملف بعد" : "No PDF uploaded yet"}
                </span>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={handleUpload}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={!branchId || uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading
                  ? isArabic ? "جارٍ الرفع..." : "Uploading..."
                  : hasMenu
                    ? isArabic ? "استبدال ملف PDF" : "Replace PDF"
                    : isArabic ? "رفع ملف PDF" : "Upload PDF"}
              </Button>
              {hasMenu && menuUrl && (
                <>
                  <Button type="button" variant="outline" onClick={downloadQr}>
                    <Download className="h-4 w-4" />
                    {isArabic ? "تنزيل QR" : "Download QR"}
                  </Button>
                  <Button asChild type="button" variant="outline">
                    <a href={menuUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      {isArabic ? "فتح المنيو" : "Open menu"}
                    </a>
                  </Button>
                </>
              )}
            </div>
            <p className="break-all text-xs text-muted-foreground">
              {isArabic ? "رابط ثابت للفرع:" : "Fixed branch link:"} {menuUrl || (isArabic ? "اختر فرعًا" : "Select a branch")}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
