"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useDataStore } from "@/lib/store/useDataStore";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { ALL_PERMISSION_KEYS, ROLE_DEFAULT_PERMISSIONS } from "@/lib/permissions";
import type { StaffUser, UserRole, PermissionKey } from "@/lib/types";
import { Check, CheckCheck, CircleUserRound, KeyRound, ShieldCheck, UserRound } from "lucide-react";

const AVATAR_COLORS = ["bg-espresso-600", "bg-amber-600", "bg-emerald-600", "bg-sky-600", "bg-pink-600", "bg-violet-600"];
const PERMISSION_GROUPS: PermissionKey[][] = [
  ["pos", "orders", "attendance"],
  ["products", "inventory"],
  ["dashboard", "finance", "purchases", "reports", "employees", "customers", "settings"],
];

export function StaffFormDialog({
  staff,
  open,
  onOpenChange,
}: {
  staff: StaffUser | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const addStaff = useDataStore((s) => s.addStaff);
  const updateStaff = useDataStore((s) => s.updateStaff);

  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<UserRole>("cashier");
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [permissions, setPermissions] = useState<PermissionKey[]>(ROLE_DEFAULT_PERMISSIONS.cashier);

  useEffect(() => {
    if (open) {
      setName(staff?.name ?? "");
      setPin("");
      setRole(staff?.role ?? "cashier");
      setColor(staff?.avatarColor ?? AVATAR_COLORS[0]);
      // Pre-populate with whatever this person already effectively has
      // (their saved grant list, or the role default if never configured)
      // so the checklist reflects reality instead of looking empty.
      setPermissions(staff?.permissions ?? ROLE_DEFAULT_PERMISSIONS.cashier);
    }
  }, [open, staff]);

  const togglePermission = (key: PermissionKey) => {
    setPermissions((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const permissionLabel = (key: PermissionKey): string =>
    key === "purchases" ? t.purchases.title : t.nav[key];

  const handleSave = () => {
    const pinProvided = pin.length > 0;
    if (!name.trim() || (pinProvided && pin.length !== 4) || (!staff && !pinProvided)) {
      toast(t.common.required, "error");
      return;
    }
    // Owner always has everything (enforced everywhere permissions are
    // checked) — no point persisting a grant list for them.
    const permissionsToSave = role === "owner" ? undefined : permissions;
    if (staff) {
      updateStaff(staff.id, {
        name: name.trim(),
        pin: pinProvided ? pin : undefined,
        role,
        avatarColor: color,
        permissions: permissionsToSave,
      });
    } else {
      addStaff({ name: name.trim(), pin, role, avatarColor: color, isActive: true, permissions: permissionsToSave });
    }
    toast(t.common.save, "success");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto p-0" preventOutsideClose>
        <DialogHeader className="border-b border-border bg-muted/30 px-6 py-5 pe-12">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><UserRound className="h-5 w-5" /></div>
            <div>
              <DialogTitle>{staff ? t.settings.editStaff : t.settings.addStaff}</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t.settings.staffFormDesc}</p>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-5 px-6 py-5">
          <section className="rounded-2xl border border-border p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><CircleUserRound className="h-4 w-4 text-primary" />{t.settings.staffProfile}</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="staff-name">{t.settings.staffName}</Label>
                <Input id="staff-name" autoComplete="off" className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.settings.staffNamePlaceholder} />
              </div>
              <div>
                <Label htmlFor="staff-pin">{t.settings.staffPin}</Label>
                <div className="relative mt-1.5">
                  <KeyRound className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="staff-pin" className="ps-9 tracking-[0.35em]" inputMode="numeric" autoComplete="new-password" value={pin} maxLength={4} pattern="[0-9]{4}" placeholder={staff ? "••••" : "0000"} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{staff ? t.settings.staffPinKeepHint : t.settings.staffPinHint}</p>
              </div>
              <div>
                <Label htmlFor="staff-role">{t.settings.role}</Label>
                <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                  <SelectTrigger id="staff-role" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">{t.settings.roles.owner}</SelectItem>
                    <SelectItem value="cashier">{t.settings.roles.cashier}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>{t.settings.staffAvatar}</Label>
                <div className="mt-2 flex flex-wrap items-center gap-2.5">
                  {AVATAR_COLORS.map((c) => (
                    <button key={c} type="button" aria-label={`${t.settings.staffAvatar} ${c.replace("bg-", "").replace("-600", "")}`} aria-pressed={color === c} onClick={() => setColor(c)} className={`relative h-9 w-9 rounded-xl ${c} transition-transform hover:scale-105 ${color === c ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-75 hover:opacity-100"}`}>
                      {color === c && <Check className="absolute inset-0 m-auto h-4 w-4 text-white" />}
                    </button>
                  ))}
                  <div className="ms-1 flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-2.5 py-1.5">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white ${color}`}>{name.trim().slice(0, 2).toUpperCase() || "ST"}</div>
                    <span className="max-w-32 truncate text-xs font-medium">{name.trim() || t.settings.staffPreview}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold">{t.settings.permissions}</h3>
                  {role === "cashier" && <p className="mt-0.5 text-xs text-muted-foreground">{t.settings.permissionsSelected.replace("{count}", String(permissions.length))}</p>}
                </div>
              </div>
              {role === "cashier" && <div className="flex gap-1.5">
                <Button type="button" size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => setPermissions([...ALL_PERMISSION_KEYS])}><CheckCheck className="h-3.5 w-3.5" />{t.settings.selectAllPermissions}</Button>
                <Button type="button" size="sm" variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => setPermissions([])}>{t.settings.clearPermissions}</Button>
              </div>}
            </div>
            {role === "owner" ? (
              <div className="flex items-start gap-3 rounded-xl bg-primary/5 p-3.5 text-sm">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div><p className="font-medium">{t.settings.roles.owner}</p><p className="mt-0.5 text-xs text-muted-foreground">{t.settings.permissionsOwnerNote}</p></div>
              </div>
            ) : (
              <>
                <p className="mb-3 text-xs text-muted-foreground">{t.settings.permissionsHint}</p>
                <div className="space-y-4">
                  {PERMISSION_GROUPS.map((group, index) => (
                    <div key={index}>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.settings.permissionGroups[index]}</p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {group.map((key) => {
                          const selected = permissions.includes(key);
                          return <button key={key} type="button" role="checkbox" aria-checked={selected} onClick={() => togglePermission(key)} className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-start text-sm transition-all ${selected ? "border-primary/50 bg-primary/5 shadow-sm" : "border-border bg-background hover:border-primary/30 hover:bg-muted/50"}`}>
                            <span className="font-medium">{permissionLabel(key)}</span>
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"}`}>{selected && <Check className="h-3.5 w-3.5" />}</span>
                          </button>;
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
        <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button onClick={handleSave}>{t.common.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
