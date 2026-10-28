import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const POS_SUPABASE_URL = "https://cgrlbieeharxkaigtidc.supabase.co";
const POS_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_p6XoasXuWJlHIJkCdJ3W6w_yolLhNJU";

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });

  const centralUrl = Deno.env.get("SUPABASE_URL");
  const centralServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const posUrl = POS_SUPABASE_URL;
  const posAnonKey = POS_SUPABASE_PUBLISHABLE_KEY;
  if (!centralUrl || !centralServiceKey) {
    console.error("License lookup configuration is incomplete.");
    return reply(503, { error: "Subscription lookup is not configured." });
  }

  let body: { accountNumber?: unknown };
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: "Invalid JSON body." });
  }
  const accountNumber = typeof body.accountNumber === "string" ? body.accountNumber.trim() : "";
  if (!/^\d{4}$/.test(accountNumber)) return reply(400, { error: "Invalid account number." });

  const expectedProjectRef = new URL(posUrl).hostname.split(".")[0];
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  let ownerEmail: string | null = null;
  let validDeviceSession = false;
  let deviceIdentity: { uuid: string; name: string } | null = null;

  if (bearer && bearer !== "legacy-desktop") {
    const posUserClient = createClient(posUrl, posAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: authData, error: authError } = await posUserClient.auth.getUser(bearer);
    if (authError || !authData.user?.email) return reply(401, { error: "Invalid POS session." });
    const { data: deviceValid, error: deviceError } = await posUserClient.rpc("verify_shop_device_session", {
      p_account_number: accountNumber,
    });
    validDeviceSession = !deviceError && deviceValid === true;
    if (validDeviceSession) {
      const metadata = authData.user.user_metadata ?? {};
      const uuid = typeof metadata.device_uuid === "string" ? metadata.device_uuid : "";
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
        const name = typeof metadata.device_name === "string" ? metadata.device_name.trim().slice(0, 80) : "";
        deviceIdentity = { uuid, name: name || `Cashier ${uuid.slice(0, 8)}` };
      }
    }
    if (!validDeviceSession) {
      const { data: ownerRows, error: ownerError } = await posUserClient.rpc("authenticate_shop_owner", {
        p_account_number: accountNumber,
      });
      if (ownerError || !ownerRows || (Array.isArray(ownerRows) && ownerRows.length === 0)) {
        return reply(403, { error: "Account does not match the signed-in owner or activated device." });
      }
      ownerEmail = authData.user.email.trim().toLowerCase();
    }
  } else if (accountNumber !== "0000") {
    // Only the historical Madinaty desktop cashier has no POS Auth session.
    return reply(401, { error: "Sign in to the business account before checking its subscription." });
  }

  const centralService = createClient(centralUrl, centralServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let query = centralService
    .from("platform_shops")
    .select("id, status, expires_at")
    .eq("account_number", accountNumber)
    .eq("tenant_project_ref", expectedProjectRef)
    .is("archived_at", null);
  if (ownerEmail) query = query.eq("owner_email", ownerEmail);
  else if (!validDeviceSession && accountNumber !== "0000") return reply(401, { error: "Sign in to the business account before checking its subscription." });
  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("Subscription lookup failed.", error.message);
    return reply(503, { error: "Subscription lookup is temporarily unavailable." });
  }
  if (!data) return reply(404, { error: "Business subscription was not found." });

  if (validDeviceSession && deviceIdentity) {
    const { error: heartbeatError } = await centralService.from("platform_devices").upsert({
      shop_id: data.id,
      device_uuid: deviceIdentity.uuid,
      device_name: deviceIdentity.name,
      last_sync_at: new Date().toISOString(),
    }, { onConflict: "shop_id,device_uuid" });
    if (heartbeatError) console.error("Device sync heartbeat could not be saved.", heartbeatError.message);
  }
  return reply(200, { status: data.status, expiresAt: data.expires_at });
});
