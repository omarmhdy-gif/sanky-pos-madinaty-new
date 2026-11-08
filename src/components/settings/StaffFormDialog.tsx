"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDataStore } from "@/lib/store/useDataStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { ALL_PERMISSION_KEYS, NEW_EMPLOYEE_DEFAULT_PERMISSIONS, PERMISSION_GROUPS, PERMISSION_MODULES, ROLE_DEFAULT_PERMISSIONS, expandPermissionGrants, hasPermission } from "@/lib/permissions";
import type { StaffUser, PermissionKey } from "@/lib/types";
import { Check, CheckCheck, CircleUserRound, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { getShopAccountNumber } from "@/lib/supabase/client";
import { fetchEmployeeLoginEmail } from "@/lib/supabase/api";

const AVATAR_PALETTE = [
  { value: "bg-espresso-600", gradient: "from-stone-500 via-stone-700 to-neutral-950" },
  { value: "bg-amber-600", gradient: "from-yellow-300 via-amber-500 to-orange-700" },
  { value: "bg-emerald-600", gradient: "from-emerald-300 via-emerald-500 to-teal-800" },
  { value: "bg-sky-600", gradient: "from-cyan-300 via-sky-500 to-blue-800" },
  { value: "bg-pink-600", gradient: "from-pink-300 via-rose-500 to-fuchsia-800" },
  { value: "bg-violet-600", gradient: "from-violet-300 via-violet-500 to-indigo-800" },
];
const AVATAR_COLORS = AVATAR_PALETTE.map((swatch) => swatch.value);
// Start new employees with the smallest useful cashier access; managers can
// add the exact modules and actions this employee needs.
const DEFAULT_EMPLOYEE_PERMISSIONS = NEW_EMPLOYEE_DEFAULT_PERMISSIONS;

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
  const currentUser = useAuthStore((s) => s.currentUser);
  const canManagePermissions = hasPermission(currentUser, "employees.manage_permissions");
  const canGrantAllPermissions = ALL_PERMISSION_KEYS.every((permission) => hasPermission(currentUser, permission));

  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [currentEmail, setCurrentEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [permissions, setPermissions] = useState<PermissionKey[]>(DEFAULT_EMPLOYEE_PERMISSIONS);

  useEffect(() => {
    if (open) {
      setName(staff?.name ?? "");
      setPin("");
      setEmail("");
      setCurrentEmail(staff?.email ?? "");
      setPassword("");
      setSaving(false);
      setColor(staff?.avatarColor ?? AVATAR_COLORS[0]);
      // Pre-populate with whatever this person already effectively has
      // (their saved grant list, or the role default if never configured)
      // so the checklist reflects reality instead of looking empty.
      setPermissions(staff
        ? expandPermissionGrants(staff.permissions ?? ROLE_DEFAULT_PERMISSIONS.cashier)
        : canManagePermissions
          ? DEFAULT_EMPLOYEE_PERMISSIONS.filter((permission) => hasPermission(currentUser, permission))
          : [...DEFAULT_EMPLOYEE_PERMISSIONS]);
    }
  }, [open, staff, canManagePermissions, currentUser]);

  useEffect(() => {
    if (!open || !staff?.hasConsoleLogin || staff.email) return;
    let active = true;
    void fetchEmployeeLoginEmail(staff.id, staff.branchId)
      .then((value) => { if (active && value) { setEmail(value); setCurrentEmail(value); } })
      .catch(() => { /* Keep the field editable if this account cannot be read. */ });
    return () => { active = false; };
  }, [open, staff?.id, staff?.branchId, staff?.hasConsoleLogin, staff?.email]);

  const togglePermission = (key: PermissionKey, parentModule?: string) => {
    setPermissions((prev) => {
      const [keyModule, action] = key.split(".");
      const moduleName = action === "view" ? keyModule : parentModule ?? keyModule;
      const viewKey = `${moduleName}.view` as PermissionKey;
      if (!prev.includes(key) && currentUser?.role !== "owner" && !hasPermission(currentUser, key)) {
        toast(t.settings.permissionsLocked, "error");
        return prev;
      }
      if (action !== "view" && !prev.includes(viewKey) && currentUser?.role !== "owner" && !hasPermission(currentUser, viewKey)) {
        toast(t.settings.permissionsLocked, "error");
        return prev;
      }
      if (action === "view") {
        if (prev.includes(key)) {
          const moduleActions = PERMISSION_MODULES.find((module) => module.key === moduleName)?.actions ?? [];
          return prev.filter((item) => item !== key && !moduleActions.includes(item));
        }
        return [...prev, key];
      }
      if (key.includes(".")) {
        if (prev.includes(key)) return prev.filter((item) => item !== key);
        return [...new Set([...prev, viewKey, key])];
      }
      if (prev.includes(key)) return prev.filter((item) => item !== key && !item.startsWith(`${key}.`));
      return [...prev, viewKey];
    });
  };

  const permissionLabel = (key: PermissionKey): string => {
    if (!key.includes(".")) return key === "purchases" ? t.purchases.title : t.nav[key as keyof typeof t.nav];
    const action = key.split(".")[1] as keyof typeof t.settings.permissionActions;
    return t.settings.permissionActions[action];
  };

  const selectedModuleCount = PERMISSION_MODULES.filter((module) => permissions.includes(`${module.key}.view` as PermissionKey)).length;
  const selectedActionCount = permissions.filter((key) => key.includes(".") && !key.endsWith(".view")).length;
  const isFullAccessAccount = staff?.role === "owner";
  const canEditThisPermissionSet = canManagePermissions && !isFullAccessAccount;
  const avatarGradient = AVATAR_PALETTE.find((swatch) => swatch.value === color)?.gradient ?? AVATAR_PALETTE[0].gradient;

  const handleSave = async () => {
    const pinProvided = pin.length > 0;
    const cleanEmail = email.trim().toLowerCase();
    const passwordProvided = password.length > 0;
    const existingConsoleLogin = Boolean(staff?.hasConsoleLogin);
    const emailChanged = Boolean(cleanEmail && cleanEmail !== currentEmail);
    const requestsConsoleLogin = Boolean(passwordProvided || (cleanEmail && !existingConsoleLogin) || emailChanged);
    const createsConsoleLogin = !existingConsoleLogin && requestsConsoleLogin;
    if (!name.trim() || (pinProvided && pin.length !== 4)) {
      toast(t.common.required, "error");
      return;
    }
    if (!staff && !pinProvided && !(cleanEmail && passwordProvided)) {
      toast(t.settings.employeeLoginRequired, "error");
      return;
    }
    if (createsConsoleLogin && (!cleanEmail || !passwordProvided)) {
      toast(t.settings.employeeLoginPairRequired, "error");
      return;
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast(t.settings.employeeEmailInvalid, "error");
      return;
    }
    if (passwordProvided && password.length < 8) {
      toast(t.settings.employeePasswordTooShort, "error");
      return;
    }
    const effectiveHasPin = pinProvided || Boolean(staff?.hasPin);
    const willHaveConsoleLogin = existingConsoleLogin || createsConsoleLogin;
    const hasNonCashierPermission = permissions.some((key) => key !== "pos" && !key.startsWith("pos."));
    if (willHaveConsoleLogin && !effectiveHasPin && !hasNonCashierPermission) {
      toast(t.settings.employeeConsolePermissionRequired, "error");
      return;
    }
    const accountNumber = getShopAccountNumber();
    if (willHaveConsoleLogin && !accountNumber) {
      toast(t.settings.employeeBusinessNumberUnavailable, "error");
      return;
    }
    // Owner always has everything (enforced everywhere permissions are
    // checked) — no point persisting a grant list for them.
    const permissionsToSave = canEditThisPermissionSet
      ? permissions
      : staff ? undefined : DEFAULT_EMPLOYEE_PERMISSIONS;
    setSaving(true);
    try {
      const saved = staff
        ? await updateStaff(staff.id, {
            name: name.trim(),
            pin: pinProvided ? pin : undefined,
            role: staff.role,
            avatarColor: color,
            permissions: permissionsToSave,
            email: emailChanged ? cleanEmail : undefined,
            password: passwordProvided ? password : undefined,
          })
        : await addStaff({
            name: name.trim(),
            pin: pinProvided ? pin : "",
            role: "cashier",
            avatarColor: color,
            isActive: true,
            permissions: permissionsToSave,
            email: cleanEmail || undefined,
            password: passwordProvided ? password : undefined,
          });
      if (!saved) return;
      toast(t.common.save, "success");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const hasConsoleLogin = Boolean(staff?.hasConsoleLogin || email.trim() || password);

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
                <Label htmlFor="staff-account-number">{t.settings.shopAccountNumber}</Label>
                <Input id="staff-account-number" className="mt-1.5 font-mono tracking-widest" value={getShopAccountNumber() ?? "—"} readOnly aria-readonly="true" />
                <p className="mt-1 text-xs text-muted-foreground">{t.settings.employeeAccountShared}</p>
              </div>
              <div>
                <Label htmlFor="staff-email">{t.settings.employeeEmail}</Label>
                <Input id="staff-email" type="email" autoComplete="off" className="mt-1.5" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
              </div>
              <div>
                <Label htmlFor="staff-password">{t.settings.employeePassword}</Label>
                <Input id="staff-password" type="password" autoComplete="new-password" className="mt-1.5" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={staff?.hasConsoleLogin ? "••••••••" : ""} />
                <p className="mt-1 text-xs text-muted-foreground">{staff?.hasConsoleLogin ? t.settings.employeePasswordHint : t.settings.employeeEmailHint}</p>
              </div>
              {staff?.hasConsoleLogin && <p className="sm:col-span-2 text-xs text-muted-foreground">{t.settings.employeeExistingLoginHint}</p>}
              <div className="sm:col-span-2">
                <Label>{t.settings.staffAvatar}</Label>
                <div className="mt-2 flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3">
                  <div className="flex items-center gap-2.5">
                    {AVATAR_PALETTE.map((swatch, index) => (
                    <button key={swatch.value} type="button" aria-label={`${t.settings.staffAvatar} ${index + 1}`} aria-pressed={color === swatch.value} onClick={() => setColor(swatch.value)} className={`group relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${swatch.gradient} shadow-sm transition duration-200 hover:-translate-y-0.5 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${color === swatch.value ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-75 hover:opacity-100"}`}>
                      <span className="absolute inset-[3px] rounded-full border border-white/25" />
                      {color === swatch.value && <Check className="relative h-4 w-4 text-white drop-shadow" />}
                    </button>
                  ))}
                  </div>
                  <div className="ms-auto flex min-w-40 items-center gap-3 rounded-xl border border-border/70 bg-background/80 px-3 py-2 shadow-sm">
                    <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[1.1rem] bg-gradient-to-br ${avatarGradient} text-xs font-bold tracking-wide text-white shadow-md ring-1 ring-white/25`}>
                      <span className="absolute -end-2 -top-2 h-7 w-7 rounded-full bg-white/20 blur-[1px]" />
                      <span className="relative">{name.trim().slice(0, 2).toUpperCase() || "ST"}</span>
                      <span className="absolute bottom-0.5 end-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-400" />
                    </div>
                    <div className="min-w-0"><p className="truncate text-xs font-semibold">{name.trim() || t.settings.staffPreview}</p><p className="text-[10px] text-muted-foreground">{t.settings.staffAvatar}</p></div>
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
                  {!isFullAccessAccount && <p className="mt-0.5 text-xs text-muted-foreground">{t.settings.permissionsSelected.replace("{modules}", String(selectedModuleCount)).replace("{actions}", String(selectedActionCount))}</p>}
                </div>
              </div>
              {canEditThisPermissionSet && <div className="flex gap-1.5">
                {canGrantAllPermissions && <Button type="button" size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => setPermissions([...ALL_PERMISSION_KEYS])}><CheckCheck className="h-3.5 w-3.5" />{t.settings.selectAllPermissions}</Button>}
                <Button type="button" size="sm" variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => setPermissions([])}>{t.settings.clearPermissions}</Button>
              </div>}
            </div>
            {!hasConsoleLogin && <p className="mb-3 rounded-xl bg-primary/5 px-3.5 py-2.5 text-xs text-muted-foreground">{t.settings.employeePinOnlyHint}</p>}
            {isFullAccessAccount ? (
              <div className="flex items-start gap-3 rounded-xl bg-primary/5 p-3.5 text-sm">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div><p className="font-medium">{t.settings.allModules}</p><p className="mt-0.5 text-xs text-muted-foreground">{t.settings.permissionsOwnerNote}</p></div>
              </div>
            ) : !canEditThisPermissionSet ? (
              <div className="rounded-xl bg-muted/50 p-3.5 text-sm text-muted-foreground">{t.settings.permissionsLocked}</div>
            ) : (
              <>
                <p className="mb-3 text-xs text-muted-foreground">{t.settings.permissionsHint}</p>
                <div className="space-y-5">
                  {PERMISSION_GROUPS.map((group, index) => (
                    <div key={index}>
                      <p className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-foreground"><span className="h-1.5 w-1.5 rounded-full bg-primary" />{t.settings.permissionGroups[index]}</p>
                      <div className="space-y-2">
                        {group.map((moduleKey) => {
                          const module = PERMISSION_MODULES.find((item) => item.key === moduleKey)!;
                          const viewKey = `${moduleKey}.view` as PermissionKey;
                          const selected = permissions.includes(viewKey);
                          return <div key={moduleKey} className={`overflow-hidden rounded-xl border transition-colors ${selected ? "border-primary/30 bg-primary/[0.025]" : "border-border/80 bg-background"}`}>
                            <button type="button" role="checkbox" aria-checked={selected} onClick={() => togglePermission(viewKey)} className={`flex min-h-11 w-full items-center justify-between gap-3 px-3 text-start text-sm transition-colors ${selected ? "bg-primary/5 text-primary" : "text-foreground hover:bg-muted/40"}`}>
                              <span className="min-w-0 font-semibold">{permissionLabel(moduleKey)}</span>
                              <span className="flex shrink-0 items-center gap-2">
                                {module.actions.length === 0 && <span className="text-[11px] font-normal text-muted-foreground">{permissionLabel(viewKey)}</span>}
                                <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"}`}>{selected && <Check className="h-3.5 w-3.5" />}</span>
                              </span>
                            </button>
                            {module.actions.length > 0 && <div className={`grid gap-1.5 border-t border-border/60 p-2 sm:grid-cols-2 ${selected ? "bg-background/50" : "bg-muted/15"}`}>
                                {module.actions.map((action) => {
                                const selected = permissions.includes(action);
                                  return <button key={action} type="button" role="checkbox" aria-checked={selected} onClick={() => togglePermission(action, moduleKey)} disabled={!permissions.includes(viewKey)} className={`flex min-h-9 items-center justify-between gap-3 rounded-lg border border-transparent px-2.5 text-start text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${selected ? "border-primary/10 bg-primary/5 text-foreground" : "text-muted-foreground hover:border-border/60 hover:bg-muted/50"}`}>
                                  <span>{permissionLabel(action)}</span>
                                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"}`}>{selected && <Check className="h-3 w-3" />}</span>
                                </button>;
                              })}
                            </div>}
                          </div>;
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
          <Button onClick={handleSave} disabled={saving}>{saving ? t.common.loading : t.common.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
