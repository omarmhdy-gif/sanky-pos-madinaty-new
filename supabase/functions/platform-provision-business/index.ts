import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PLATFORM_URL = "https://nacmgkdfkddfsdpqjang.supabase.co";
const PLATFORM_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hY21na2Rma2RkZnNkcHFqYW5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4Mzc0ODQsImV4cCI6MjEwODQxMzQ4NH0.J-XDBUFRDMVsq0O6d9r_A6AqhtEmHEpABbteLx1OhCw";
const allowedPlans = new Set(["starter", "growth", "premium"]);
const allowedModules = new Set(["pos", "orders", "reports", "delivery", "hr", "inventory", "loyalty", "finance", "tables"]);

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });
  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return reply(401, { error: "Sign in as a platform administrator." });

  const posUrl = Deno.env.get("SUPABASE_URL");
  const posServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!posUrl || !posServiceKey) return reply(503, { error: "إعداد خدمة إنشاء البيزنس غير مكتمل." });

  const platformUser = createClient(PLATFORM_URL, PLATFORM_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await platformUser.auth.getUser(token);
  if (userError || !userData.user) return reply(401, { error: "انتهت جلسة الدخول. سجّل دخول مالك المنصة مرة أخرى." });
  const { data: authorized, error: permissionError } = await platformUser.rpc("platform_admin_is_allowed");
  if (permissionError || authorized !== true) return reply(403, { error: "هذا الحساب غير مخوّل لإنشاء بيزنس." });

  let body: { action?: unknown; shopId?: unknown; accountNumber?: unknown; name?: unknown; ownerEmail?: unknown; initialPassword?: unknown; };
  try { body = await request.json(); } catch { return reply(400, { error: "Invalid request." }); }
  const service = createClient(posUrl, posServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  if (body.action === "cleanup") {
    const branchId = typeof body.branchId === "string" ? body.branchId : "";
    const ownerUserId = typeof body.ownerUserId === "string" ? body.ownerUserId : "";
    let failed = false;
    if (branchId) {
      const { error } = await service.rpc("deprovision_empty_platform_business", { p_branch_id: branchId });
      if (error) failed = true;
    }
    if (ownerUserId) {
      const { error } = await service.auth.admin.deleteUser(ownerUserId);
      if (error) failed = true;
    }
    return failed ? reply(500, { error: "Business cleanup was incomplete." }) : reply(200, { ok: true });
  }

  const shopId = typeof body.shopId === "string" ? body.shopId : "";
  const accountNumber = typeof body.accountNumber === "string" ? body.accountNumber.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const ownerEmail = typeof body.ownerEmail === "string" ? body.ownerEmail.trim().toLowerCase() : "";
  const initialPassword = typeof body.initialPassword === "string" ? body.initialPassword : "";
  if (!/^[0-9a-f-]{36}$/i.test(shopId) || !/^\d{4}$/.test(accountNumber) || !name || name.length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) || initialPassword.length < 8 || initialPassword.length > 128) {
    return reply(400, { error: "بيانات البيزنس غير صالحة." });
  }

  let ownerUserId: string | null = null;
  try {
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: ownerEmail, password: initialPassword, email_confirm: true,
      user_metadata: { account_number: accountNumber, shop_name: name, role: "owner" },
    });
    if (createError || !created.user) throw createError ?? new Error("Owner creation failed.");
    ownerUserId = created.user.id;

    const { data: provisioned, error: provisionError } = await service.rpc("provision_platform_business", {
      p_platform_shop_id: shopId,
      p_account_number: accountNumber,
      p_shop_name: name,
      p_owner_email: ownerEmail,
    });
    if (provisionError || !provisioned || typeof provisioned.branchId !== "string") throw provisionError ?? new Error("Branch creation failed.");

    return reply(200, { branchId: provisioned.branchId, ownerUserId });
  } catch (error) {
    if (ownerUserId) {
      const { error: cleanupError } = await service.auth.admin.deleteUser(ownerUserId);
      if (cleanupError) console.error("Owner cleanup failed.", cleanupError.message);
    }
    console.error("Business branch provisioning failed.", error instanceof Error ? error.message : "unknown error");
    return reply(500, { error: "تعذر إنشاء فرع البيزنس الفارغ في قاعدة المحل." });
  }
});
