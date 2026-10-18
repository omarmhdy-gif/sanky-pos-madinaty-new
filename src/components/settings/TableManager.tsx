"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Utensils } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTableStore } from "@/lib/store/useTableStore";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";

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
    editingTable ? updateTable(editingTable, { name, seats: seatCount, sectionId }) : addTable({ name, seats: seatCount, sectionId });
    setTableName("");
    setSeats("4");
    setEditingTable(null);
    toast(isArabic ? "تم حفظ الطاولة" : "Table saved", "success");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Utensils className="h-5 w-5" />{isArabic ? "إعداد الصالة والطاولات" : "Dining areas and tables"}</CardTitle>
        <p className="text-sm text-muted-foreground">{isArabic ? "أنشئ أقسام الصالة، ثم أضف الطاولات لكل قسم. رتب أماكنها وابدأ الطلب من شاشة الـPOS." : "Create dining areas, add tables to each area, then arrange and open table orders in POS."}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3 rounded-xl border p-4">
          <h3 className="text-sm font-semibold">{isArabic ? "الأقسام" : "Areas"}</h3>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div><Label>{isArabic ? (editingSection ? "تعديل اسم القسم" : "اسم القسم الجديد") : (editingSection ? "Edit area name" : "New area name")}</Label><Input className="mt-1" value={sectionName} onChange={(event) => setSectionName(event.target.value)} placeholder={isArabic ? "مثال: الصالة الداخلية" : "e.g. Indoor seating"} /></div>
            <Button type="button" onClick={saveSection}><Plus className="h-4 w-4" />{editingSection ? (isArabic ? "حفظ القسم" : "Save area") : (isArabic ? "إضافة قسم" : "Add area")}</Button>
            {editingSection && <Button type="button" variant="outline" onClick={() => { setEditingSection(null); setSectionName(""); }}>{isArabic ? "إلغاء" : "Cancel"}</Button>}
          </div>
          {sections.length > 0 && <div className="flex flex-wrap gap-2">{sections.map((section) => {
            const hasTables = tables.some((table) => table.sectionId === section.id);
            return <div key={section.id} className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm"><span>{section.name}</span><Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={isArabic ? "تعديل القسم" : "Edit area"} onClick={() => { setEditingSection(section.id); setSectionName(section.name); }}><Pencil className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={hasTables} title={hasTables ? (isArabic ? "احذف الطاولات أولًا" : "Remove its tables first") : undefined} aria-label={isArabic ? "حذف القسم" : "Delete area"} onClick={() => deleteSection(section.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div>;
          })}</div>}
          {sections.length === 0 && <p className="text-xs text-muted-foreground">{isArabic ? "أضف قسمًا واحدًا على الأقل قبل إنشاء الطاولات." : "Add at least one area before creating tables."}</p>}
        </section>

        <section className="space-y-3 rounded-xl border p-4">
          <h3 className="text-sm font-semibold">{isArabic ? "الطاولات" : "Tables"}</h3>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_130px_auto] sm:items-end">
            <div><Label>{isArabic ? "اسم الطاولة" : "Table name"}</Label><Input className="mt-1" value={tableName} onChange={(event) => setTableName(event.target.value)} placeholder={isArabic ? "مثال: طاولة 1" : "e.g. Table 1"} /></div>
            <div><Label>{isArabic ? "القسم" : "Area"}</Label><select className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="">{isArabic ? "اختر القسم" : "Select an area"}</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></div>
            <div><Label>{isArabic ? "المقاعد" : "Seats"}</Label><Input className="mt-1" type="number" min="1" max="50" value={seats} onChange={(event) => setSeats(event.target.value)} /></div>
            <div className="flex gap-2"><Button type="button" disabled={sections.length === 0} onClick={saveTable}><Plus className="h-4 w-4" />{editingTable ? (isArabic ? "حفظ" : "Save") : (isArabic ? "إضافة" : "Add")}</Button>{editingTable && <Button type="button" variant="outline" onClick={() => { setEditingTable(null); setTableName(""); setSeats("4"); }}>{isArabic ? "إلغاء" : "Cancel"}</Button>}</div>
          </div>
        </section>

        {sections.map((section) => {
          const areaTables = tables.filter((table) => table.sectionId === section.id).sort((a, b) => a.position - b.position);
          return <section key={section.id} className="space-y-2"><h3 className="text-sm font-semibold">{section.name}</h3>{areaTables.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{areaTables.map((table) => <div key={table.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3"><div><p className="font-medium">{table.name}</p><p className="text-xs text-muted-foreground">{table.seats} {isArabic ? "مقاعد" : "seats"} · {occupied.includes(table.id) ? (isArabic ? "مشغولة" : "Occupied") : (isArabic ? "فاضية" : "Available")}</p></div><div className="flex gap-1"><Button type="button" variant="ghost" size="icon" disabled={occupied.includes(table.id)} aria-label={isArabic ? "تعديل الطاولة" : "Edit table"} onClick={() => { setEditingTable(table.id); setTableName(table.name); setSeats(String(table.seats)); setSectionId(table.sectionId); }}><Pencil className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" disabled={occupied.includes(table.id)} aria-label={isArabic ? "حذف الطاولة" : "Delete table"} onClick={() => deleteTable(table.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></div>)}</div> : <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{isArabic ? "لا توجد طاولات في هذا القسم" : "No tables in this area"}</p>}</section>;
        })}
      </CardContent>
    </Card>
  );
}
