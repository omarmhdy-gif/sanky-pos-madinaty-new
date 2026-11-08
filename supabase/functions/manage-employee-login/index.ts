import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedPermissions = new Set([
  "pos.view", "orders.view", "inventory.view", "purchases.view", "products.view", "finance.view",
  "reports.view", "attendance.view", "employees.view", "customers.view", "settings.view", "dashboard.view", "recipes.view",
  "pos.sell", "pos.apply_discount", "pos.change_price", "pos.manage_shifts", "orders.void", "orders.refund",
  "inventory.create", "inventory.edit", "inventory.delete", "inventory.receive", "inventory.adjust", "inventory.manufacture", "inventory.quality",
  "purchases.create", "purchases.delete", "products.create", "products.edit", "products.delete", "products.manage_recipe",
  "finance.create", "finance.edit", "finance.delete", "reports.export", "attendance.create", "attendance.edit", "attendance.delete",
  "attendance.clock_in", "attendance.clock_out", "employees.create", "employees.edit", "employees.delete", "employees.manage_permissions",
  "customers.create", "customers.edit", "settings.edit_general", "settings.edit_receipt", "settings.edit_payments", "settings.edit_dining",
  "settings.edit_loyalty", "settings.edit_shifts",
]);
const allowedColors = new Set(["bg-espresso-600", "bg-amber-600", "bg-emerald-600", "bg-sky-600", "bg-pink-600", "bg-violet-600"]);

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });

  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token) return reply(401, { error: "Sign in again before managing employee access." });
  if (!url || !anonKey || !serviceKey) return reply(503, { error: "Employee account service is not configured." });

  let body: Record<string, any>;
  try { body = await request.json(); } catch { return reply(400, { error: "Invalid employee request." }); }
  const accountNumber = typeof body.accountNumber === "string" ? body.accountNumber.trim() : "";
  const branchId = typeof body.branchId === "string" ? body.branchId.trim() : "";
  const employee = body.employee && typeof body.employee === "object" ? body.employee : {};
  const requestedId = typeof employee.id === "string" && employee.id ? employee.id : null;
  const employeeId = requestedId ?? `staff_${crypto.randomUUID()}`;
  const name = typeof employee.name === "string" ? employee.name.trim() : "";
  const pin = typeof employee.pin === "string" && employee.pin.length ? employee.pin : null;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const permissions = Array.isArray(employee.permissions) ? employee.permissions : null;
  const avatarColor = typeof employee.avatarColor === "string" ? employee.avatarColor : "";

  if (!/^\d{4}$/.test(accountNumber) || !branchId || branchId.length > 120 || !name || name.length > 100 ||
      (pin !== null && !/^\d{4}$/.test(pin)) || !permissions || permissions.some((key: unknown) => typeof key !== "string" || !allowedPermissions.has(key)) ||
      !allowedColors.has(avatarColor) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
      (password && (password.length < 8 || password.length > 128))) {
    return reply(400, { error: "Check the employee name, PIN, email, password and selected permissions." });
  }

  const actorClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: actorData, error: actorError } = await actorClient.auth.getUser(token);
  if (actorError || !actorData.user) return reply(401, { error: "Sign in again before managing employee access." });

  const action = requestedId ? "edit" : "create";
  const { data: authorized, error: authorizationError } = await actorClient.rpc("authorize_employee_console_change", {
    p_account_number: accountNumber,
    p_branch_id: branchId,
    p_action: action,
    p_staff_id: employeeId,
    p_permissions: permissions,
  });
  if (authorizationError || authorized !== true) return reply(403, { error: "You do not have permission to manage this employee in this business and branch." });

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let old: { auth_user_id: string | null; login_email: string | null; branch_id: string } | null = null;
  if (requestedId) {
    const { data, error } = await service.from("staff").select("auth_user_id,login_email,branch_id").eq("id", requestedId).maybeSingle();
    if (error) return reply(500, { error: "Could not load the existing employee account." });
    old = data;
    if (!old || old.branch_id !== branchId) return reply(404, { error: "Employee account was not found in this branch." });
  }

  let authUserId = old?.auth_user_id ?? null;
  let loginEmail = email || old?.login_email || "";
  let createdAuthUserId: string | null = null;
  if (!authUserId) {
    if (!email || !password) return reply(400, { error: "Creating email/password access requires both fields." });
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { account_number: accountNumber, branch_id: branchId, role: "employee" },
    });
    if (error || !data.user) return reply(400, { error: error?.message ?? "Could not create the employee login." });
    authUserId = data.user.id;
    loginEmail = data.user.email ?? email;
    createdAuthUserId = data.user.id;
  } else if (email || password) {
    const attributes: { email?: string; email_confirm?: boolean; password?: string } = {};
    if (email) { attributes.email = email; attributes.email_confirm = true; }
    if (password) attributes.password = password;
    const { data, error } = await service.auth.admin.updateUserById(authUserId, attributes);
    if (error || !data.user) return reply(400, { error: error?.message ?? "Could not update the employee login." });
    loginEmail = data.user.email ?? loginEmail;
  }

  const { data: saved, error: saveError } = await service.rpc("save_console_employee", {
    p_id: employeeId,
    p_branch_id: branchId,
    p_name: name,
    p_pin: pin,
    p_avatar_color: avatarColor,
    p_is_active: employee.isActive !== false,
    p_permissions: permissions,
    p_auth_user_id: authUserId,
    p_login_email: loginEmail,
  });
  if (saveError || !saved) {
    if (createdAuthUserId) {
      const { error: cleanupError } = await service.auth.admin.deleteUser(createdAuthUserId);
      if (cleanupError) console.error("Could not clean up incomplete employee Auth user.", cleanupError.message);
    }
    console.error("Employee account save failed.", saveError?.message ?? "empty RPC result");
    return reply(500, { error: "Could not save the employee profile and access." });
  }
  return reply(200, { employee: saved });
});
