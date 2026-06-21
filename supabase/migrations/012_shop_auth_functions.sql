-- KinyoziOS / Wazini — shop creation, invite, and join functions
--
-- These mirror the atomicity discipline established in 002_functions.sql
-- (verify_session/void_session): each function performs multiple related
-- writes that must succeed or fail together, never partially.

-- create_shop_with_owner: called once, when a new owner signs up and
-- sets up their shop for the first time. Creates the shop AND the
-- owner's shop_member row atomically — a shop without an owner, or an
-- owner row without a shop, should never be possible to create.
create or replace function create_shop_with_owner(
  p_shop_name text,
  p_shop_slug text,
  p_payment_type text,
  p_payment_number text,
  p_paybill_account text
) returns uuid
language plpgsql
security definer
as $$
declare
  v_shop_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to create a shop';
  end if;

  insert into shop (name, slug, payment_type, payment_number, paybill_account)
  values (p_shop_name, p_shop_slug, p_payment_type, p_payment_number, p_paybill_account)
  returning id into v_shop_id;

  insert into shop_member (shop_id, user_id, role)
  values (v_shop_id, auth.uid(), 'owner');

  return v_shop_id;
end;
$$;

-- generate_invite_code: owner-only (enforced by the RLS insert policy
-- on shop_invite_code, but double-checked here too since this function
-- runs as security definer and bypasses RLS internally). Generates a
-- short, readable 6-character code rather than reusing the shop's UUID.
create or replace function generate_invite_code(
  p_shop_id uuid
) returns text
language plpgsql
security definer
as $$
declare
  v_code text;
  v_is_owner boolean;
begin
  select exists(
    select 1 from shop_member
    where shop_id = p_shop_id and user_id = auth.uid() and role = 'owner'
  ) into v_is_owner;

  if not v_is_owner then
    raise exception 'Only the shop owner can generate invite codes';
  end if;

  -- 6 uppercase alphanumeric characters — short enough to read aloud
  -- or type on a barber's phone, long enough to not collide in
  -- practice at this scale. Retries on the rare collision.
  loop
    v_code := upper(substring(md5(random()::text) from 1 for 6));
    exit when not exists (select 1 from shop_invite_code where code = v_code and used_at is null);
  end loop;

  insert into shop_invite_code (shop_id, code, created_by)
  values (p_shop_id, v_code, auth.uid());

  return v_code;
end;
$$;

-- redeem_invite_code: called when a barber, after signing up via phone
-- OTP, enters the code their shop owner gave them. Validates the code
-- (exists, not expired, not already used) and creates the barber's
-- shop_member row atomically with marking the code used — prevents a
-- race where two people redeem the same single-use code simultaneously.
create or replace function redeem_invite_code(
  p_code text
) returns uuid
language plpgsql
security definer
as $$
declare
  v_invite shop_invite_code%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to redeem an invite code';
  end if;

  select * into v_invite
  from shop_invite_code
  where code = upper(p_code)
  for update; -- lock the row to prevent a concurrent double-redemption race

  if not found then
    raise exception 'Invite code not found';
  end if;

  if v_invite.used_at is not null then
    raise exception 'This invite code has already been used';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'This invite code has expired';
  end if;

  if exists (
    select 1 from shop_member
    where shop_id = v_invite.shop_id and user_id = auth.uid()
  ) then
    raise exception 'You are already a member of this shop';
  end if;

  insert into shop_member (shop_id, user_id, role, invited_by)
  values (v_invite.shop_id, auth.uid(), 'barber', v_invite.created_by);

  update shop_invite_code
  set used_at = now(), used_by = auth.uid()
  where id = v_invite.id;

  return v_invite.shop_id;
end;
$$;

-- get_my_shop: convenience function the app calls on launch to find out
-- which shop(s) the current authenticated user belongs to, and their
-- role. Replaces the old "manually paste a shop UUID" Setup screen flow
-- entirely — identity now determines shop access, not a typed-in UUID.
create or replace function get_my_shops()
returns table (shop_id uuid, shop_name text, role text)
language sql
security definer
stable
as $$
  select s.id, s.name, sm.role
  from shop_member sm
  join shop s on s.id = sm.shop_id
  where sm.user_id = auth.uid();
$$;
