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
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { Button } from "@/components/ui/button";
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
import { InventoryRow } from "@/components/inventory/InventoryRow";
import { InventoryItemFormDialog } from "@/components/inventory/InventoryItemFormDialog";
import { AdjustStockDialog } from "@/components/inventory/AdjustStockDialog";
import { ReceiveStockDialog } from "@/components/inventory/ReceiveStockDialog";
import { Input } from "@/components/ui/input";
import { useDataStore } from "@/lib/store/useDataStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useI18n, bilingual } from "@/lib/i18n";
import { formatDateTime, formatNumber, cn } from "@/lib/utils";
import { stockLevel, type StockLevel } from "@/lib/inventory";
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

const VALID_UNITS: MeasuredUnit[] = ["g", "ml", "l", "kg"];

type ImportResult = {
  row: number;
  status: "created" | "updated" | "failed";
  message: string;
};

export default function InventoryPage() {
  const { t, locale } = useI18n();

  const items = useDataStore((s) => s.inventoryItems);
  const movements = useDataStore((s) => s.stockMovements);

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

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [adjusting, setAdjusting] =
    useState<InventoryItem | null>(null);
  const [receiving, setReceiving] =
    useState<InventoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<InventoryItem | null>(null);

  const [search, setSearch] = useState("");

  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] =
    useState<ImportResult[]>([]);
  const [importDialogOpen, setImportDialogOpen] =
    useState(false);

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
        formulae: ['"g,ml,l,kg"'],
        showErrorMessage: true,
        errorTitle: "Invalid Unit",
        error:
          "Please select g, ml, l or kg.",
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
                `Invalid Unit "${unitValue}". Use g, ml, l or kg.`
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

            await updateInventoryItem(
              id,
              {
                name: {
                  en: nameEn,
                  ar: nameAr,
                },
                type,
                unit,
                quantity,
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
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setReceiving(item)
              }
            >
              <PackagePlus className="h-3.5 w-3.5" />
              {t.receiveStock.receiveButton}
            </Button>

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

              <Button
                variant="outline"
                size="sm"
                onClick={
                  handleDownloadTemplate
                }
              >
                <FileDown className="h-3.5 w-3.5" />
                Download Template
              </Button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={
                  handleImportExcel
                }
              />

              <Button
                variant="outline"
                size="sm"
                disabled={importing}
                onClick={() =>
                  fileInputRef.current?.click()
                }
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
            </TabsList>

            <TabsContent value="stock">
              {currentStockList}
            </TabsContent>

            <TabsContent value="history">
              {historyList}
            </TabsContent>
          </Tabs>
        ) : (
          currentStockList
        )}
      </div>

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