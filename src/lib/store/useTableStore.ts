import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CartLine } from "@/lib/types";
import { getSafeStorage } from "@/lib/store/storage";
import { genId } from "@/lib/utils";

export interface DiningSection {
  id: string;
  name: string;
}

export interface DiningTable {
  id: string;
  sectionId: string;
  name: string;
  seats: number;
  position: number;
}

export interface TableOrderDraft {
  lines: CartLine[];
  discountPercent: number;
  discountFixedAmount: number;
  promoCode?: string;
  customerName?: string;
  customerId?: string;
  updatedAt: string;
}

interface TableStore {
  sections: DiningSection[];
  tables: DiningTable[];
  occupiedTableIds: string[];
  tableOrders: Record<string, TableOrderDraft>;
  applyRemoteLayout: (layout: { sections: DiningSection[]; tables: DiningTable[] }) => void;
  addSection: (name: string) => void;
  updateSection: (id: string, name: string) => void;
  deleteSection: (id: string) => void;
  addTable: (input: Omit<DiningTable, "id" | "position">) => void;
  updateTable: (id: string, patch: Partial<Omit<DiningTable, "id">>) => void;
  deleteTable: (id: string) => void;
  moveTable: (id: string, sectionId: string, position: number) => void;
  occupyTable: (id: string) => void;
  releaseTable: (id: string) => void;
  saveTableOrder: (id: string, draft: Omit<TableOrderDraft, "updatedAt">) => void;
  clearTableOrder: (id: string) => void;
}

const DEFAULT_SECTIONS: DiningSection[] = [
  { id: "main-hall", name: "منطقة 1" },
  { id: "second-area", name: "منطقة 2" },
];
const DEFAULT_TABLES: DiningTable[] = DEFAULT_SECTIONS.flatMap((section, sectionIndex) =>
  Array.from({ length: 4 }, (_, tableIndex) => ({
    id: `table-${sectionIndex + 1}-${tableIndex + 1}`,
    sectionId: section.id,
    name: `طاولة ${tableIndex + 1}`,
    seats: 4,
    position: tableIndex,
  }))
);

export const useTableStore = create<TableStore>()(
  persist(
    (set) => ({
      sections: DEFAULT_SECTIONS,
      tables: DEFAULT_TABLES,
      occupiedTableIds: [],
      tableOrders: {},
      applyRemoteLayout: (layout) => set((state) => {
        const tableIds = new Set(layout.tables.map((table) => table.id));
        return {
          sections: layout.sections,
          tables: layout.tables,
          occupiedTableIds: state.occupiedTableIds.filter((id) => tableIds.has(id)),
          tableOrders: Object.fromEntries(Object.entries(state.tableOrders).filter(([id]) => tableIds.has(id))),
        };
      }),
      addSection: (name) => set((state) => ({ sections: [...state.sections, { id: genId("section"), name }] })),
      updateSection: (id, name) => set((state) => ({ sections: state.sections.map((section) => section.id === id ? { ...section, name } : section) })),
      deleteSection: (id) => set((state) => ({ sections: state.sections.filter((section) => section.id !== id) })),
      addTable: (input) => set((state) => ({
        tables: [...state.tables, { ...input, id: genId("table"), position: state.tables.filter((table) => table.sectionId === input.sectionId).length }],
      })),
      updateTable: (id, patch) => set((state) => ({ tables: state.tables.map((table) => table.id === id ? { ...table, ...patch } : table) })),
      deleteTable: (id) => set((state) => {
        const tableOrders = { ...state.tableOrders };
        delete tableOrders[id];
        return { tables: state.tables.filter((table) => table.id !== id), occupiedTableIds: state.occupiedTableIds.filter((tableId) => tableId !== id), tableOrders };
      }),
      moveTable: (id, sectionId, position) => set((state) => {
        const dragged = state.tables.find((table) => table.id === id);
        if (!dragged) return state;
        if (dragged.sectionId === sectionId) {
          const area = state.tables.filter((table) => table.sectionId === sectionId).sort((a, b) => a.position - b.position);
          const [moving] = area.splice(area.findIndex((table) => table.id === id), 1);
          area.splice(Math.max(0, Math.min(position, area.length)), 0, moving);
          return { tables: state.tables.map((table) => {
            const nextPosition = area.findIndex((item) => item.id === table.id);
            return table.sectionId === sectionId && nextPosition >= 0 ? { ...table, position: nextPosition } : table;
          }) };
        }
        const source = state.tables.filter((table) => table.sectionId === dragged.sectionId && table.id !== id).sort((a, b) => a.position - b.position);
        const target = state.tables.filter((table) => table.sectionId === sectionId).sort((a, b) => a.position - b.position);
        target.splice(Math.max(0, Math.min(position, target.length)), 0, { ...dragged, sectionId });
        const normalized = [...source.map((table, index) => ({ ...table, position: index })), ...target.map((table, index) => ({ ...table, sectionId, position: index }))];
        const changedIds = new Set(normalized.map((table) => table.id));
        return { tables: [...state.tables.filter((table) => !changedIds.has(table.id)), ...normalized] };
      }),
      occupyTable: (id) => set((state) => ({ occupiedTableIds: state.occupiedTableIds.includes(id) ? state.occupiedTableIds : [...state.occupiedTableIds, id] })),
      releaseTable: (id) => set((state) => ({ occupiedTableIds: state.occupiedTableIds.filter((tableId) => tableId !== id) })),
      saveTableOrder: (id, draft) => set((state) => ({ tableOrders: { ...state.tableOrders, [id]: { ...draft, updatedAt: new Date().toISOString() } } })),
      clearTableOrder: (id) => set((state) => {
        const tableOrders = { ...state.tableOrders };
        delete tableOrders[id];
        return { tableOrders };
      }),
    }),
    {
      name: "sanky-pos-dining-tables",
      version: 3,
      storage: createJSONStorage(getSafeStorage),
      migrate: (persisted: any, version) => {
        if (!persisted) return persisted as TableStore;
        if (version < 2) {
          const tables: DiningTable[] = (persisted.tables ?? []).map((table: any, index: number) => ({ ...table, sectionId: "main-hall", position: index }));
          const sections = tables.length ? [{ id: "main-hall", name: "Main Hall" }] : DEFAULT_SECTIONS;
          return { ...persisted, sections, tables: tables.length ? tables : DEFAULT_TABLES, tableOrders: persisted.tableOrders ?? {} } as TableStore;
        }
        if (version < 3 && (!persisted.sections?.length || !persisted.tables?.length)) {
          return { ...persisted, sections: DEFAULT_SECTIONS, tables: DEFAULT_TABLES, tableOrders: persisted.tableOrders ?? {} } as TableStore;
        }
        return persisted as TableStore;
      },
    }
  )
);
