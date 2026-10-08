"use client";

import { useMemo, useState } from "react";
import {
  BadgePercent,
  Crown,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShoppingBag,
  Users,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useDataStore } from "@/lib/store/useDataStore";
import { useBranchStore } from "@/lib/store/useBranchStore";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";
import { createCustomer, updateCustomer } from "@/lib/supabase/api";
import { toast } from "@/components/ui/toast";
import type { Customer } from "@/lib/types";

type CustomerFilter = "all" | "loyalty" | "standard";

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: typeof Users;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground sm:text-sm">{title}</p>
          <p className="mt-1 truncate text-xl font-bold tracking-tight sm:text-2xl">{value}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:h-11 sm:w-11">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function CustomersPage() {
  const { locale } = useI18n();
  const isArabic = locale === "ar";
  const customers = useDataStore((state) => state.customers);
  const loading = useDataStore((state) => state.loading);
  const currency = useDataStore((state) => state.settings.currencySymbol || "EGP");
  const branchId = useBranchStore((state) => state.currentBranchId);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loyaltyUpdatingId, setLoyaltyUpdatingId] = useState<string | null>(null);

  const stats = useMemo(() => ({
    customers: customers.length,
    loyalty: customers.filter((customer) => customer.loyaltyEnabled).length,
    orders: customers.reduce((sum, customer) => sum + customer.totalOrders, 0),
    revenue: customers.reduce((sum, customer) => sum + customer.totalSpent, 0),
  }), [customers]);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return customers
      .filter((customer) => {
        if (filter === "loyalty" && !customer.loyaltyEnabled) return false;
        if (filter === "standard" && customer.loyaltyEnabled) return false;
        return !query || customer.name.toLocaleLowerCase().includes(query) || customer.phone.toLocaleLowerCase().includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, filter, search]);

  const openForm = (customer?: Customer) => {
    setEditingCustomer(customer ?? null);
    setName(customer?.name ?? "");
    setPhone(customer?.phone ?? "");
    setLoyaltyEnabled(customer?.loyaltyEnabled ?? false);
    setDialogOpen(true);
  };

  const closeForm = (open: boolean) => {
    if (saving) return;
    setDialogOpen(open);
    if (!open) setEditingCustomer(null);
  };

  const saveCustomer = async () => {
    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    if (!cleanName || !cleanPhone || !branchId) {
      toast(isArabic ? "أدخل اسم العميل ورقم الهاتف" : "Enter the customer name and phone number", "error");
      return;
    }

    const duplicate = customers.find((customer) => customer.phone.trim() === cleanPhone && customer.id !== editingCustomer?.id);
    if (duplicate) {
      toast(isArabic ? "رقم الهاتف مسجل لعميل آخر" : "This phone number already belongs to another customer", "error");
      return;
    }

    setSaving(true);
    try {
      if (editingCustomer) {
        const updated = await updateCustomer(editingCustomer.id, {
          name: cleanName,
          phone: cleanPhone,
          loyaltyEnabled,
        });
        useDataStore.setState((state) => ({
          customers: state.customers.map((customer) => customer.id === updated.id ? updated : customer),
        }));
        toast(isArabic ? "تم تحديث بيانات العميل" : "Customer updated", "success");
      } else {
        const created = await createCustomer({
          branchId,
          name: cleanName,
          phone: cleanPhone,
          loyaltyEnabled,
        });
        useDataStore.setState((state) => ({ customers: [...state.customers, created] }));
        toast(isArabic ? "تم إنشاء العميل" : "Customer created", "success");
      }
      setDialogOpen(false);
      setEditingCustomer(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : isArabic ? "تعذر حفظ بيانات العميل" : "Could not save customer", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleLoyalty = async (customer: Customer, enabled: boolean) => {
    setLoyaltyUpdatingId(customer.id);
    try {
      const updated = await updateCustomer(customer.id, { loyaltyEnabled: enabled });
      useDataStore.setState((state) => ({
        customers: state.customers.map((entry) => entry.id === updated.id ? updated : entry),
      }));
      toast(
        isArabic
          ? enabled ? `تم تفعيل الولاء لـ ${customer.name}` : `تم إيقاف الولاء لـ ${customer.name}`
          : enabled ? `Loyalty enabled for ${customer.name}` : `Loyalty disabled for ${customer.name}`,
        "success"
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : isArabic ? "تعذر تحديث إعداد الولاء" : "Could not update loyalty", "error");
    } finally {
      setLoyaltyUpdatingId(null);
    }
  };

  const filters: { id: CustomerFilter; label: string }[] = [
    { id: "all", label: isArabic ? "كل العملاء" : "All customers" },
    { id: "loyalty", label: isArabic ? "الولاء مفعّل" : "Loyalty on" },
    { id: "standard", label: isArabic ? "بدون ولاء" : "Loyalty off" },
  ];

  return (
    <AppShell title={isArabic ? "العملاء" : "Customers"}>
      <div className="space-y-5 p-4 pb-10 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm text-muted-foreground">
              {isArabic ? "ملفات العملاء، مشترياتهم، ونقاط الولاء في مكان واحد." : "Customer profiles, purchase history, and loyalty at a glance."}
            </p>
          </div>
          <Button onClick={() => openForm()}>
            <Plus className="h-4 w-4" />
            {isArabic ? "إضافة عميل" : "Add customer"}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard title={isArabic ? "إجمالي العملاء" : "Total customers"} value={formatNumber(stats.customers)} icon={Users} />
          <StatCard title={isArabic ? "عملاء الولاء" : "Loyalty members"} value={formatNumber(stats.loyalty)} icon={Crown} />
          <StatCard title={isArabic ? "الطلبات المرتبطة" : "Linked orders"} value={formatNumber(stats.orders)} icon={ShoppingBag} />
          <StatCard title={isArabic ? "إجمالي إنفاق العملاء" : "Customer spend"} value={formatMoney(stats.revenue, currency)} icon={Wallet} />
        </div>

        <Card>
          <CardHeader className="space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <CardTitle>{isArabic ? "قائمة العملاء" : "Customer list"}</CardTitle>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="ps-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={isArabic ? "ابحث بالاسم أو الهاتف" : "Search name or phone"}
                aria-label={isArabic ? "ابحث عن عميل" : "Search customers"}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {filters.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant={filter === item.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>

            {loading ? (
              <div className="flex min-h-44 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                {isArabic ? "جارٍ تحميل العملاء..." : "Loading customers..."}
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-center">
                <Users className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">{search || filter !== "all" ? (isArabic ? "لا توجد نتائج مطابقة" : "No matching customers") : (isArabic ? "لا يوجد عملاء بعد" : "No customers yet")}</p>
                {!search && filter === "all" && (
                  <Button size="sm" variant="outline" onClick={() => openForm()}>
                    <Plus className="h-4 w-4" />
                    {isArabic ? "أضف أول عميل" : "Add the first customer"}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCustomers.map((customer) => (
                  <div key={customer.id} className="grid gap-3 rounded-xl border border-border/80 p-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center sm:p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {customer.name.trim().slice(0, 1).toLocaleUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold">{customer.name}</p>
                          <Badge variant={customer.loyaltyEnabled ? "default" : "outline"} className="gap-1">
                            {customer.loyaltyEnabled && <Crown className="h-3 w-3" />}
                            {customer.loyaltyEnabled ? (isArabic ? "ولاء مفعّل" : "Loyalty on") : (isArabic ? "بدون ولاء" : "Standard")}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">{customer.phone}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">{isArabic ? "الطلبات" : "Orders"}</p>
                        <p className="mt-0.5 font-semibold">{formatNumber(customer.totalOrders)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{isArabic ? "الإنفاق" : "Spend"}</p>
                        <p className="mt-0.5 font-semibold">{formatMoney(customer.totalSpent, currency)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{isArabic ? "النقاط" : "Points"}</p>
                        <p className="mt-0.5 font-semibold">{formatNumber(customer.loyaltyPoints)}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t pt-2 sm:justify-end sm:border-0 sm:pt-0">
                      <div className="flex items-center gap-2" title={isArabic ? "تفعيل أو إيقاف الولاء" : "Enable or disable loyalty"}>
                        {loyaltyUpdatingId === customer.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                        <Label htmlFor={`loyalty-${customer.id}`} className="text-xs text-muted-foreground">
                          {isArabic ? "الولاء" : "Loyalty"}
                        </Label>
                        <Switch
                          id={`loyalty-${customer.id}`}
                          checked={customer.loyaltyEnabled}
                          disabled={loyaltyUpdatingId === customer.id}
                          onCheckedChange={(checked) => void toggleLoyalty(customer, checked)}
                          aria-label={isArabic ? `الولاء لـ ${customer.name}` : `Loyalty for ${customer.name}`}
                        />
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => openForm(customer)}>
                        <Pencil className="h-3.5 w-3.5" />
                        {isArabic ? "تعديل" : "Edit"}
                      </Button>
                    </div>

                    <p className="text-[11px] text-muted-foreground sm:col-span-3">
                      {isArabic ? "تاريخ التسجيل" : "Joined"}: {formatDate(customer.createdAt, locale)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={closeForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCustomer
                ? isArabic ? "تعديل بيانات العميل" : "Edit customer"
                : isArabic ? "إضافة عميل جديد" : "Add customer"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="customer-name">{isArabic ? "اسم العميل" : "Customer name"}</Label>
              <Input id="customer-name" className="mt-1.5" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
            </div>
            <div>
              <Label htmlFor="customer-phone">{isArabic ? "رقم الهاتف" : "Phone number"}</Label>
              <Input id="customer-phone" className="mt-1.5" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" dir="ltr" />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border p-3">
              <div>
                <Label htmlFor="customer-loyalty" className="flex items-center gap-2">
                  <BadgePercent className="h-4 w-4 text-primary" />
                  {isArabic ? "تفعيل برنامج الولاء" : "Enable loyalty program"}
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isArabic ? "يمكنك تغييره في أي وقت من ملف العميل." : "You can change this any time from the customer profile."}
                </p>
              </div>
              <Switch id="customer-loyalty" checked={loyaltyEnabled} onCheckedChange={setLoyaltyEnabled} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => closeForm(false)}>
              {isArabic ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void saveCustomer()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving
                ? isArabic ? "جارٍ الحفظ..." : "Saving..."
                : editingCustomer ? isArabic ? "حفظ التعديل" : "Save changes" : isArabic ? "إنشاء العميل" : "Create customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
