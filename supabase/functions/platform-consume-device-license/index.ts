import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });

  const centralUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!centralUrl || !serviceKey) return reply(503, { error: "Activation service is not configured." });

  let body: { accountNumber?: unknown; code?: unknown; deviceUuid?: unknown };
  try { body = await request.json(); } catch { return reply(400, { error: "Invalid request." }); }
  const accountNumber = typeof body.accountNumber === "string" ? body.accountNumber.trim() : "";
  const rawCode = typeof body.code === "string" ? body.code.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  const deviceUuid = typeof body.deviceUuid === "string" ? body.deviceUuid : "";
  if (!/^\d{4}$/.test(accountNumber) || !/^[A-Z2-9]{16}$/.test(rawCode) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceUuid)) {
    return reply(400, { error: "رقم الحساب أو كود التفعيل غير صحيح." });
  }

  const admin = createClient(centralUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const digest = await sha256(rawCode);
  const { data: claimedAccount, error: claimError } = await admin.rpc("platform_claim_device_license", {
    p_account_number: accountNumber,
    p_code_digest: digest,
    p_device_uuid: deviceUuid,
  });
  if (claimError) {
    const message = claimError.message.toLowerCase();
    if (message.includes("device limit")) return reply(403, { error: "تم الوصول إلى عدد الأجهزة المسموح به لهذا البيزنس." });
    if (message.includes("subscription inactive")) return reply(403, { error: "اشتراك هذا المحل غير نشط." });
    if (message.includes("already used")) return reply(409, { error: "تم استخدام كود التفعيل على جهاز آخر." });
    if (message.includes("expired")) return reply(400, { error: "انتهت صلاحية كود التفعيل." });
    if (message.includes("invalid activation code")) return reply(400, { error: "الكود غير صالح أو لا يطابق رقم الحساب." });
    console.error("Device license claim failed.", claimError.message);
    return reply(503, { error: "تعذر إكمال تفعيل الكود حاليًا." });
  }
  if (claimedAccount !== accountNumber) return reply(403, { error: "تعذر ربط كود التفعيل بحساب المحل." });

  return reply(200, { accountNumber: claimedAccount });
});
