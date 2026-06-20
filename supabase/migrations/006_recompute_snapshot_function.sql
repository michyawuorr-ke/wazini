-- recompute_daily_snapshot — idempotent, safe to re-run for the same
-- (shop_id, date) pair repeatedly (e.g. running it every hour for
-- "today" so the snapshot stays current intra-day, then a final run
-- after midnight closes the day).
--
-- Called per-shop, per-day. A scheduled job (Supabase cron / Vercel
-- cron) should call this for every active shop for "today" on a
-- regular interval, and once more for "yesterday" shortly after
-- midnight to ensure a clean final value once all abandon/void
-- processing for that day has settled.

create or replace function recompute_daily_snapshot(
  p_shop_id uuid,
  p_date date
) returns void
language plpgsql
security definer
as $$
declare
  v_revenue_total       integer;
  v_revenue_mpesa        integer;
  v_revenue_cash          integer;
  v_transaction_count     integer;
  v_unique_customers       integer;
  v_new_customers          integer;
  v_voided_count            integer;
  v_abandoned_count         integer;
  v_sms_auto_match_count    integer;
  v_day_start timestamptz := p_date::timestamptz;
  v_day_end   timestamptz := (p_date + 1)::timestamptz;
begin
  select
    coalesce(sum(amount) filter (where not is_reversal), 0),
    coalesce(sum(amount) filter (where not is_reversal and payment_mode = 'mpesa'), 0),
    coalesce(sum(amount) filter (where not is_reversal and payment_mode = 'cash'), 0),
    count(*) filter (where not is_reversal)
  into v_revenue_total, v_revenue_mpesa, v_revenue_cash, v_transaction_count
  from revenue_entry
  where shop_id = p_shop_id
    and recorded_at >= v_day_start
    and recorded_at < v_day_end;

  select count(distinct customer_id)
  into v_unique_customers
  from revenue_entry
  where shop_id = p_shop_id
    and recorded_at >= v_day_start
    and recorded_at < v_day_end
    and not is_reversal;

  select count(*)
  into v_new_customers
  from customer
  where shop_id = p_shop_id
    and first_seen_at >= v_day_start
    and first_seen_at < v_day_end;

  select count(*)
  into v_voided_count
  from session
  where shop_id = p_shop_id
    and status = 'VOIDED'
    and created_at >= v_day_start
    and created_at < v_day_end;

  select count(*)
  into v_abandoned_count
  from session
  where shop_id = p_shop_id
    and status = 'ABANDONED'
    and created_at >= v_day_start
    and created_at < v_day_end;

  select count(*)
  into v_sms_auto_match_count
  from session
  where shop_id = p_shop_id
    and verification_source = 'sms_auto'
    and created_at >= v_day_start
    and created_at < v_day_end;

  insert into daily_business_snapshot (
    shop_id, snapshot_date, revenue_total, revenue_mpesa, revenue_cash,
    transaction_count, unique_customers, new_customers, returning_customers,
    voided_count, abandoned_count, sms_auto_match_count, computed_at
  )
  values (
    p_shop_id, p_date, v_revenue_total, v_revenue_mpesa, v_revenue_cash,
    v_transaction_count, v_unique_customers, v_new_customers,
    greatest(v_unique_customers - v_new_customers, 0),
    v_voided_count, v_abandoned_count, v_sms_auto_match_count, now()
  )
  on conflict (shop_id, snapshot_date) do update set
    revenue_total = excluded.revenue_total,
    revenue_mpesa = excluded.revenue_mpesa,
    revenue_cash = excluded.revenue_cash,
    transaction_count = excluded.transaction_count,
    unique_customers = excluded.unique_customers,
    new_customers = excluded.new_customers,
    returning_customers = excluded.returning_customers,
    voided_count = excluded.voided_count,
    abandoned_count = excluded.abandoned_count,
    sms_auto_match_count = excluded.sms_auto_match_count,
    computed_at = now();
end;
$$;
