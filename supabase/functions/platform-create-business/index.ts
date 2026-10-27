import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const POS_URL = "https://cgrlbieeharxkaigtidc.supabase.co";
const POS_PUBLISHABLE_KEY = "sb_publishable_p6XoasXuWJlHIJkCdJ3W6w_yolLhNJU";
const allowedPlans = new Set(["starter", "growth", "premium"]);
const allowedModules = new Set(["pos", "orders", "reports", "delivery", "hr", "inventory", "loyalty", "finance", "tables"]);

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!bearer) return reply(401, { error: "سجّل الدخول كمالك للمنصة." });

  const platformUrl = Deno.env.get("SUPABASE_URL");
  const platformAnon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!platformUrl || !platformAnon) return reply(503, { error: "إعداد قاعدة الإدارة غير مكتمل." });
  const admin = createClient(platformUrl, platformAnon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(bearer);
  if (userError || !userData.user) return reply(401, { error: "انتهت جلسة الدخول. سجّل الدخول مرة أخرى." });
  const { data: allowed, error: permissionError } = await admin.rpc("platform_admin_is_allowed");
  if (permissionError || allowed !== true) return reply(403, { error: "الحساب غير مخوّل لإنشاء بيزنس." });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply(400, { error: "بيانات الطلب غير صالحة." }); }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const ownerEmail = typeof body.ownerEmail === "string" ? body.ownerEmail.trim().toLowerCase() : "";
  const initialPassword = typeof body.initialPassword === "string" ? body.initialPassword : "";
  const plan = typeof body.plan === "string" ? body.plan : "";
  const modules = Array.isArray(body.modules) ? body.modules.filter((value): value is string => typeof value === "string") : [];
  const monthlyFee = body.monthlyFee === null ? null : Number(body.monthlyFee);
  const branchLimit = Number(body.branchLimit);
  const deviceLimit = Number(body.deviceLimit);
  const expiresAt = body.expiresAt === null || body.expiresAt === "" ? null : String(body.expiresAt);
  if (!name || name.length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) ||
      initialPassword.length < 8 || initialPassword.length > 128 ||
      !allowedPlans.has(plan) || modules.length === 0 || modules.some((module) => !allowedModules.has(module)) ||
      !Number.isInteger(branchLimit) || branchLimit < 1 || branchLimit > 500 ||
      !Number.isInteger(deviceLimit) || deviceLimit < 1 || deviceLimit > 500 ||
      (monthlyFee !== null && (!Number.isFinite(monthlyFee) || monthlyFee < 0)) ||
      (expiresAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt))) {
    return reply(400, { error: "راجع اسم المحل والبريد وكلمة المرور والباقة والحدود." });
  }

  const { data: shop, error: createError } = await admin.rpc("platform_create_shop", {
    p_name: name,
    p_owner_email: ownerEmail,
    p_plan: plan,
    p_modules: [...new Set(modules)],
    p_monthly_fee: monthlyFee,
    p_branch_limit: branchLimit,
    p_device_limit: deviceLimit,
    p_expires_at: expiresAt,
  });
  if (createError || !shop || typeof shop.id !== "string") {
    console.error("Central shop creation failed.", createError?.message ?? "missing shop row");
    return reply(500, { error: "تعذر إنشاء سجل البيزنس في لوحة الإدارة." });
  }

  const posResponse = await fetch(`${POS_URL}/functions/v1/platform-provision-business`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: POS_PUBLISHABLE_KEY,
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({
      shopId: shop.id,
      accountNumber: shop.account_number,
      name,
      ownerEmail,
      initialPassword,
    }),
  });
  const posResult = await posResponse.json().catch(() => ({}));
  if (!posResponse.ok) {
    const { error: cleanupError } = await admin.from("platform_shops").delete().eq("id", shop.id);
    if (cleanupError) console.error("Could not roll back the empty platform shop row.", cleanupError.message);
    console.error("POS business provisioning failed.", typeof posResult.error === "string" ? posResult.error : posResponse.status);
    return reply(posResponse.status >= 400 && posResponse.status < 500 ? posResponse.status : 502, {
      error: typeof posResult.error === "string" ? posResult.error : "تعذر تجهيز قاعدة البيزنس. لم يتم إنشاء الحساب.",
    });
  }

  const { data: updated, error: updateError } = await admin
    .from("platform_shops")
    .update({ tenant_project_ref: "cgrlbieeharxkaigtidc" })
    .eq("id", shop.id)
    .select("*")
    .single();
  if (updateError || !updated) {
    const cleanupResponse = await fetch(`${POS_URL}/functions/v1/platform-provision-business`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: POS_PUBLISHABLE_KEY,
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({ action: "cleanup", branchId: posResult.branchId, ownerUserId: posResult.ownerUserId }),
    });
    if (!cleanupResponse.ok) console.error("POS compensation cleanup failed.", cleanupResponse.status);
    const { error: rowCleanupError } = await admin.from("platform_shops").delete().eq("id", shop.id);
    if (rowCleanupError) console.error("Central compensation cleanup failed.", rowCleanupError.message);
    return reply(500, { error: "تعذر إكمال ربط البيزنس؛ تم التراجع عن الإنشاء." });
  }

  return reply(200, { shop: updated });
});
