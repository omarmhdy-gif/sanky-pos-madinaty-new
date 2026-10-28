import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PLATFORM_URL = "https://nacmgkdfkddfsdpqjang.supabase.co";
const PLATFORM_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hY21na2Rma2RkZnNkcHFqYW5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4Mzc0ODQsImV4cCI6MjEwODQxMzQ4NH0.J-XDBUFRDMVsq0O6d9r_A6AqhtEmHEpABbteLx1OhCw";

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  return "S!" + Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });

  const posUrl = Deno.env.get("SUPABASE_URL");
  const posAnon = Deno.env.get("SUPABASE_ANON_KEY");
  const posService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!posUrl || !posAnon || !posService) return reply(503, { error: "Device activation is not configured." });

  let body: { accountNumber?: unknown; code?: unknown; deviceUuid?: unknown; deviceName?: unknown };
  try { body = await request.json(); } catch { return reply(400, { error: "Invalid request." }); }
  const accountNumber = typeof body.accountNumber === "string" ? body.accountNumber.trim() : "";
  const code = typeof body.code === "string" ? body.code : "";
  const deviceUuid = typeof body.deviceUuid === "string" ? body.deviceUuid : "";
  const deviceName = typeof body.deviceName === "string" ? body.deviceName.trim().slice(0, 80) : "";
  if (!/^\d{4}$/.test(accountNumber) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceUuid)) {
    return reply(400, { error: "رقم الحساب أو معرّف الجهاز غير صحيح." });
  }

  const claimResponse = await fetch(`${PLATFORM_URL}/functions/v1/platform-consume-device-license`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: PLATFORM_ANON_KEY, Authorization: `Bearer ${PLATFORM_ANON_KEY}` },
    body: JSON.stringify({ accountNumber, code, deviceUuid }),
  });
  const claimBody = await claimResponse.json().catch(() => ({}));
  if (!claimResponse.ok) return reply(claimResponse.status, { error: typeof claimBody.error === "string" ? claimBody.error : "كود التفعيل غير صالح." });

  const service = createClient(posUrl, posService, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const auth = createClient(posUrl, posAnon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const email = `device-${deviceUuid}@devices.sanky.invalid`;
  const password = randomPassword();
  let authUserId: string | null = null;
  try {
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        account_number: accountNumber,
        device_uuid: deviceUuid,
        device_name: deviceName || `Cashier ${deviceUuid.slice(0, 8)}`,
        role: "cashier_device",
      },
    });
    if (createError || !created.user) throw createError ?? new Error("Could not create device identity.");
    authUserId = created.user.id;

    const { data: branchId, error: registrationError } = await service.rpc("register_shop_device", {
      p_account_number: accountNumber,
      p_device_uuid: deviceUuid,
      p_auth_user_id: authUserId,
    });
    if (registrationError || typeof branchId !== "string") throw registrationError ?? new Error("Could not bind device to a branch.");

    const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email, password });
    if (signInError || !signedIn.session) throw signInError ?? new Error("Could not create device session.");

    return reply(200, {
      branchId,
      accessToken: signedIn.session.access_token,
      refreshToken: signedIn.session.refresh_token,
    });
  } catch (error) {
    if (authUserId) {
      const { error: cleanupError } = await service.auth.admin.deleteUser(authUserId);
      if (cleanupError) console.error("Failed to clean up an incomplete device activation.", cleanupError.message);
    }
    console.error("Device activation failed.", error instanceof Error ? error.message : "unknown error");
    return reply(500, { error: "تعذر ربط الجهاز. أنشئ كود تفعيل جديدًا من لوحة التحكم وحاول مرة أخرى." });
  }
});
