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

function activationCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = crypto.getRandomValues(new Uint8Array(16));
  const raw = Array.from(random, (byte) => alphabet[byte & 31]).join("");
  return { raw, formatted: raw.match(/.{1,4}/g)?.join("-") ?? raw };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed." });

  const platformUrl = Deno.env.get("SUPABASE_URL");
  const platformServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const posUrl = Deno.env.get("POS_SUPABASE_URL");
  const posPublishableKey = Deno.env.get("POS_SUPABASE_PUBLISHABLE_KEY");
  if (!platformUrl || !platformServiceKey || !posUrl || !posPublishableKey) {
    return reply(503, { error: "Device console is not configured." });
  }

  const accessToken = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!accessToken || accessToken === "legacy-desktop") return reply(401, { error: "Sign in as the shop owner to manage devices." });

  let body: { action?: unknown; accountNumber?: unknown; branchId?: unknown; deviceName?: unknown };
  try { body = await request.json(); } catch { return reply(400, { error: "Invalid request." }); }
  const action = body.action === "issue" ? "issue" : body.action === "list" ? "list" : null;
  const accountNumber = typeof body.accountNumber === "string" ? body.accountNumber.trim() : "";
  const branchId = typeof body.branchId === "string" ? body.branchId.trim() : "";
  const deviceName = typeof body.deviceName === "string" ? body.deviceName.trim().slice(0, 80) : "";
  if (!action || !/^\d{4}$/.test(accountNumber) || !branchId || (action === "issue" && !deviceName)) {
    return reply(400, { error: "Account, branch, and device details are required." });
  }

  const posUserClient = createClient(posUrl, posPublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: authData, error: authError } = await posUserClient.auth.getUser(accessToken);
  const ownerEmail = authData.user?.email?.trim().toLowerCase();
  if (authError || !authData.user || !ownerEmail) return reply(401, { error: "Your shop session has expired. Sign in again." });

  const { data: ownerRows, error: ownerError } = await posUserClient.rpc("authenticate_shop_owner", {
    p_account_number: accountNumber,
  });
  if (ownerError || !Array.isArray(ownerRows) || ownerRows.length === 0) {
    return reply(403, { error: "Only the owner of this business can manage cashier devices." });
  }
  const { data: branchAllowed, error: branchError } = await posUserClient.rpc("verify_shop_branch", {
    p_account_number: accountNumber,
    p_branch_id: branchId,
  });
  if (branchError || branchAllowed !== true) return reply(403, { error: "This branch is not assigned to the business account." });

  const platform = createClient(platformUrl, platformServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const projectRef = new URL(posUrl).hostname.split(".")[0];
  const { data: shop, error: shopError } = await platform
    .from("platform_shops")
    .select("id,owner_email,status,expires_at,device_limit")
    .eq("account_number", accountNumber)
    .eq("owner_email", ownerEmail)
    .eq("tenant_project_ref", projectRef)
    .is("archived_at", null)
    .maybeSingle();
  if (shopError || !shop) return reply(403, { error: "This business is not linked to the signed-in owner." });
  if (shop.status === "suspended" || (shop.expires_at && shop.expires_at < new Date().toISOString().slice(0, 10))) {
    return reply(403, { error: "The business subscription is inactive." });
  }

  const { data: licenses, error: licenseError } = await platform
    .from("platform_licenses")
    .select("id,branch_id,device_name,expires_at,consumed_at,created_at,device_uuid")
    .eq("shop_id", shop.id)
    .eq("license_type", "device")
    .order("created_at", { ascending: false })
    .limit(500);
  if (licenseError) return reply(503, { error: "Could not load device activation codes." });

  const { data: devices, error: deviceError } = await platform
    .from("platform_devices")
    .select("device_uuid,branch_id,device_name,activated_at,last_sync_at")
    .eq("shop_id", shop.id)
    .order("last_sync_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (deviceError) return reply(503, { error: "Could not load cashier device status." });

  const registeredDeviceIds = new Set([
    ...(licenses ?? []).filter((license) => license.consumed_at && license.device_uuid).map((license) => license.device_uuid as string),
    ...(devices ?? []).map((device) => device.device_uuid as string),
  ]);
  const pendingLicenses = (licenses ?? []).filter((license) =>
    !license.consumed_at && new Date(license.expires_at).getTime() > Date.now()
  );

  if (action === "list") {
    const branchLicenses = (licenses ?? []).filter((license) => license.branch_id === branchId);
    const branchDevices = (devices ?? []).filter((device) => device.branch_id === branchId);
    return reply(200, {
      licenses: branchLicenses,
      devices: branchDevices,
      deviceLimit: shop.device_limit,
      activeDeviceCount: registeredDeviceIds.size,
      pendingCodeCount: pendingLicenses.length,
    });
  }

  if (registeredDeviceIds.size + pendingLicenses.length >= shop.device_limit) {
    return reply(409, { error: "The business has reached its allowed number of cashier devices." });
  }

  const generated = activationCode();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: license, error: insertError } = await platform.rpc("platform_issue_device_license", {
    p_account_number: accountNumber,
    p_branch_id: branchId,
    p_code_digest: await sha256(generated.raw),
    p_device_name: deviceName,
    p_expires_at: expiresAt,
  });
  if (insertError?.message.toLowerCase().includes("device limit")) {
    return reply(409, { error: "The business has reached its allowed number of cashier devices." });
  }
  if (insertError?.message.toLowerCase().includes("subscription inactive")) {
    return reply(403, { error: "The business subscription is inactive." });
  }
  if (insertError || !license) return reply(503, { error: "Could not create an activation code." });

  await platform.from("platform_audit_log").insert({
    actor_email: ownerEmail,
    action: "device_activation_code_issued",
    entity_type: "platform_shop",
    entity_id: shop.id,
    details: { branch_id: branchId, license_id: license.id },
  });

  return reply(200, {
    license,
    code: generated.formatted,
    deviceLimit: license.deviceLimit,
    activeDeviceCount: license.activeDeviceCount,
    pendingCodeCount: license.pendingCodeCount,
  });
});
