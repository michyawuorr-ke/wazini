-- KinyoziOS / Wazini — atomic state-transition functions
--
-- Why these exist as DB functions and not chained client-side writes:
-- a session verification touches THREE tables (session, revenue_entry,
-- customer) that must change together or not at all. A client that
-- updates session, then loses connectivity before inserting
-- revenue_entry, leaves a VERIFIED session with no matching revenue —
-- silently breaking the integrity guarantee in SPEC.md ("Total revenue
-- shown anywhere must always equal SUM(revenue_entry.amount)..."). 
-- Wrapping all three writes in a single plpgsql function makes the
-- whole operation atomic: it either fully succeeds or fully rolls back.

create or replace function verify_session(
  p_session_id uuid,
  p_payment_mode text,
  p_amount_paid integer,
  p_mpesa_code text,
  p_verification_source text
) returns void
language plpgsql
security definer
as $$
declare
  v_session session%rowtype;
begin
  select * into v_session from session where id = p_session_id for update;

  if not found then
    raise exception 'Session % not found', p_session_id;
  end if;

  if v_session.status not in ('CREATED', 'AWAITING_PAYMENT') then
    raise exception 'Session % is in status %, cannot verify', p_session_id, v_session.status;
  end if;

  update session
  set
    status = 'VERIFIED',
    payment_mode = p_payment_mode,
    amount_paid = p_amount_paid,
    mpesa_code = p_mpesa_code,
    verification_source = p_verification_source,
    verified_at = now()
  where id = p_session_id;

  insert into revenue_entry (shop_id, session_id, customer_id, amount, payment_mode, is_reversal)
  values (v_session.shop_id, v_session.id, v_session.customer_id, p_amount_paid, p_payment_mode, false);

  update customer
  set
    visit_count = visit_count + 1,
    lifetime_value = lifetime_value + p_amount_paid,
    last_visit_at = now()
  where id = v_session.customer_id;
end;
$$;

-- void_session: the correction mechanism for a mistaken VERIFIED session.
-- Per SPEC.md, verified sessions are immutable — this does NOT edit the
-- original session or revenue_entry. It marks the session VOIDED and
-- inserts a negative offsetting revenue_entry (is_reversal = true), and
-- rolls back the customer's denormalized counters to match. History
-- stays intact and auditable; nothing is overwritten.
create or replace function void_session(
  p_session_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
as $$
declare
  v_session session%rowtype;
  v_revenue revenue_entry%rowtype;
begin
  select * into v_session from session where id = p_session_id for update;

  if not found then
    raise exception 'Session % not found', p_session_id;
  end if;

  if v_session.status != 'VERIFIED' then
    raise exception 'Only VERIFIED sessions can be voided (session % is %)', p_session_id, v_session.status;
  end if;

  select * into v_revenue from revenue_entry where session_id = p_session_id;

  update session
  set status = 'VOIDED', voided_at = now(), void_reason = p_reason
  where id = p_session_id;

  if found then
    insert into revenue_entry (shop_id, session_id, customer_id, amount, payment_mode, is_reversal)
    values (v_session.shop_id, v_session.id, v_session.customer_id, -v_revenue.amount, v_revenue.payment_mode, true);

    update customer
    set
      visit_count = greatest(visit_count - 1, 0),
      lifetime_value = greatest(lifetime_value - v_revenue.amount, 0)
    where id = v_session.customer_id;
  end if;
end;
$$;

-- abandon_stale_sessions: called on a schedule (Supabase cron / Vercel
-- cron hitting an edge function) per SPEC.md "Abandoned sessions" — auto
-- transitions stale AWAITING_PAYMENT sessions so the queue self-heals
-- without depending on the barber's memory.
create or replace function abandon_stale_sessions(
  p_hours_threshold integer default 3
) returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  with updated as (
    update session
    set status = 'ABANDONED'
    where status in ('CREATED', 'AWAITING_PAYMENT')
      and created_at < now() - (p_hours_threshold || ' hours')::interval
    returning 1
  )
  select count(*) into v_count from updated;

  return v_count;
end;
$$;
