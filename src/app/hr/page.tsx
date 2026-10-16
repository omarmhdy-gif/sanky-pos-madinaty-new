"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useI18n } from "@/lib/i18n";
import * as api from "@/lib/supabase/api";
import type { HrDeduction, HrEmployee, HrPayrollEntry } from "@/lib/types";
import { BriefcaseBusiness, CalendarDays, CircleDollarSign, LockKeyhole, Plus, RefreshCw, UserRound, Wallet } from "lucide-react";

type EmployeeForm = { id?: string; name: string; pin: string; phone: string; jobTitle: string; hireDate: string; monthlySalary: string; isActive: boolean };
const blankEmployee = (): EmployeeForm => ({ name: "", pin: "", phone: "", jobTitle: "", hireDate: "", monthlySalary: "", isActive: true });
const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function HrPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const currentUser = useAuthStore((s) => s.currentUser);
  const branchId = useBranchStore((s) => s.currentBranchId);
  const [token, setToken] = useState("");
  const [pin, setPin] = useState("");
  const [tab, setTab] = useState<"employees" | "payroll">("employees");
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [payroll, setPayroll] = useState<HrPayrollEntry[]>([]);
  const [month, setMonth] = useState(currentMonth());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [employeeDialog, setEmployeeDialog] = useState(false);
  const [employeeForm, setEmployeeForm] = useState<EmployeeForm>(blankEmployee());
  const [deductionTarget, setDeductionTarget] = useState<HrPayrollEntry | null>(null);
  const [deductions, setDeductions] = useState<HrDeduction[]>([]);
  const [note, setNote] = useState("");

  const text = (en: string, arabic: string) => ar ? arabic : en;
  const currency = useMemo(() => new Intl.NumberFormat(ar ? "ar-EG" : "en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }), [ar]);
  const totals = useMemo(() => payroll.reduce((sum, row) => ({ salary: sum.salary + row.baseSalary, deduction: sum.deduction + row.totalDeductions, net: sum.net + row.netSalary }), { salary: 0, deduction: 0, net: 0 }), [payroll]);

  async function loadEmployees(activeToken = token) {
    if (!branchId || !activeToken) return;
    const rows = await api.listHrEmployees(branchId, activeToken);
    setEmployees(rows);
  }
  async function loadPayroll(activeToken = token, activeMonth = month) {
    if (!branchId || !activeToken) return;
    setPayroll(await api.listHrPayroll(branchId, activeToken, activeMonth));
  }
  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    if (!branchId) return;
    setBusy(true); setError("");
    try {
      const newToken = await api.createHrSession(branchId, pin);
      setToken(newToken); setPin("");
      await loadEmployees(newToken);
    } catch (e) { setError(e instanceof Error ? e.message : text("Could not verify PIN", "تعذر التحقق من الرقم السري")); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!token || !branchId || tab !== "payroll") return;
    setBusy(true); setError("");
    loadPayroll().catch((e) => { setError(e instanceof Error ? e.message : String(e)); if (/session|owner pin/i.test(String(e))) setToken(""); }).finally(() => setBusy(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, tab, token, branchId]);

  async function refresh() {
    setBusy(true); setError("");
    try { if (tab === "employees") await loadEmployees(); else await loadPayroll(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); if (/session|owner pin/i.test(String(e))) setToken(""); }
    finally { setBusy(false); }
  }
  async function saveEmployee(event: React.FormEvent) {
    event.preventDefault(); if (!branchId || !token) return;
    setBusy(true); setError("");
    try {
      await api.saveHrEmployee({ branchId, token, employeeId: employeeForm.id, name: employeeForm.name, pin: employeeForm.pin || undefined, isActive: employeeForm.isActive, phone: employeeForm.phone, jobTitle: employeeForm.jobTitle, hireDate: employeeForm.hireDate, monthlySalary: Number(employeeForm.monthlySalary) });
      setEmployeeDialog(false); setEmployeeForm(blankEmployee()); await loadEmployees();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function generatePayroll() {
    if (!branchId || !token) return;
    setBusy(true); setError("");
    try { setPayroll(await api.generateHrPayroll(branchId, token, month)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function saveDeductions(event: React.FormEvent) {
    event.preventDefault(); if (!branchId || !token || !deductionTarget) return;
    setBusy(true); setError("");
    try { setPayroll(await api.saveHrPayrollDeductions(branchId, token, deductionTarget.id, deductions.filter((d) => d.description.trim() && Number(d.amount) > 0), note)); setDeductionTarget(null); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function markPaid(row: HrPayrollEntry) {
    if (!branchId || !token) return;
    setBusy(true); setError("");
    try { setPayroll(await api.markHrPayrollPaid(branchId, token, row.id)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  if (currentUser?.role !== "owner") return <AppShell title={text("HR & Payroll", "الموارد البشرية والرواتب")}><div className="p-6 text-center text-muted-foreground">{text("Owner access only", "هذه الصفحة متاحة للمالك فقط")}</div></AppShell>;

  return <AppShell title={text("HR & Payroll", "الموارد البشرية والرواتب")}>
    <div className="space-y-5 p-4 pb-10 sm:p-6">
      {!token ? <Card className="mx-auto mt-8 max-w-md"><CardHeader className="items-center text-center"><div className="mb-2 rounded-2xl bg-primary/10 p-4 text-primary"><LockKeyhole className="h-8 w-8" /></div><CardTitle>{text("Unlock HR records", "فتح بيانات الموارد البشرية")}</CardTitle><p className="text-sm text-muted-foreground">{text("Confirm the owner PIN to view salaries and deductions.", "أدخل الرقم السري للمالك لعرض الرواتب والخصومات.")}</p></CardHeader><CardContent><form onSubmit={unlock} className="space-y-3"><Input type="password" inputMode="numeric" autoComplete="current-password" placeholder={text("Owner PIN", "الرقم السري للمالك")} value={pin} onChange={(e) => setPin(e.target.value)} required /><Button className="w-full" disabled={busy || !branchId}>{busy ? text("Checking…", "جارٍ التحقق…") : text("Unlock", "فتح")}</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</form></CardContent></Card> : <>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">{text("HR & Payroll", "الموارد البشرية والرواتب")}</h1><p className="text-sm text-muted-foreground">{text("Employee records, monthly payroll, and deductions", "ملفات الموظفين والرواتب الشهرية والخصومات")}</p></div><Button variant="outline" onClick={refresh} disabled={busy}><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />{text("Refresh", "تحديث")}</Button></div>
        <div className="flex gap-2 border-b border-border"><Button variant={tab === "employees" ? "default" : "ghost"} onClick={() => setTab("employees")}><UserRound className="h-4 w-4" />{text("Employees", "الموظفون")}</Button><Button variant={tab === "payroll" ? "default" : "ghost"} onClick={() => setTab("payroll")}><Wallet className="h-4 w-4" />{text("Payroll", "الرواتب")}</Button></div>
        {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
        {tab === "employees" ? <Card><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>{text("Employee records", "ملفات الموظفين")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{text("New employees are also added to the attendance roster.", "الموظف الجديد يُضاف كذلك إلى قائمة الحضور.")}</p></div><Button onClick={() => { setEmployeeForm(blankEmployee()); setEmployeeDialog(true); }}><Plus className="h-4 w-4" />{text("Add employee", "إضافة موظف")}</Button></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-start text-muted-foreground"><th className="p-3 text-start">{text("Employee", "الموظف")}</th><th className="p-3 text-start">{text("Job title", "المسمى الوظيفي")}</th><th className="p-3 text-start">{text("Phone", "الهاتف")}</th><th className="p-3 text-start">{text("Monthly salary", "الراتب الشهري")}</th><th className="p-3 text-start">{text("Status", "الحالة")}</th><th className="p-3"></th></tr></thead><tbody>{employees.map((employee) => <tr key={employee.id} className="border-b last:border-0"><td className="p-3 font-medium">{employee.name}</td><td className="p-3">{employee.jobTitle || "—"}</td><td className="p-3">{employee.phone || "—"}</td><td className="p-3">{currency.format(employee.monthlySalary)}</td><td className="p-3"><Badge variant={employee.isActive ? "outline" : "secondary"}>{employee.isActive ? text("Active", "نشط") : text("Inactive", "غير نشط")}</Badge></td><td className="p-3 text-end"><Button size="sm" variant="outline" onClick={() => { setEmployeeForm({ id: employee.id, name: employee.name, pin: "", phone: employee.phone || "", jobTitle: employee.jobTitle || "", hireDate: employee.hireDate || "", monthlySalary: String(employee.monthlySalary), isActive: employee.isActive }); setEmployeeDialog(true); }}>{text("Edit", "تعديل")}</Button></td></tr>)}{employees.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{text("No employees yet", "لا يوجد موظفون بعد")}</td></tr>}</tbody></table></div></CardContent></Card> : <>
          <div className="flex flex-wrap items-end justify-between gap-3"><label className="grid gap-1 text-sm font-medium">{text("Payroll month", "شهر الراتب")}<Input className="w-48" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label><Button onClick={generatePayroll} disabled={busy}><CalendarDays className="h-4 w-4" />{text("Generate / refresh payroll", "إنشاء / تحديث كشف الرواتب")}</Button></div>
          <div className="grid gap-3 sm:grid-cols-3"><Stat label={text("Base salaries", "إجمالي الرواتب")} value={currency.format(totals.salary)} icon={<BriefcaseBusiness className="h-4 w-4" />} /><Stat label={text("Deductions", "إجمالي الخصومات")} value={currency.format(totals.deduction)} icon={<CircleDollarSign className="h-4 w-4" />} /><Stat label={text("Net payroll", "صافي الرواتب")} value={currency.format(totals.net)} icon={<Wallet className="h-4 w-4" />} /></div>
          <Card><CardHeader><CardTitle>{text("Monthly payroll", "كشف الرواتب الشهري")} · {month}</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-3 text-start">{text("Employee", "الموظف")}</th><th className="p-3 text-start">{text("Base", "الأساسي")}</th><th className="p-3 text-start">{text("Deductions", "الخصومات")}</th><th className="p-3 text-start">{text("Net", "الصافي")}</th><th className="p-3 text-start">{text("Status", "الحالة")}</th><th className="p-3 text-end">{text("Actions", "الإجراءات")}</th></tr></thead><tbody>{payroll.map((row) => <tr key={row.id} className="border-b last:border-0"><td className="p-3 font-medium">{row.employeeName}</td><td className="p-3">{currency.format(row.baseSalary)}</td><td className="p-3">{currency.format(row.totalDeductions)}{row.deductions.length > 0 && <div className="mt-1 text-xs text-muted-foreground">{row.deductions.map((d) => `${d.description}: ${currency.format(d.amount)}`).join(" · ")}</div>}</td><td className="p-3 font-semibold">{currency.format(row.netSalary)}</td><td className="p-3"><Badge variant={row.status === "paid" ? "default" : "secondary"}>{row.status === "paid" ? text("Paid", "مدفوع") : text("Pending", "معلق")}</Badge></td><td className="p-3 text-end"><div className="flex justify-end gap-2">{row.status === "draft" && <><Button size="sm" variant="outline" onClick={() => { setDeductionTarget(row); setDeductions(row.deductions.length ? row.deductions.map((d) => ({ ...d })) : [{ description: "", amount: 0 }]); setNote(row.note || ""); }}>{text("Deductions", "الخصومات")}</Button><Button size="sm" onClick={() => markPaid(row)} disabled={busy}>{text("Mark paid", "تسجيل السداد")}</Button></>}</div></td></tr>)}{payroll.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{text("No payroll for this month. Generate it to start.", "لا يوجد كشف لهذا الشهر. أنشئ الكشف للبدء.")}</td></tr>}</tbody></table></div><p className="mt-3 text-xs text-muted-foreground">{text("Payroll is a record only; marking paid does not transfer money.", "الكشف للتسجيل فقط؛ تسجيل السداد لا يحول أموالاً.")}</p></CardContent></Card>
        </>}
      </>}

      <Dialog open={employeeDialog} onOpenChange={setEmployeeDialog}><DialogContent><DialogHeader><DialogTitle>{employeeForm.id ? text("Edit employee", "تعديل موظف") : text("Add employee", "إضافة موظف")}</DialogTitle></DialogHeader><form onSubmit={saveEmployee} className="space-y-3"><Field label={text("Full name", "الاسم بالكامل")}><Input required value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label={text("Job title", "المسمى الوظيفي")}><Input value={employeeForm.jobTitle} onChange={(e) => setEmployeeForm({ ...employeeForm, jobTitle: e.target.value })} /></Field><Field label={text("Phone", "الهاتف")}><Input value={employeeForm.phone} onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })} /></Field></div><div className="grid gap-3 sm:grid-cols-2"><Field label={text("Hire date", "تاريخ التعيين")}><Input type="date" value={employeeForm.hireDate} onChange={(e) => setEmployeeForm({ ...employeeForm, hireDate: e.target.value })} /></Field><Field label={text("Monthly salary (EGP)", "الراتب الشهري (جنيه)")}><Input type="number" min="0" step="0.01" required value={employeeForm.monthlySalary} onChange={(e) => setEmployeeForm({ ...employeeForm, monthlySalary: e.target.value })} /></Field></div>{!employeeForm.id && <Field label={text("4-digit attendance PIN", "رقم حضور من ٤ أرقام")}><Input inputMode="numeric" maxLength={4} pattern="[0-9]{4}" required value={employeeForm.pin} onChange={(e) => setEmployeeForm({ ...employeeForm, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></Field>}{employeeForm.id && <Field label={text("New attendance PIN (optional)", "رقم حضور جديد (اختياري)")}><Input inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={employeeForm.pin} onChange={(e) => setEmployeeForm({ ...employeeForm, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></Field>}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={employeeForm.isActive} onChange={(e) => setEmployeeForm({ ...employeeForm, isActive: e.target.checked })} />{text("Active employee", "موظف نشط")}</label><DialogFooter><Button type="button" variant="outline" onClick={() => setEmployeeDialog(false)}>{text("Cancel", "إلغاء")}</Button><Button type="submit" disabled={busy}>{text("Save employee", "حفظ الموظف")}</Button></DialogFooter></form></DialogContent></Dialog>

      <Dialog open={!!deductionTarget} onOpenChange={(open) => !open && setDeductionTarget(null)}><DialogContent><DialogHeader><DialogTitle>{text("Deductions", "خصومات")} · {deductionTarget?.employeeName}</DialogTitle></DialogHeader><form onSubmit={saveDeductions} className="space-y-3"><div className="space-y-2">{deductions.map((deduction, index) => <div key={index} className="grid grid-cols-[1fr_120px_auto] gap-2"><Input placeholder={text("Reason", "سبب الخصم")} value={deduction.description} onChange={(e) => setDeductions(deductions.map((d, i) => i === index ? { ...d, description: e.target.value } : d))} /><Input aria-label={text("Amount", "القيمة")} type="number" min="0" step="0.01" value={deduction.amount || ""} onChange={(e) => setDeductions(deductions.map((d, i) => i === index ? { ...d, amount: Number(e.target.value) } : d))} /><Button type="button" variant="ghost" onClick={() => setDeductions(deductions.filter((_, i) => i !== index))}>×</Button></div>)}</div><Button type="button" size="sm" variant="outline" onClick={() => setDeductions([...deductions, { description: "", amount: 0 }])}><Plus className="h-4 w-4" />{text("Add deduction", "إضافة خصم")}</Button><Field label={text("Note", "ملاحظة")}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field><DialogFooter><Button type="button" variant="outline" onClick={() => setDeductionTarget(null)}>{text("Cancel", "إلغاء")}</Button><Button type="submit" disabled={busy}>{text("Save deductions", "حفظ الخصومات")}</Button></DialogFooter></form></DialogContent></Dialog>
    </div>
  </AppShell>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-sm font-medium">{label}{children}</label>; }
function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div><div className="rounded-xl bg-primary/10 p-3 text-primary">{icon}</div></CardContent></Card>; }
