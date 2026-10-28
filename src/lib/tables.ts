export type DiningLocale = "ar" | "en";

/** Translate the app's built-in Arabic labels while preserving user-written names. */
export function getDiningSectionLabel(name: string, locale: DiningLocale): string {
  if (locale !== "en") return name;
  const defaultSection = name.match(/^منطقة\s*(\d+)$/u);
  return defaultSection ? `Section ${defaultSection[1]}` : name;
}

export function getDiningTableLabel(name: string, locale: DiningLocale): string {
  if (locale !== "en") return name;
  const defaultTable = name.match(/^طاولة\s*(\d+)$/u);
  return defaultTable ? `Table ${defaultTable[1]}` : name;
}

export function getDiningPosition(
  table: { position: number; positionX?: number; positionY?: number; positionXPercent?: number; positionYPercent?: number },
  index: number,
  tableCount = index + 1
) {
  const hasLegacyGrid = Number.isInteger(table.positionX) && Number.isInteger(table.positionY);
  const legacyColumn = hasLegacyGrid ? Math.max(0, Math.min(3, table.positionX!)) : index % Math.min(2, Math.max(1, tableCount));
  const legacyRow = hasLegacyGrid ? Math.max(0, table.positionY!) : Math.floor(index / Math.min(2, Math.max(1, tableCount)));
  const columns = hasLegacyGrid ? 4 : Math.min(2, Math.max(1, tableCount));
  const rows = Math.max(hasLegacyGrid ? 4 : 2, Math.ceil(tableCount / columns), legacyRow + 1);
  return {
    x: Number.isFinite(table.positionXPercent)
      ? Math.max(12, Math.min(88, table.positionXPercent!))
      : Math.max(12, Math.min(88, ((legacyColumn + 0.5) / columns) * 100)),
    y: Number.isFinite(table.positionYPercent)
      ? Math.max(14, Math.min(86, table.positionYPercent!))
      : Math.max(14, Math.min(86, ((legacyRow + 0.5) / rows) * 100)),
  };
}
