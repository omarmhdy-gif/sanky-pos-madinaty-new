-- Authenticate directly by a four-digit PIN. Never return PIN hashes to the client.
create or replace function authenticate_staff_pin(p_pin text, p_branch_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff staff%rowtype;
  v_staff_json jsonb;
  v_matches integer;
begin
  if p_pin !~ '^[0-9]{4}$' then
    return null;
  end if;

  select count(*) into v_matches
  from staff
  where branch_id = p_branch_id
    and is_active = true
    and pin_hash is not null
    and pin_hash = crypt(p_pin, pin_hash);

  -- Ambiguous PINs must never sign in as an arbitrary employee.
  if v_matches <> 1 then
    return null;
  end if;

  select * into v_staff
  from staff
  where branch_id = p_branch_id
    and is_active = true
    and pin_hash = crypt(p_pin, pin_hash)
  limit 1;

  v_staff_json := to_jsonb(v_staff);

  return jsonb_build_object(
    'id', v_staff.id,
    'branchId', v_staff.branch_id,
    'name', v_staff.name,
    'role', v_staff.role,
    'avatarColor', v_staff.avatar_color,
    'isActive', v_staff.is_active,
    'permissions', v_staff_json -> 'permissions'
  );
end;
$$;

revoke all on function authenticate_staff_pin(text, text) from public;
grant execute on function authenticate_staff_pin(text, text) to anon, authenticated;
