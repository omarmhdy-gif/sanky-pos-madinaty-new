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

const AVATAR_COLORS = ["bg-espresso-600", "bg-amber-600", "bg-emerald-600", "bg-sky-600", "bg-pink-600", "bg-violet-600"];

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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.settings.addStaff}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t.common.name}</Label>
            <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>PIN (4 digits){staff ? " — leave blank to keep current PIN" : ""}</Label>
            <Input
              className="mt-1.5"
              value={pin}
              maxLength={4}
              placeholder={staff ? "••••" : ""}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div>
            <Label>{t.settings.role}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">{t.settings.roles.owner}</SelectItem>
                <SelectItem value="cashier">{t.settings.roles.cashier}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t.settings.permissions}</Label>
            {role === "owner" ? (
              <p className="mt-1.5 text-xs text-muted-foreground">{t.settings.permissionsOwnerNote}</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-muted-foreground">{t.settings.permissionsHint}</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {ALL_PERMISSION_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => togglePermission(key)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                        permissions.includes(key)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border"
                      }`}
                    >
                      {permissionLabel(key)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div>
            <Label>Avatar Color</Label>
            <div className="mt-1.5 flex gap-2">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full ${c} ${color === c ? "ring-2 ring-offset-2 ring-primary" : ""}`}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button onClick={handleSave}>{t.common.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
