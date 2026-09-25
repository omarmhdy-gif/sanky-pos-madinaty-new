"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
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

export default function EmployeesPage() {
  const { t } = useI18n();
  const staff = useDataStore((s) => s.staff);
  const deleteStaff = useDataStore((s) => s.deleteStaff);
  const attendanceEmployees = useDataStore((s) => s.attendanceEmployees);
  const deleteAttendanceEmployee = useDataStore((s) => s.deleteAttendanceEmployee);

  const [staffFormOpen, setStaffFormOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null);
  const [deleteStaffTarget, setDeleteStaffTarget] = useState<StaffUser | null>(null);

  const [attnFormOpen, setAttnFormOpen] = useState(false);
  const [editingAttn, setEditingAttn] = useState<AttendanceEmployee | null>(null);
  const [deleteAttnTarget, setDeleteAttnTarget] = useState<AttendanceEmployee | null>(null);

  return (
    <AppShell title={t.settings.staff}>
      <div className="space-y-5 p-4 sm:p-6 pb-10">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>{t.settings.staff}</CardTitle>
            <Button
              size="sm"
              onClick={() => {
                setEditingStaff(null);
                setStaffFormOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              {t.settings.addStaff}
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {staff.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-3">
                  <div className={cn("flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white", u.avatarColor)}>
                    {u.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{u.name}</p>
                    <Badge variant="outline" className="mt-0.5 capitalize">
                      {t.settings.roles[u.role]}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setEditingStaff(u);
                      setStaffFormOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setDeleteStaffTarget(u)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>{t.employees.attendanceEmployees}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{t.employees.attendanceEmployeesDesc}</p>
            </div>
            <Button
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
          <CardContent className="space-y-2">
            {attendanceEmployees.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">{t.common.noResults}</p>
            )}
            {attendanceEmployees.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg border border-border p-3">
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
