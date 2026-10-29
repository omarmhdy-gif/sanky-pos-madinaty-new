"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Plus,
  Pencil,
  Wrench,
  Trash2,
  PackagePlus,
  Search,
  FileDown,
  Upload,
  Factory,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { InventoryRow } from "@/components/inventory/InventoryRow";
import { InventoryItemFormDialog } from "@/components/inventory/InventoryItemFormDialog";
import { ManufactureInventoryDialog } from "@/components/inventory/ManufactureInventoryDialog";
import { AdjustStockDialog } from "@/components/inventory/AdjustStockDialog";
import { ReceiveStockDialog } from "@/components/inventory/ReceiveStockDialog";
import { Input } from "@/components/ui/input";
import { useDataStore } from "@/lib/store/useDataStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { formatDateTime, formatMoney, formatNumber, cn } from "@/lib/utils";
import { inventoryItemUnitCost, stockLevel, type StockLevel } from "@/lib/inventory";
import { supabase } from "@/lib/supabase/client";
import { useBranchStore } from "@/lib/store/useBranchStore";
import type {
  InventoryItem,
  InventoryItemType,
  MeasuredUnit,
} from "@/lib/types";

const STOCK_LEVEL_PRIORITY: Record<StockLevel, number> = {
  critical: 0,
  low: 1,
  good: 2,
};

const VALID_TYPES: InventoryItemType[] = ["piece", "measured"];

const VALID_UNITS: MeasuredUnit[] = ["g", "ml"];

type ImportResult = {
  row: number;
  status: "created" | "updated" | "failed";
  message: string;
};

type ImportWorkflowKind = "inventory" | "stock-count" | "opening-balance";

