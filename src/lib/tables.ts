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

export function getDiningPosition(table: { position: number; positionX?: number; positionY?: number }, index: number) {
  return {
    x: Number.isInteger(table.positionX) ? Math.max(0, Math.min(3, table.positionX!)) : index % 4,
    y: Number.isInteger(table.positionY) ? Math.max(0, Math.min(50, table.positionY!)) : Math.floor(index / 4),
  };
}
