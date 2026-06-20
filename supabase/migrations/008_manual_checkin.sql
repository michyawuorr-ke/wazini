-- KinyoziOS / Wazini — manual check-in
--
-- WHY THIS EXISTS: customers walking into a barbershop frequently have
-- no mobile data or WiFi at all — a real, common constraint, not an
-- edge case. There is no web-technology fix for "the customer's phone
-- has zero connectivity" (a browser cannot load a page it has no path
-- to reach). The fix is structural: let the BARBER's phone (which is
-- more likely to have a working connection, being the shop's own
-- business tool) create the session directly, bypassing the customer
-- web check-in entirely when needed.
--
-- This does not replace the web check-in — it's a parallel entry
-- point into the exact same session/customer model, so everything
-- downstream (matching engine, verification, revenue tracking,
-- financial signal layer) works identically regardless of which path
-- created the session.

create or replace function manual_checkin(
  p_shop_id uuid,
  p_customer_phone text,
  p_customer_name text,
  p_service_name text,
  p_amount_expected integer,
  p_payment_type text,
  p_payment_number text,
  p_paybill_account text,
  p_session_code text
) returns uuid
language plpgsql
security definer
as $$
declare
  v_customer_id uuid;
  v_session_id uuid;
  v_existing_open_session uuid;
begin
  -- Find or create the customer (same UNIQUE(shop_id, phone) identity
  -- rule as the web check-in path — phone is the identity key
  -- regardless of which entry point created the customer).
  select id into v_customer_id
  from customer
  where shop_id = p_shop_id and phone = p_customer_phone;

  if v_customer_id is null then
    insert into customer (shop_id, phone, name)
    values (p_shop_id, p_customer_phone, p_customer_name)
    returning id into v_customer_id;
  end if;

  -- Enforce the same "single open session per customer" rule the web
  -- path relies on (also backed by the partial unique index in
  -- 001_core_schema.sql — this check gives a clean error message
  -- instead of a raw constraint-violation error reaching the barber).
  select id into v_existing_open_session
  from session
  where customer_id = v_customer_id
    and status in ('CREATED', 'AWAITING_PAYMENT');

  if v_existing_open_session is not null then
    -- Idempotency for offline replay: if this exact open session
    -- already exists, treat a duplicate manual_checkin call as a
    -- success returning the existing session, rather than erroring.
    -- This matters because the offline queue may replay this action
    -- more than once if the app restarts mid-sync.
    return v_existing_open_session;
  end if;

  insert into session (
    shop_id, customer_id, service_name, amount_expected, status,
    session_code, payment_type, payment_number, paybill_account
  )
  values (
    p_shop_id, v_customer_id, p_service_name, p_amount_expected, 'AWAITING_PAYMENT',
    p_session_code, p_payment_type, p_payment_number, p_paybill_account
  )
  returning id into v_session_id;

  return v_session_id;
end;
$$;