export default function InventoryPage() {
  const { t, locale } = useI18n();

  const items = useDataStore((s) => s.inventoryItems);
  const currentBranchId = useBranchStore((s) => s.currentBranchId);
  const movements = useDataStore((s) => s.stockMovements);
  const settings = useDataStore((s) => s.settings);

  const addInventoryItem = useDataStore(
    (s) => s.addInventoryItem
  );

  const updateInventoryItem = useDataStore(
    (s) => s.updateInventoryItem
  );

  const deleteInventoryItem = useDataStore(
    (s) => s.deleteInventoryItem
  );

  const role = useAuthStore((s) => s.currentUser?.role);
  const isOwner = role === "owner";

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stockCountInputRef = useRef<HTMLInputElement | null>(null);
  const openingBalanceInputRef = useRef<HTMLInputElement | null>(null);
  const adjustStock = useDataStore((s) => s.adjustStock);
  const setOpeningBalance = useDataStore((s) => s.setOpeningBalance);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [adjusting, setAdjusting] =
    useState<InventoryItem | null>(null);
  const [receiving, setReceiving] =
    useState<InventoryItem | null>(null);
  const [manufacturing, setManufacturing] = useState<InventoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<InventoryItem | null>(null);

  const [search, setSearch] = useState("");

  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] =
    useState<ImportResult[]>([]);
  const [importDialogOpen, setImportDialogOpen] =
    useState(false);
  const [importWorkflowKind, setImportWorkflowKind] = useState<ImportWorkflowKind | null>(null);
  const [templateDownloaded, setTemplateDownloaded] = useState(false);

  const openImportWorkflow = (kind: ImportWorkflowKind) => {
    setTemplateDownloaded(false);
    setImportWorkflowKind(kind);
  };

  const closeImportWorkflow = () => {
    setImportWorkflowKind(null);
    setTemplateDownloaded(false);
  };

  const downloadCurrentTemplate = async () => {
    if (importWorkflowKind === "inventory") {
      await handleDownloadTemplate();
    } else if (importWorkflowKind) {
      downloadOperationSheet(importWorkflowKind);
    }
    setTemplateDownloaded(true);
  };

  const chooseImportFile = () => {
    if (!templateDownloaded) return;
    if (importWorkflowKind === "inventory") fileInputRef.current?.click();
    if (importWorkflowKind === "stock-count") stockCountInputRef.current?.click();
    if (importWorkflowKind === "opening-balance") openingBalanceInputRef.current?.click();
  };

  const handleOperationFileChange = (
    event: ChangeEvent<HTMLInputElement>,
    kind: "stock-count" | "opening-balance",
  ) => {
    closeImportWorkflow();
    void importOperationSheet(event, kind);
  };

  const downloadOperationSheet = (kind: "stock-count" | "opening-balance") => {
    const rows = items.map((item) => kind === "stock-count" ? ({
      "Item ID": item.id,
      "Item Name": item.name.en,
      "Counted Quantity": item.quantity,
      Unit: item.unit ?? "piece",
    }) : ({
      "Item ID": item.id,
      "Item Name": item.name.en,
      "Opening Quantity": "",
      "Purchase Unit": item.purchaseUnit ?? item.unit ?? "piece",
      "Cost per Purchase Unit": "",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, kind === "stock-count" ? "Stock Count" : "Opening Balance");
    XLSX.writeFile(book, `madinaty-${kind}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const importOperationSheet = async (event: ChangeEvent<HTMLInputElement>, kind: "stock-count" | "opening-balance") => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const results: ImportResult[] = [];
    try {
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = book.Sheets[book.SheetNames[0]];
      if (!sheet) throw new Error("The Excel file has no worksheet.");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const seenIds = new Set<string>();
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        try {
          const id = String(row["Item ID"] ?? "").trim();
          if (seenIds.has(id)) throw new Error(`Duplicate Item ID in this sheet: ${id}`);
          seenIds.add(id);
          const item = items.find((candidate) => candidate.id === id);
          if (!item) throw new Error(`Unknown Item ID: ${id || "(empty)"}`);
          if (kind === "stock-count") {
            if (row["Counted Quantity"] === "") throw new Error("Counted Quantity is required.");
            const counted = Number(row["Counted Quantity"]);
            const unit = String(row.Unit ?? "").trim();
            if (!Number.isFinite(counted) || counted < 0) throw new Error("Counted Quantity must be zero or greater.");
            if (unit && unit !== (item.unit ?? "piece")) throw new Error(`Unit must match stock unit ${(item.unit ?? "piece")}.`);
            const ok = counted === item.quantity || await adjustStock(item.id, counted - item.quantity, "stock_count");
            if (!ok) throw new Error("Stock count could not be saved.");
            results.push({ row: index + 2, status: "updated", message: `Count saved for ${item.name.en}` });
          } else {
            if (row["Opening Quantity"] === "" || row["Cost per Purchase Unit"] === "") throw new Error("Opening Quantity and Cost per Purchase Unit are required.");
            const quantity = Number(row["Opening Quantity"]);
            const cost = Number(row["Cost per Purchase Unit"]);
            const unit = String(row["Purchase Unit"] ?? "").trim();
            if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(cost) || cost < 0) throw new Error("Opening Quantity and Cost per Purchase Unit must be zero or greater.");
            if (unit && unit !== (item.purchaseUnit ?? item.unit ?? "piece")) throw new Error(`Purchase Unit must be ${(item.purchaseUnit ?? item.unit ?? "piece")}.`);
            const ok = await setOpeningBalance(item.id, quantity, cost);
            if (!ok) throw new Error("Opening balance could not be saved.");
            results.push({ row: index + 2, status: "updated", message: `Opening balance saved for ${item.name.en}` });
          }
        } catch (error) {
          results.push({ row: index + 2, status: "failed", message: error instanceof Error ? error.message : "Invalid row." });
        }
      }
      setImportResults(results.length ? results : [{ row: 0, status: "failed", message: "The sheet has no data rows." }]);
    } catch (error) {
      setImportResults([{ row: 0, status: "failed", message: error instanceof Error ? error.message : "Could not read workbook." }]);
    } finally {
      setImportDialogOpen(true);
      setImporting(false);
      event.target.value = "";
    }
  };

  const handleExportExcel = () => {
    const rows = items.map((item) => ({
      ID: item.id,
      "Name EN": item.name.en,
      "Name AR": item.name.ar,
      Type: item.type,
      Unit: item.unit ?? "",
      Quantity: item.quantity,
      "Critical Threshold":
        item.criticalThreshold ?? "",
      "Low Threshold":
        item.lowThreshold ?? "",
      "Pack Size":
        item.packSize ?? "",
      "Last Purchase Cost":
        item.lastPurchaseCost ?? "",
      "Purchase Unit": item.purchaseUnit ?? "",
      "Conversion Factor": item.conversionFactor ?? 1,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Inventory"
    );

    worksheet["!cols"] = [
      { wch: 22 },
      { wch: 25 },
      { wch: 25 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 20 },
      { wch: 16 },
      { wch: 12 },
      { wch: 20 },
      { wch: 16 },
      { wch: 18 },
    ];

    const date = new Date()
      .toISOString()
      .slice(0, 10);

    XLSX.writeFile(
      workbook,
      `madinaty-inventory-${date}.xlsx`
    );
  };

  const handleDownloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook();

    const worksheet =
      workbook.addWorksheet("Inventory Template");

    worksheet.columns = [
      {
        header: "ID",
        key: "id",
        width: 22,
      },
      {
        header: "Name EN",
        key: "nameEn",
        width: 25,
      },
      {
        header: "Name AR",
        key: "nameAr",
        width: 25,
      },
      {
        header: "Type",
        key: "type",
        width: 14,
      },
      {
        header: "Unit",
        key: "unit",
        width: 12,
      },
      {
        header: "Quantity",
        key: "quantity",
        width: 14,
      },
      {
        header: "Critical Threshold",
        key: "criticalThreshold",
        width: 20,
      },
      {
        header: "Low Threshold",
        key: "lowThreshold",
        width: 18,
      },
      {
        header: "Pack Size",
        key: "packSize",
        width: 14,
      },
      {
        header: "Last Purchase Cost",
        key: "lastPurchaseCost",
        width: 20,
      },
      { header: "Purchase Unit", key: "purchaseUnit", width: 16 },
      { header: "Conversion Factor", key: "conversionFactor", width: 18 },
    ];

    worksheet.addRow({
      id: "",
      nameEn: "",
      nameAr: "",
      type: "piece",
      unit: "",
      quantity: 0,
      criticalThreshold: "",
      lowThreshold: "",
      packSize: "",
      lastPurchaseCost: "",
      purchaseUnit: "",
      conversionFactor: 1,
    });

    worksheet.getRow(1).font = {
      bold: true,
    };

    worksheet.getRow(1).alignment = {
      vertical: "middle",
      horizontal: "center",
    };

    // Type dropdown
    for (let row = 2; row <= 500; row++) {
      worksheet.getCell(`D${row}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: ['"piece,measured"'],
        showErrorMessage: true,
        errorTitle: "Invalid Type",
        error:
          "Please select piece or measured.",
      };

      // Unit dropdown
      worksheet.getCell(`E${row}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"g,ml"'],
        showErrorMessage: true,
        errorTitle: "Invalid Unit",
        error:
          "Please select g or ml for stock and recipe units.",
      };

      // Quantity
      worksheet.getCell(`F${row}`).dataValidation = {
        type: "decimal",
        operator: "greaterThanOrEqual",
        formulae: [0],
        allowBlank: false,
        showErrorMessage: true,
        errorTitle: "Invalid Quantity",
        error:
          "Quantity must be 0 or greater.",
      };

      // Critical Threshold
      worksheet.getCell(`G${row}`).dataValidation = {
        type: "decimal",
        operator: "greaterThanOrEqual",
        formulae: [0],
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: "Invalid Value",
        error:
          "Value must be 0 or greater.",
      };

      // Low Threshold
      worksheet.getCell(`H${row}`).dataValidation = {
        type: "decimal",
        operator: "greaterThanOrEqual",
        formulae: [0],
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: "Invalid Value",
        error:
          "Value must be 0 or greater.",
      };

      // Pack Size
      worksheet.getCell(`I${row}`).dataValidation = {
        type: "decimal",
        operator: "greaterThanOrEqual",
        formulae: [0],
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: "Invalid Pack Size",
        error:
          "Pack Size must be 0 or greater.",
      };

      // Last Purchase Cost
      worksheet.getCell(`J${row}`).dataValidation = {
        type: "decimal",
        operator: "greaterThanOrEqual",
        formulae: [0],
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: "Invalid Cost",
        error:
          "Cost must be 0 or greater.",
      };

      worksheet.getCell(`L${row}`).dataValidation = {
        type: "decimal",
        operator: "greaterThan",
        formulae: [0],
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: "Invalid Conversion Factor",
        error: "Conversion Factor must be greater than 0.",
      };
    }
    const buffer = await workbook.xlsx.writeBuffer();

    const blob = new Blob(
      [buffer],
      {
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download =
      "madinaty-inventory-template.xlsx";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  const parseNumber = (
    value: unknown
  ): number | undefined => {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return undefined;
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
      return undefined;
    }

    return number;
  };

  const handleImportExcel = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    setImporting(true);
    setImportResults([]);

    const results: ImportResult[] = [];

    try {
      const buffer = await file.arrayBuffer();

      const workbook = XLSX.read(buffer, {
        type: "array",
      });

      const firstSheetName =
        workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error(
          "The Excel file does not contain a worksheet."
        );
      }

      const worksheet =
        workbook.Sheets[firstSheetName];

      const rows =
        XLSX.utils.sheet_to_json<
          Record<string, unknown>
        >(worksheet, {
          defval: "",
        });

      if (rows.length === 0) {
        throw new Error(
          "The Excel file is empty."
        );
      }

      for (
        let index = 0;
        index < rows.length;
        index++
      ) {
        const row = rows[index];
        const excelRow = index + 2;

        try {
          const id = String(
            row["ID"] ?? ""
          ).trim();

          const nameEn = String(
            row["Name EN"] ?? ""
          ).trim();

          const nameAr = String(
            row["Name AR"] ?? ""
          ).trim();

          const typeValue = String(
            row["Type"] ?? ""
          )
            .trim()
            .toLowerCase();

          const unitValue = String(
            row["Unit"] ?? ""
          )
            .trim()
            .toLowerCase();

          if (!nameEn) {
            throw new Error(
              "Name EN is required."
            );
          }

          if (!nameAr) {
            throw new Error(
              "Name AR is required."
            );
          }

          if (
            !VALID_TYPES.includes(
              typeValue as InventoryItemType
            )
          ) {
            throw new Error(
              `Invalid Type "${typeValue}". Use piece or measured.`
            );
          }

          const type =
            typeValue as InventoryItemType;

          let unit:
            | MeasuredUnit
            | undefined;

          if (type === "measured") {
            if (
              !VALID_UNITS.includes(
                unitValue as MeasuredUnit
              )
            ) {
              throw new Error(
                `Invalid Unit "${unitValue}". Use g or ml for stock and recipe units.`
              );
            }

            unit =
              unitValue as MeasuredUnit;
          }

          if (type === "piece") {
            unit = undefined;
          }

          const quantity = parseNumber(
            row["Quantity"]
          );

          if (quantity === undefined) {
            throw new Error(
              "Quantity must be a valid number."
            );
          }

          if (quantity < 0) {
            throw new Error(
              "Quantity cannot be negative."
            );
          }

          const criticalThreshold =
            parseNumber(
              row["Critical Threshold"]
            );

          const lowThreshold =
            parseNumber(
              row["Low Threshold"]
            );

          const packSize =
            parseNumber(
              row["Pack Size"]
            );

          const lastPurchaseCost =
            parseNumber(
              row["Last Purchase Cost"]
            );
          const purchaseUnitText = String(row["Purchase Unit"] ?? "").trim();
          const conversionFactor = parseNumber(row["Conversion Factor"]) ?? 1;
          if (conversionFactor <= 0) throw new Error("Conversion Factor must be greater than 0.");

          if (
            criticalThreshold !== undefined &&
            criticalThreshold < 0
          ) {
            throw new Error(
              "Critical Threshold cannot be negative."
            );
          }

          if (
            lowThreshold !== undefined &&
            lowThreshold < 0
          ) {
            throw new Error(
              "Low Threshold cannot be negative."
            );
          }

          if (
            packSize !== undefined &&
            packSize < 0
          ) {
            throw new Error(
              "Pack Size cannot be negative."
            );
          }

          if (
            lastPurchaseCost !== undefined &&
            lastPurchaseCost < 0
          ) {
            throw new Error(
              "Last Purchase Cost cannot be negative."
            );
          }

          if (id) {
            const existingItem =
              items.find(
                (item) => item.id === id
              );

            if (!existingItem) {
              throw new Error(
                `ID "${id}" was not found in Madinaty inventory.`
              );
            }

            if (quantity !== existingItem.quantity || (lastPurchaseCost !== undefined && lastPurchaseCost !== existingItem.lastPurchaseCost)) {
              throw new Error("Stock Quantity and Last Purchase Cost are read-only in the item sheet. Use stock movement or opening-balance operations for inventory values.");
            }

            await updateInventoryItem(
              id,
              {
                name: {
                  en: nameEn,
                  ar: nameAr,
                },
                type,
                unit,
                purchaseUnit: type === "measured" ? purchaseUnitText || unit : undefined,
                conversionFactor: type === "measured" ? conversionFactor : 1,
                criticalThreshold,
                lowThreshold,
                packSize:
                  type === "piece"
                    ? packSize
                    : undefined,
                lastPurchaseCost,
              }
            );

            results.push({
              row: excelRow,
              status: "updated",
              message:
                `Updated "${nameEn}"`,
            });
          } else {
            const created =
              await addInventoryItem({
                name: {
                  en: nameEn,
                  ar: nameAr,
                },
                type,
                unit,
                purchaseUnit: type === "measured" ? purchaseUnitText || unit : undefined,
                conversionFactor: type === "measured" ? conversionFactor : 1,
                quantity,
                criticalThreshold,
                lowThreshold,
                packSize:
                  type === "piece"
                    ? packSize
                    : undefined,
                lastPurchaseCost,
              });

            if (!created) {
              throw new Error(
                "Failed to create inventory item."
              );
            }

            results.push({
              row: excelRow,
              status: "created",
              message:
                `Created "${nameEn}"`,
            });
          }
        } catch (error) {
          results.push({
            row: excelRow,
            status: "failed",
            message:
              error instanceof Error
                ? error.message
                : "Unknown error.",
          });
        }
      }

      setImportResults(results);
      setImportDialogOpen(true);
    } catch (error) {
      setImportResults([
        {
          row: 0,
          status: "failed",
          message:
            error instanceof Error
              ? error.message
              : "Failed to read Excel file.",
        },
      ]);

      setImportDialogOpen(true);
    } finally {
      setImporting(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();

    const filtered = q
      ? items.filter(
          (i) =>
            i.name.en
              .toLowerCase()
              .includes(q) ||
            i.name.ar.includes(q)
        )
      : items;

    return [...filtered].sort((a, b) => {
      const levelDiff =
        STOCK_LEVEL_PRIORITY[
          stockLevel(a)
        ] -
        STOCK_LEVEL_PRIORITY[
          stockLevel(b)
        ];

      if (levelDiff !== 0) {
        return levelDiff;
      }

      return a.quantity - b.quantity;
    });
  }, [items, search]);

  const currentStockList = (
    <div className="overflow-hidden rounded-xl border border-border divide-y divide-border">
      {sorted.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          {t.common.noResults}
        </p>
      ) : (
        sorted.map((item) => (
          <InventoryRow
            key={item.id}
            item={item}
            locale={locale}
            showCost={isOwner}
          >
            {(item.sourcingType ?? "purchased") === "purchased" ? (
              <Button variant="outline" size="sm" onClick={() => setReceiving(item)}>
                <PackagePlus className="h-3.5 w-3.5" />{t.receiveStock.receiveButton}
              </Button>
            ) : item.manufacturingRecipe?.length ? (
              <Button variant="outline" size="sm" onClick={() => setManufacturing(item)}>
                <Factory className="h-3.5 w-3.5" />{t.inventory.manufacture}
              </Button>
            ) : isOwner ? (
              <Button variant="outline" size="sm" onClick={() => { setEditing(item); setFormOpen(true); }}>
                <Pencil className="h-3.5 w-3.5" />{t.inventory.configureManufacturingRecipe}
              </Button>
            ) : null}

            {isOwner && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() =>
                    setAdjusting(item)
                  }
                  title={
                    t.inventory.adjustStock
                  }
                >
                  <Wrench className="h-3.5 w-3.5" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setEditing(item);
                    setFormOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() =>
                    setDeleteTarget(item)
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </InventoryRow>
        ))
      )}
    </div>
  );

  const historyList = (
    <div className="overflow-hidden rounded-xl border border-border divide-y divide-border">
      {movements.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          {t.common.noResults}
        </p>
      ) : (
        movements.map((m) => {
          const item = items.find(
            (i) =>
              i.id === m.inventoryItemId
          );

          const displayName = m.itemName
            ? bilingual(
                m.itemName,
                locale
              )
            : item
            ? bilingual(
                item.name,
                locale
              )
            : t.inventory.unknownItem;

          return (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 p-3.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {displayName}
                </p>

                <p className="text-xs text-muted-foreground">
                  {m.employeeName} ·{" "}
                  {formatDateTime(
                    m.createdAt,
                    locale
                  )}{" "}
                  ·{" "}
                  {t.inventory.reasons[
                    m.reason
                  ]}
                </p>
              </div>

              <span
                className={cn(
                  "shrink-0 text-sm font-semibold",
                  m.quantityDelta >= 0
                    ? "text-success"
                    : "text-destructive"
                )}
              >
                {m.quantityDelta >= 0
                  ? "+"
                  : ""}
                {formatNumber(
                  m.quantityDelta,
                  0,
                  3
                )}
              </span>
            </div>
          );
        })
      )}
    </div>
  );

  const manufacturingList = (
    <div className="grid gap-3 lg:grid-cols-2">
      {sorted.filter((item) => item.sourcingType === "manufactured").length === 0 ? (
        <p className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground lg:col-span-2">{t.inventory.noManufacturingItems}</p>
      ) : sorted.filter((item) => item.sourcingType === "manufactured").map((item) => {
        const recipe = item.manufacturingRecipe ?? [];
        const unitCost = inventoryItemUnitCost(item, items);
        return (
          <article key={item.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{bilingual(item.name, locale)}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{recipe.length ? `${recipe.length} ${t.inventory.requiredComponents.toLowerCase()}` : t.inventory.noManufacturingRecipe}</p>
              </div>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", item.autoManufactureOnSale ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
                {item.autoManufactureOnSale ? t.inventory.autoManufactureOnSale : t.inventory.manufacturing}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm">
              <div><p className="text-xs text-muted-foreground">{t.inventory.currentStock}</p><p className="mt-1 font-semibold tabular-nums">{formatNumber(item.quantity, 0, 3)} {item.unit ?? t.inventory.pieceUnit}</p></div>
              <div><p className="text-xs text-muted-foreground">{t.inventory.estimatedUnitCost}</p><p className="mt-1 font-semibold tabular-nums">{formatMoney(unitCost, settings.currencySymbol)} / {item.unit ?? t.inventory.pieceUnit}</p></div>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setEditing(item); setFormOpen(true); }}>
                <Pencil className="h-3.5 w-3.5" />{recipe.length ? t.inventory.editItem : t.inventory.configureManufacturingRecipe}
              </Button>
              {recipe.length > 0 && <Button size="sm" onClick={() => setManufacturing(item)}><Factory className="h-3.5 w-3.5" />{t.inventory.manufacture}</Button>}
            </div>
          </article>
        );
      })}
    </div>
  );

  const createdCount =
    importResults.filter(
      (r) => r.status === "created"
    ).length;

  const updatedCount =
    importResults.filter(
      (r) => r.status === "updated"
    ).length;

  const failedCount =
    importResults.filter(
      (r) => r.status === "failed"
    ).length;

  const importTitle = importWorkflowKind === "inventory"
    ? "Import Inventory Items"
    : importWorkflowKind === "stock-count"
      ? "Import Stock Count"
      : "Import Opening Balance";

  return (
    <AppShell title={t.inventory.title}>
      <div className="space-y-4 p-4 sm:p-6 pb-10">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {t.inventory.subtitle}
          </p>

          {isOwner && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={
                  handleExportExcel
                }
              >
                <FileDown className="h-3.5 w-3.5" />
                Export Excel
              </Button>

              <Button variant="outline" size="sm" disabled={importing} onClick={() => openImportWorkflow("stock-count")}>
                <Upload className="h-3.5 w-3.5" /> Import Count
              </Button>
              <input ref={stockCountInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => handleOperationFileChange(event, "stock-count")} />

              <Button variant="outline" size="sm" disabled={importing} onClick={() => openImportWorkflow("opening-balance")}>
                <Upload className="h-3.5 w-3.5" /> Import Opening Balance
              </Button>
              <input ref={openingBalanceInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => handleOperationFileChange(event, "opening-balance")} />

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(event) => {
                  closeImportWorkflow();
                  void handleImportExcel(event);
                }}
              />

              <Button
                variant="outline"
                size="sm"
                disabled={importing}
                onClick={() => openImportWorkflow("inventory")}
              >
                <Upload className="h-3.5 w-3.5" />
                {importing
                  ? "Importing..."
                  : "Import Excel"}
              </Button>

              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                {t.inventory.addItem}
              </Button>
            </div>
          )}
        </div>

        <div className="relative">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

          <Input
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            placeholder={
              t.inventory.searchPlaceholder
            }
            className="ps-9"
          />
        </div>

        {isOwner ? (
          <Tabs defaultValue="stock">
            <TabsList>
              <TabsTrigger value="stock">
                {t.inventory.currentStock}
              </TabsTrigger>

              <TabsTrigger value="history">
                {t.inventory.history}
              </TabsTrigger>
              <TabsTrigger value="manufacturing">
                {t.inventory.manufacturing}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="stock">
              {currentStockList}
            </TabsContent>

            <TabsContent value="history">
              {historyList}
            </TabsContent>
            <TabsContent value="manufacturing">
              {manufacturingList}
            </TabsContent>
          </Tabs>
        ) : (
          currentStockList
        )}
      </div>

      <Dialog
        open={importWorkflowKind !== null}
        onOpenChange={(open) => !open && closeImportWorkflow()}
      >
        <DialogContent className="max-w-md" preventOutsideClose>
          <DialogHeader>
            <DialogTitle>{importTitle}</DialogTitle>
            <DialogDescription>
              Download the matching template, fill it in, then upload the completed Excel file.
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-3 rounded-lg border border-border p-4 text-sm">
            <li><span className="font-semibold">1.</span> Download the {importWorkflowKind === "inventory" ? "inventory" : importWorkflowKind === "stock-count" ? "stock count" : "opening balance"} template.</li>
            <li><span className="font-semibold">2.</span> Fill in the rows and save the completed file.</li>
            <li><span className="font-semibold">3.</span> Upload the completed Excel file.</li>
          </ol>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={closeImportWorkflow}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => void downloadCurrentTemplate()}>
              <FileDown className="h-3.5 w-3.5" /> Download Template
            </Button>
            <Button disabled={!templateDownloaded || importing} onClick={chooseImportFile}>
              <Upload className="h-3.5 w-3.5" /> Choose File to Upload
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <InventoryItemFormDialog
        item={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
      />

      <AdjustStockDialog
        item={adjusting}
        open={!!adjusting}
        onOpenChange={(v) =>
          !v && setAdjusting(null)
        }
      />

      <ReceiveStockDialog
        item={receiving}
        open={!!receiving}
        onOpenChange={(v) =>
          !v && setReceiving(null)
        }
      />

      <ManufactureInventoryDialog
        item={manufacturing}
        open={!!manufacturing}
        onOpenChange={(open) => !open && setManufacturing(null)}
      />

      <AlertDialog
        open={importDialogOpen}
        onOpenChange={
          setImportDialogOpen
        }
      >
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excel Import Result
            </AlertDialogTitle>

            <AlertDialogDescription>
              Created: {createdCount} · Updated:{" "}
              {updatedCount} · Failed:{" "}
              {failedCount}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
            {importResults.map(
              (result, index) => (
                <div
                  key={`${result.row}-${index}`}
                  className="flex items-start justify-between gap-4 border-b border-border p-3 last:border-b-0"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {result.row > 0
                        ? `Row ${result.row}`
                        : "File"}
                    </p>

                    <p className="text-sm text-muted-foreground">
                      {result.message}
                    </p>
                  </div>

                  <span
                    className={cn(
                      "shrink-0 text-xs font-semibold uppercase",
                      result.status ===
                        "created" &&
                        "text-success",
                      result.status ===
                        "updated" &&
                        "text-blue-600",
                      result.status ===
                        "failed" &&
                        "text-destructive"
                    )}
                  >
                    {result.status}
                  </span>
                </div>
              )
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() =>
                setImportDialogOpen(false)
              }
            >
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) =>
          !v && setDeleteTarget(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.products.deleteConfirm}
            </AlertDialogTitle>

            <AlertDialogDescription>
              {t.products.deleteConfirmDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>
              {t.common.cancel}
            </AlertDialogCancel>

            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  deleteInventoryItem(
                    deleteTarget.id
                  );
                }

                setDeleteTarget(null);
              }}
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
