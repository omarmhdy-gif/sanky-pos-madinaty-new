"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
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
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [tableName, setTableName] = useState("");
  const [seats, setSeats] = useState("4");
  const [sectionId, setSectionId] = useState("");
  const [editingTable, setEditingTable] = useState<string | null>(null);
  const [showTableForm, setShowTableForm] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState("");
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null);
  const [draftPositions, setDraftPositions] = useState<Record<string, Position>>({});
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeSectionId || !sections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId(sections[0]?.id ?? "");
    }
  }, [activeSectionId, sections]);

  const activeTables = useMemo(() => sortedSectionTables(tables, activeSectionId), [activeSectionId, tables]);
  const visiblePositions = useMemo(() => Object.fromEntries(activeTables.map((table, index) => [table.id, getDiningPosition(table, index, activeTables.length)])), [activeTables]);
  const positions = layoutEditing ? draftPositions : visiblePositions;

  const saveSection = () => {
    const name = sectionName.trim();
    if (!name) return;
    if (sections.some((section) => section.name.toLocaleLowerCase() === name.toLocaleLowerCase() && section.id !== editingSection)) {
      toast(isArabic ? "اسم القسم موجود بالفعل" : "That section name already exists", "error");
      return;
    }
    if (editingSection) updateSection(editingSection, name);
    else {
      addSection(name);
      const created = useTableStore.getState().sections.at(-1);
      if (created) setActiveSectionId(created.id);
    }
    setSectionName("");
    setEditingSection(null);
    setShowSectionForm(false);
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
        updateTable(editingTable, { name, seats: seatCount, sectionId, position: nextPosition, positionX: undefined, positionY: undefined, positionXPercent: undefined, positionYPercent: undefined });
      } else {
        updateTable(editingTable, { name, seats: seatCount, sectionId });
      }
    } else {
      addTable({ name, seats: seatCount, sectionId });
    }
    setTableName("");
    setSeats("4");
    setEditingTable(null);
    setShowTableForm(false);
    toast(isArabic ? "تم حفظ الطاولة" : "Table saved", "success");
  };

  const startLayoutEdit = () => {
    setDraftPositions(Object.fromEntries(activeTables.map((table, index) => [table.id, getDiningPosition(table, index, activeTables.length)])));
    setLayoutEditing(true);
  };

  const cancelLayoutEdit = () => {
    setLayoutEditing(false);
    setDraggingTableId(null);
    setDraftPositions({});
  };

  const saveLayout = () => {
    for (const table of activeTables) {
      const position = draftPositions[table.id];
      if (!position) continue;
      updateTable(table.id, { positionXPercent: position.x, positionYPercent: position.y });
    }
    setLayoutEditing(false);
    setDraggingTableId(null);
    setDraftPositions({});
    toast(isArabic ? "تم حفظ ترتيب الطاولات" : "Table layout saved", "success");
  };

  const moveTableOnCanvas = (event: PointerEvent<HTMLDivElement>, tableId: string) => {
    if (!layoutEditing || draggingTableId !== tableId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(12, Math.min(88, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(14, Math.min(86, ((event.clientY - rect.top) / rect.height) * 100));
    setDraftPositions((current) => ({ ...current, [tableId]: { x, y } }));
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
          <div className="flex flex-wrap items-center gap-2">{sections.map((section) => {
            const hasTables = tables.some((table) => table.sectionId === section.id);
            return <div key={section.id} className={`flex items-center gap-1 rounded-xl border px-3 py-2 text-sm ${activeSectionId === section.id ? "border-primary/50 bg-primary/10" : "bg-card"}`}><button type="button" className="font-medium" onClick={() => setActiveSectionId(section.id)}>{getDiningSectionLabel(section.name, locale)}</button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={layoutEditing} aria-label={isArabic ? "تعديل القسم" : "Edit section"} onClick={() => { setEditingSection(section.id); setSectionName(section.name); setShowSectionForm(true); }}><Pencil className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={hasTables || layoutEditing} title={hasTables ? (isArabic ? "احذف الطاولات أولًا" : "Remove its tables first") : undefined} aria-label={isArabic ? "حذف القسم" : "Delete section"} onClick={() => deleteSection(section.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div>;
          })}
            <Button type="button" variant="outline" disabled={layoutEditing} onClick={() => { setEditingSection(null); setSectionName(""); setShowSectionForm(true); }}><Plus className="h-4 w-4" />{isArabic ? "إضافة قسم" : "Add section"}</Button>
          </div>
          {(showSectionForm || editingSection) && <div className="grid gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div><Label>{isArabic ? (editingSection ? "تعديل اسم القسم" : "اسم القسم") : (editingSection ? "Edit section name" : "Section name")}</Label><Input autoFocus className="mt-1" value={sectionName} onChange={(event) => setSectionName(event.target.value)} /></div>
            <Button type="button" disabled={layoutEditing || !sectionName.trim()} onClick={saveSection}><Save className="h-4 w-4" />{editingSection ? (isArabic ? "حفظ" : "Save") : (isArabic ? "إنشاء القسم" : "Create section")}</Button>
            <Button type="button" variant="outline" disabled={layoutEditing} onClick={() => { setEditingSection(null); setSectionName(""); setShowSectionForm(false); }}>{isArabic ? "إلغاء" : "Cancel"}</Button>
          </div>}
          {sections.length === 0 && <p className="text-xs text-muted-foreground">{isArabic ? "أضف قسمًا واحدًا على الأقل قبل إنشاء الطاولات." : "Add at least one section before creating tables."}</p>}
        </section>

        <section className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{isArabic ? "الطاولات" : "Tables"}</h3><Button type="button" variant="outline" disabled={sections.length === 0 || layoutEditing} onClick={() => { setSectionId(activeSectionId || sections[0]?.id || ""); setShowTableForm(true); }}><Plus className="h-4 w-4" />{isArabic ? "إضافة طاولة" : "Add table"}</Button></div>
          {(showTableForm || editingTable) && <div className="grid gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-[1fr_1fr_130px_auto] sm:items-end">
            <div><Label>{isArabic ? "اسم الطاولة" : "Table name"}</Label><Input autoFocus className="mt-1" value={tableName} onChange={(event) => setTableName(event.target.value)} /></div>
            <div><Label>{isArabic ? "القسم" : "Section"}</Label><select className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="">{isArabic ? "اختر القسم" : "Select a section"}</option>{sections.map((section) => <option key={section.id} value={section.id}>{getDiningSectionLabel(section.name, locale)}</option>)}</select></div>
            <div><Label>{isArabic ? "المقاعد" : "Seats"}</Label><Input className="mt-1" type="number" min="1" max="50" value={seats} onChange={(event) => setSeats(event.target.value)} /></div>
            <div className="flex gap-2"><Button type="button" disabled={sections.length === 0 || layoutEditing || !tableName.trim()} onClick={saveTable}><Save className="h-4 w-4" />{editingTable ? (isArabic ? "حفظ" : "Save") : (isArabic ? "إنشاء الطاولة" : "Create table")}</Button><Button type="button" variant="outline" onClick={() => { setEditingTable(null); setTableName(""); setSeats("4"); setShowTableForm(false); }}>{isArabic ? "إلغاء" : "Cancel"}</Button></div>
          </div>}
        </section>

        {sections.length > 0 && <section className="space-y-4 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-semibold">{isArabic ? "مخطط الطاولات" : "Table layout"}</h3><p className="mt-1 text-xs text-muted-foreground">{layoutEditing ? (isArabic ? "اسحب كل طاولة بحرية للمكان الذي تريده، ثم احفظ الترتيب." : "Drag each table anywhere on the floor, then save your layout.") : (isArabic ? "عرض حر للطاولات داخل مساحة الصالة." : "Arrange tables freely across the dining area.")}</p></div>
            {layoutEditing ? <div className="flex gap-2"><Button type="button" variant="outline" onClick={cancelLayoutEdit}><X className="h-4 w-4" />{isArabic ? "إلغاء" : "Cancel"}</Button><Button type="button" onClick={saveLayout}><Save className="h-4 w-4" />{isArabic ? "حفظ الترتيب" : "Save layout"}</Button></div> : <Button type="button" variant="outline" onClick={startLayoutEdit} disabled={!activeSectionId}><Pencil className="h-4 w-4" />{isArabic ? "تعديل الترتيب" : "Edit layout"}</Button>}
          </div>

          <div className="flex flex-wrap gap-2 border-b pb-3">{sections.map((section) => <Button key={section.id} type="button" variant={activeSectionId === section.id ? "default" : "outline"} size="sm" disabled={layoutEditing} onClick={() => setActiveSectionId(section.id)}>{getDiningSectionLabel(section.name, locale)}<span className="ms-1 opacity-75">{tables.filter((table) => table.sectionId === section.id).length}</span></Button>)}</div>

          {activeSectionId && <div className="rounded-2xl border bg-muted/10 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2"><h4 className="font-medium">{getDiningSectionLabel(sections.find((section) => section.id === activeSectionId)?.name ?? "", locale)}</h4><span className="text-xs text-muted-foreground">{activeTables.length} {isArabic ? "طاولات" : "tables"}</span></div>
            <div ref={canvasRef} className="relative h-[460px] overflow-hidden rounded-xl border border-dashed border-border/80 bg-background/60 sm:h-[540px]">
              {activeTables.map((table) => {
                const position = positions[table.id] ?? getDiningPosition(table, 0, activeTables.length);
                return <div key={table.id} role={layoutEditing ? "button" : undefined} aria-label={`${getDiningTableLabel(table.name, locale)}${layoutEditing ? (isArabic ? "، اسحب لتغيير المكان" : ", drag to reposition") : ""}`} tabIndex={layoutEditing ? 0 : undefined} onPointerDown={(event) => {
                  if (!layoutEditing) return;
                  event.preventDefault();
                  setDraggingTableId(table.id);
                  event.currentTarget.setPointerCapture(event.pointerId);
                }} onPointerMove={(event) => moveTableOnCanvas(event, table.id)} onPointerUp={() => setDraggingTableId(null)} onPointerCancel={() => setDraggingTableId(null)} onKeyDown={(event) => {
                  if (!layoutEditing || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
                  event.preventDefault();
                  const delta = event.shiftKey ? 5 : 1;
                  setDraftPositions((current) => ({ ...current, [table.id]: {
                    x: Math.max(12, Math.min(88, (current[table.id]?.x ?? position.x) + (event.key === "ArrowLeft" ? -delta : event.key === "ArrowRight" ? delta : 0))),
                    y: Math.max(14, Math.min(86, (current[table.id]?.y ?? position.y) + (event.key === "ArrowUp" ? -delta : event.key === "ArrowDown" ? delta : 0))),
                  } }));
                }} style={{ left: `${position.x}%`, top: `${position.y}%`, transform: "translate(-50%, -50%)" }} className={`absolute flex h-28 w-[min(150px,23vw)] select-none flex-col items-center justify-center gap-1 rounded-2xl border bg-card px-3 py-3 text-center shadow-md transition-shadow ${layoutEditing ? "touch-none cursor-grab border-primary/45 hover:shadow-lg active:cursor-grabbing" : ""} ${draggingTableId === table.id ? "z-10 ring-2 ring-primary" : ""}`}>
                  {layoutEditing && <Grip className="absolute start-2 top-2 h-4 w-4 text-muted-foreground" />}
                  <Utensils className="h-5 w-5 text-primary" />
                  <span className="line-clamp-2 text-sm font-semibold">{getDiningTableLabel(table.name, locale)}</span>
                  <span className="text-[11px] text-muted-foreground">{table.seats} {isArabic ? "مقاعد" : "seats"}</span>
                  {!layoutEditing && <div className="absolute end-1 top-1 flex gap-0.5"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={occupied.includes(table.id)} aria-label={isArabic ? "تعديل الطاولة" : "Edit table"} onClick={() => { setEditingTable(table.id); setTableName(table.name); setSeats(String(table.seats)); setSectionId(table.sectionId); setShowTableForm(true); }}><Pencil className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={occupied.includes(table.id)} aria-label={isArabic ? "حذف الطاولة" : "Delete table"} onClick={() => deleteTable(table.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div>}
                </div>;
              })}
              {activeTables.length === 0 && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">{isArabic ? "المساحة جاهزة. أضف طاولات لهذا القسم لتظهر هنا." : "The floor is ready. Add tables to this section to place them here."}</div>}
            </div>
          </div>}
        </section>}
      </CardContent>
    </Card>
  );
}
