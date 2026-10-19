"use client";

import { useEffect, useMemo, useState } from "react";
import { Grip, Pencil, Plus, Save, Trash2, Utensils, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTableStore, type DiningTable } from "@/lib/store/useTableStore";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { getDiningPosition, getDiningSectionLabel, getDiningTableLabel } from "@/lib/tables";

type Position = { x: number; y: number };
const GRID_COLUMNS = 4;

function sortedSectionTables(tables: DiningTable[], sectionId: string) {
  return tables.filter((table) => table.sectionId === sectionId).sort((a, b) => a.position - b.position);
}

export function TableManager() {
  const { locale } = useI18n();
  const isArabic = locale === "ar";
  const sections = useTableStore((state) => state.sections);
  const tables = useTableStore((state) => state.tables);
  const occupied = useTableStore((state) => state.occupiedTableIds);
  const addSection = useTableStore((state) => state.addSection);
  const updateSection = useTableStore((state) => state.updateSection);
  const deleteSection = useTableStore((state) => state.deleteSection);
  const addTable = useTableStore((state) => state.addTable);
  const updateTable = useTableStore((state) => state.updateTable);
  const deleteTable = useTableStore((state) => state.deleteTable);
  const [sectionName, setSectionName] = useState("");
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [tableName, setTableName] = useState("");
  const [seats, setSeats] = useState("4");
  const [sectionId, setSectionId] = useState("");
  const [editingTable, setEditingTable] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState("");
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [draftPositions, setDraftPositions] = useState<Record<string, Position>>({});

  useEffect(() => {
    if (!activeSectionId || !sections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId(sections[0]?.id ?? "");
    }
  }, [activeSectionId, sections]);

  const activeTables = useMemo(() => sortedSectionTables(tables, activeSectionId), [activeSectionId, tables]);
  const visiblePositions = useMemo(() => Object.fromEntries(activeTables.map((table, index) => [table.id, getDiningPosition(table, index)])), [activeTables]);
  const positions = layoutEditing ? draftPositions : visiblePositions;
  const rows = Math.max(4, ...Object.values(positions).map((position) => position.y + (layoutEditing ? 2 : 1)));

  const saveSection = () => {
    const name = sectionName.trim();
    if (!name) return;
    if (sections.some((section) => section.name.toLocaleLowerCase() === name.toLocaleLowerCase() && section.id !== editingSection)) {
      toast(isArabic ? "اسم القسم موجود بالفعل" : "That section name already exists", "error");
      return;
    }
    editingSection ? updateSection(editingSection, name) : addSection(name);
    setSectionName("");
    setEditingSection(null);
    toast(isArabic ? "تم حفظ القسم" : "Section saved", "success");
  };

  const saveTable = () => {
    const name = tableName.trim();
    const seatCount = Number(seats);
    if (!sectionId || !name || !Number.isInteger(seatCount) || seatCount < 1 || seatCount > 50) {
      toast(isArabic ? "اختر قسمًا وأدخل اسم الطاولة وعدد مقاعد صحيح" : "Choose a section and enter a table name and valid seat count", "error");
      return;
    }
    if (tables.some((table) => table.name.toLocaleLowerCase() === name.toLocaleLowerCase() && table.id !== editingTable)) {
      toast(isArabic ? "اسم الطاولة مستخدم بالفعل" : "That table name is already in use", "error");
      return;
    }
    if (editingTable) {
      const existing = tables.find((table) => table.id === editingTable);
      if (existing && existing.sectionId !== sectionId) {
        const nextPosition = tables.filter((table) => table.sectionId === sectionId).length;
        updateTable(editingTable, { name, seats: seatCount, sectionId, position: nextPosition, positionX: nextPosition % GRID_COLUMNS, positionY: Math.floor(nextPosition / GRID_COLUMNS) });
      } else {
        updateTable(editingTable, { name, seats: seatCount, sectionId });
      }
    } else {
      addTable({ name, seats: seatCount, sectionId });
    }
    setTableName("");
    setSeats("4");
    setEditingTable(null);
    toast(isArabic ? "تم حفظ الطاولة" : "Table saved", "success");
  };

  const startLayoutEdit = () => {
    setDraftPositions(Object.fromEntries(activeTables.map((table, index) => [table.id, getDiningPosition(table, index)])));
    setLayoutEditing(true);
    setSelectedTableId(null);
  };

  const cancelLayoutEdit = () => {
    setLayoutEditing(false);
    setDraggingTableId(null);
    setSelectedTableId(null);
    setDraftPositions({});
  };

  const saveLayout = () => {
    for (const table of activeTables) {
      const position = draftPositions[table.id];
      if (!position) continue;
      updateTable(table.id, { positionX: position.x, positionY: position.y, position: position.y * GRID_COLUMNS + position.x });
    }
    setLayoutEditing(false);
    setDraggingTableId(null);
    setSelectedTableId(null);
    setDraftPositions({});
    toast(isArabic ? "تم حفظ ترتيب الطاولات" : "Table layout saved", "success");
  };

  const moveDraftTable = (tableId: string, target: Position) => {
    setDraftPositions((current) => {
      const source = current[tableId];
      if (!source || (source.x === target.x && source.y === target.y)) return current;
      const other = activeTables.find((table) => table.id !== tableId && current[table.id]?.x === target.x && current[table.id]?.y === target.y);
      const next = { ...current, [tableId]: target };
      if (other) next[other.id] = source;
      return next;
    });
  };

  const selectOrPlaceTable = (table: DiningTable | undefined, target: Position) => {
    if (!layoutEditing) return;
    if (!table) {
      if (selectedTableId) moveDraftTable(selectedTableId, target);
      setSelectedTableId(null);
      return;
    }
    if (!selectedTableId) setSelectedTableId(table.id);
    else if (selectedTableId === table.id) setSelectedTableId(null);
    else { moveDraftTable(selectedTableId, target); setSelectedTableId(null); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Utensils className="h-5 w-5" />{isArabic ? "إعداد الصالة والطاولات" : "Dining sections and tables"}</CardTitle>
        <p className="text-sm text-muted-foreground">{isArabic ? "أنشئ أقسام الصالة وطاولاتها، ثم رتّبها على مخطط الصالة واحفظ الشكل الذي تريده." : "Create sections and tables, arrange them on the floor plan, then save the layout you want."}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3 rounded-xl border p-4">
          <h3 className="text-sm font-semibold">{isArabic ? "الأقسام" : "Sections"}</h3>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div><Label>{isArabic ? (editingSection ? "تعديل اسم القسم" : "اسم القسم الجديد") : (editingSection ? "Edit section name" : "New section name")}</Label><Input disabled={layoutEditing} className="mt-1" value={sectionName} onChange={(event) => setSectionName(event.target.value)} placeholder={isArabic ? "مثال: الصالة الداخلية" : "e.g. Main Hall"} /></div>
            <Button type="button" disabled={layoutEditing} onClick={saveSection}><Plus className="h-4 w-4" />{editingSection ? (isArabic ? "حفظ القسم" : "Save section") : (isArabic ? "إضافة قسم" : "Add section")}</Button>
            {editingSection && <Button type="button" variant="outline" disabled={layoutEditing} onClick={() => { setEditingSection(null); setSectionName(""); }}>{isArabic ? "إلغاء" : "Cancel"}</Button>}
          </div>
          {sections.length > 0 && <div className="flex flex-wrap gap-2">{sections.map((section) => {
            const hasTables = tables.some((table) => table.sectionId === section.id);
            return <div key={section.id} className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm"><span>{getDiningSectionLabel(section.name, locale)}</span><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={layoutEditing} aria-label={isArabic ? "تعديل القسم" : "Edit section"} onClick={() => { setEditingSection(section.id); setSectionName(section.name); }}><Pencil className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={hasTables || layoutEditing} title={hasTables ? (isArabic ? "احذف الطاولات أولًا" : "Remove its tables first") : undefined} aria-label={isArabic ? "حذف القسم" : "Delete section"} onClick={() => deleteSection(section.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div>;
          })}</div>}
          {sections.length === 0 && <p className="text-xs text-muted-foreground">{isArabic ? "أضف قسمًا واحدًا على الأقل قبل إنشاء الطاولات." : "Add at least one section before creating tables."}</p>}
        </section>

        <section className="space-y-3 rounded-xl border p-4">
          <h3 className="text-sm font-semibold">{isArabic ? "الطاولات" : "Tables"}</h3>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_130px_auto] sm:items-end">
            <div><Label>{isArabic ? "اسم الطاولة" : "Table"}</Label><Input className="mt-1" value={tableName} onChange={(event) => setTableName(event.target.value)} placeholder={isArabic ? "مثال: طاولة 1" : "e.g. Table 1"} /></div>
            <div><Label>{isArabic ? "القسم" : "Section"}</Label><select className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="">{isArabic ? "اختر القسم" : "Select a section"}</option>{sections.map((section) => <option key={section.id} value={section.id}>{getDiningSectionLabel(section.name, locale)}</option>)}</select></div>
            <div><Label>{isArabic ? "المقاعد" : "Seats"}</Label><Input className="mt-1" type="number" min="1" max="50" value={seats} onChange={(event) => setSeats(event.target.value)} /></div>
            <div className="flex gap-2"><Button type="button" disabled={sections.length === 0 || layoutEditing} onClick={saveTable}><Plus className="h-4 w-4" />{editingTable ? (isArabic ? "حفظ" : "Save") : (isArabic ? "إضافة" : "Add")}</Button>{editingTable && <Button type="button" variant="outline" onClick={() => { setEditingTable(null); setTableName(""); setSeats("4"); }}>{isArabic ? "إلغاء" : "Cancel"}</Button>}</div>
          </div>
        </section>

        {sections.length > 0 && <section className="space-y-4 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-semibold">{isArabic ? "مخطط الطاولات" : "Table layout"}</h3><p className="mt-1 text-xs text-muted-foreground">{layoutEditing ? (isArabic ? "اسحب الطاولة أو اضغط عليها ثم اضغط المكان الفارغ. يمكنك ترك مسافات أو تبديل الطاولات." : "Drag a table, or tap it and then tap an empty space. Leave gaps or swap tables.") : (isArabic ? "الخانات الفارغة توضح المساحة بين الطاولات." : "Empty spaces show the room between tables.")}</p></div>
            {layoutEditing ? <div className="flex gap-2"><Button type="button" variant="outline" onClick={cancelLayoutEdit}><X className="h-4 w-4" />{isArabic ? "إلغاء" : "Cancel"}</Button><Button type="button" onClick={saveLayout}><Save className="h-4 w-4" />{isArabic ? "حفظ الترتيب" : "Save layout"}</Button></div> : <Button type="button" variant="outline" onClick={startLayoutEdit} disabled={!activeSectionId}><Pencil className="h-4 w-4" />{isArabic ? "تعديل الترتيب" : "Edit layout"}</Button>}
          </div>

          <div className="flex flex-wrap gap-2 border-b pb-3">{sections.map((section) => <Button key={section.id} type="button" variant={activeSectionId === section.id ? "default" : "outline"} size="sm" disabled={layoutEditing} onClick={() => setActiveSectionId(section.id)}>{getDiningSectionLabel(section.name, locale)}<span className="ms-1 opacity-75">{tables.filter((table) => table.sectionId === section.id).length}</span></Button>)}</div>

          {activeSectionId && <div className="max-h-[65vh] overflow-auto rounded-2xl border border-dashed bg-muted/20 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2"><h4 className="font-medium">{getDiningSectionLabel(sections.find((section) => section.id === activeSectionId)?.name ?? "", locale)}</h4><span className="text-xs text-muted-foreground">{activeTables.length} {isArabic ? "طاولات" : "tables"}</span></div>
            <div className="grid min-w-[440px] grid-cols-4 gap-2 sm:gap-3">
              {Array.from({ length: rows * GRID_COLUMNS }, (_, cellIndex) => {
                const target = { x: cellIndex % GRID_COLUMNS, y: Math.floor(cellIndex / GRID_COLUMNS) };
                const table = activeTables.find((item) => positions[item.id]?.x === target.x && positions[item.id]?.y === target.y);
                return <div key={`${target.x}-${target.y}`} role={layoutEditing ? "button" : undefined} tabIndex={layoutEditing ? 0 : undefined} aria-label={layoutEditing ? table ? `${getDiningTableLabel(table.name, locale)}, ${isArabic ? "اختيار لنقلها" : "select to move"}` : (isArabic ? "مساحة فارغة" : "Empty space") : undefined} onClick={() => selectOrPlaceTable(table, target)} onKeyDown={(event) => {
                  if (layoutEditing && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    selectOrPlaceTable(table, target);
                  }
                }} onDragOver={(event) => { if (layoutEditing) event.preventDefault(); }} onDrop={(event) => {
                  event.preventDefault();
                  if (layoutEditing && draggingTableId) moveDraftTable(draggingTableId, target);
                  setDraggingTableId(null);
                  setSelectedTableId(null);
                }} className={`relative flex aspect-square min-h-24 items-center justify-center rounded-xl border p-2 transition sm:rounded-2xl ${table ? "border-border bg-card shadow-sm" : layoutEditing ? "border-dashed border-primary/35 bg-background/45" : "border-dashed border-border/50 bg-background/20"} ${layoutEditing ? "cursor-pointer hover:border-primary/70 hover:bg-primary/5" : ""} ${table && draggingTableId === table.id ? "opacity-40" : ""} ${table && selectedTableId === table.id ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}>
                  {table ? <>
                    {layoutEditing && <span className="absolute start-2 top-2 text-muted-foreground"><Grip className="h-4 w-4" /></span>}
                    <div draggable={layoutEditing} onDragStart={() => { setDraggingTableId(table.id); setSelectedTableId(null); }} onDragEnd={() => setDraggingTableId(null)} className={`flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg text-center ${layoutEditing ? "cursor-grab active:cursor-grabbing" : ""}`}>
                      <Utensils className="h-5 w-5 text-primary" />
                      <span className="line-clamp-2 text-sm font-semibold">{getDiningTableLabel(table.name, locale)}</span>
                      <span className="text-[11px] text-muted-foreground">{table.seats} {isArabic ? "مقاعد" : "seats"}</span>
                    </div>
                    {!layoutEditing && <div className="absolute end-1 top-1 flex gap-0.5"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={occupied.includes(table.id)} aria-label={isArabic ? "تعديل الطاولة" : "Edit table"} onClick={() => { setEditingTable(table.id); setTableName(table.name); setSeats(String(table.seats)); setSectionId(table.sectionId); }}><Pencil className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={occupied.includes(table.id)} aria-label={isArabic ? "حذف الطاولة" : "Delete table"} onClick={() => deleteTable(table.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div>}
                  </> : layoutEditing ? <span className="text-center text-[11px] text-muted-foreground">{selectedTableId ? (isArabic ? "اضغط لوضع الطاولة هنا" : "Tap to place table") : (isArabic ? "مساحة فارغة" : "Empty space")}</span> : null}
                </div>;
              })}
            </div>
            {activeTables.length === 0 && <p className="mt-3 text-center text-sm text-muted-foreground">{isArabic ? "أضف طاولات لهذا القسم لتظهر في المخطط." : "Add tables to this section to see them on the floor plan."}</p>}
          </div>}
        </section>}
      </CardContent>
    </Card>
  );
}
