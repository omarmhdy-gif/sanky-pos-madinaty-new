"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil, UsersRound, ShieldCheck, KeyRound, Fingerprint, ArrowUpRight } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { StaffFormDialog } from "@/components/settings/StaffFormDialog";
import { AttendanceEmployeeFormDialog } from "@/components/settings/AttendanceEmployeeFormDialog";
import { useDataStore } from "@/lib/store/useDataStore";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { StaffUser, AttendanceEmployee } from "@/lib/types";
import { ALL_PERMISSION_KEYS, ROLE_DEFAULT_PERMISSIONS } from "@/lib/permissions";

export default function EmployeesPage() {
  const { t } = useI18n();
  const staff = useDataStore((s) => s.staff);
  const deleteStaff = useDataStore((s) => s.deleteStaff);
  const attendanceEmployees = useDataStore((s) => s.attendanceEmployees);
  const deleteAttendanceEmployee = useDataStore((s) => s.deleteAttendanceEmployee);
  const ownerCount = staff.filter((user) => user.role === "owner").length;
  const cashierCount = staff.filter((user) => user.role === "cashier").length;

  const [staffFormOpen, setStaffFormOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null);
  const [deleteStaffTarget, setDeleteStaffTarget] = useState<StaffUser | null>(null);

  const [attnFormOpen, setAttnFormOpen] = useState(false);
  const [editingAttn, setEditingAttn] = useState<AttendanceEmployee | null>(null);
  const [deleteAttnTarget, setDeleteAttnTarget] = useState<AttendanceEmployee | null>(null);

  return (
    <AppShell title={t.settings.staff}>
      <div className="space-y-6 p-4 pb-10 sm:p-6 lg:p-8">
        <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card via-card to-primary/10 p-5 shadow-sm sm:p-7">
          <div className="pointer-events-none absolute -end-12 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"><UsersRound className="h-7 w-7" /></div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t.settings.staffAccounts}</p>
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.settings.staff}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t.settings.staffPageDesc}</p>
              </div>
            </div>
            <Button
              className="h-11 rounded-xl px-5 shadow-md shadow-primary/15"
              onClick={() => {
                setEditingStaff(null);
                setStaffFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              {t.settings.addStaff}
            </Button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {[
            { label: t.settings.staffAccounts, value: staff.length, icon: UsersRound, tone: "bg-primary/10 text-primary" },
            { label: t.settings.roles.owner, value: ownerCount, icon: ShieldCheck, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
            { label: t.settings.roles.cashier, value: cashierCount, icon: KeyRound, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
          ].map(({ label, value, icon: Icon, tone }) => (
            <Card key={label} className="overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5">
              <CardContent className="flex items-center justify-between p-4 sm:p-5">
                <div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-bold tabular-nums">{value}</p></div>
                <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", tone)}><Icon className="h-5 w-5" /></div>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="overflow-hidden rounded-3xl">
          <CardHeader className="border-b border-border/70 bg-muted/20 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <div><CardTitle>{t.settings.staff}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{t.settings.manageStaffDesc}</p></div>
            <Badge variant="outline" className="w-fit rounded-full px-3 py-1">{staff.length} · {t.settings.staffAccounts}</Badge>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            {staff.length === 0 ? <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">{t.common.noResults}</div> :
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {staff.map((u) => {
                  const accessCount = u.role === "owner" ? ALL_PERMISSION_KEYS.length : (u.permissions ?? ROLE_DEFAULT_PERMISSIONS[u.role]).length;
                  return <article key={u.id} className="group rounded-2xl border border-border/80 bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md hover:shadow-primary/5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-sm ring-4 ring-background", u.avatarColor)}>{u.name.slice(0, 2).toUpperCase()}</div>
                        <div className="min-w-0"><p className="truncate font-semibold">{u.name}</p><Badge variant="outline" className="mt-1 rounded-full">{t.settings.roles[u.role]}</Badge></div>
                      </div>
                      <div className="flex gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" aria-label={`${t.common.edit} ${u.name}`} title={t.common.edit} onClick={() => { setEditingStaff(u); setStaffFormOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" aria-label={`${t.common.delete} ${u.name}`} title={t.common.delete} onClick={() => setDeleteStaffTarget(u)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5"><Fingerprint className="h-3.5 w-3.5" />{u.role === "owner" ? t.settings.allModules : t.settings.permissionsSelected.replace("{count}", String(accessCount))}</span>
                      <ArrowUpRight className="h-3.5 w-3.5 opacity-40 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary group-hover:opacity-100" />
                    </div>
                  </article>;
                })}
              </div>}
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-3xl">
          <CardHeader className="border-b border-border/70 bg-muted/20 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <div>
              <CardTitle>{t.employees.attendanceEmployees}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{t.employees.attendanceEmployeesDesc}</p>
            </div>
            <Button className="rounded-xl"
              size="sm"
              onClick={() => {
                setEditingAttn(null);
                setAttnFormOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              {t.employees.addEmployee}
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 p-4 sm:p-5">
            {attendanceEmployees.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">{t.common.noResults}</p>
            )}
            {attendanceEmployees.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-2xl border border-border/80 bg-card p-3.5 transition-colors hover:border-primary/30">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-bold">
                    {e.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{e.name}</p>
                    <Badge variant={e.isActive ? "outline" : "destructive"} className="mt-0.5">
                      {e.isActive ? t.common.active : t.common.inactive}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setEditingAttn(e);
                      setAttnFormOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setDeleteAttnTarget(e)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <StaffFormDialog staff={editingStaff} open={staffFormOpen} onOpenChange={setStaffFormOpen} />
      <AttendanceEmployeeFormDialog employee={editingAttn} open={attnFormOpen} onOpenChange={setAttnFormOpen} />

      <AlertDialog open={!!deleteStaffTarget} onOpenChange={(v) => !v && setDeleteStaffTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.products.deleteConfirm}</AlertDialogTitle>
            <AlertDialogDescription>{t.products.deleteConfirmDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteStaffTarget) deleteStaff(deleteStaffTarget.id);
                setDeleteStaffTarget(null);
              }}
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteAttnTarget} onOpenChange={(v) => !v && setDeleteAttnTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.products.deleteConfirm}</AlertDialogTitle>
            <AlertDialogDescription>{t.products.deleteConfirmDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteAttnTarget) deleteAttendanceEmployee(deleteAttnTarget.id);
                setDeleteAttnTarget(null);
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
