-- Derived financial signals — views, not tables.
--
-- Volatility, growth trajectory, and customer concentration are
-- PROPERTIES of the daily_business_snapshot time series, not
-- independently-stored facts. Storing them as separate tables would
-- create the exact kind of redundancy/staleness risk the original
-- "Revenue Entry is generated, never manually created" integrity rule
-- was designed to prevent — these views recompute from source on every
-- read, so they can never drift from daily_business_snapshot.

-- shop_revenue_volatility: 30-day rolling coefficient of variation
-- (stddev / mean) of daily revenue. Lower = more predictable business
-- (good for underwriting); higher = unpredictable cash flow.
-- A NULL result means fewer than 2 days of data exist yet — not zero
-- volatility, genuinely unknown.
create or replace view shop_revenue_volatility as
select
  shop_id,
  count(*) as days_observed,
  avg(revenue_total) as mean_daily_revenue,
  stddev_samp(revenue_total) as stddev_daily_revenue,
  case
    when avg(revenue_total) > 0 and count(*) >= 2
      then round((stddev_samp(revenue_total) / avg(revenue_total))::numeric, 3)
    else null
  end as coefficient_of_variation
from daily_business_snapshot
where snapshot_date >= current_date - interval '30 days'
group by shop_id;

-- shop_growth_trajectory: compares the most recent 14 days of revenue
-- against the prior 14 days. growth_ratio > 1 = growing, < 1 = shrinking.
-- NULL when there isn't yet a full prior-period window to compare against
-- — an honest "not enough history" rather than a misleading 0.
create or replace view shop_growth_trajectory as
with periods as (
  select
    shop_id,
    sum(revenue_total) filter (
      where snapshot_date >= current_date - interval '14 days'
    ) as recent_14d_revenue,
    sum(revenue_total) filter (
      where snapshot_date >= current_date - interval '28 days'
        and snapshot_date < current_date - interval '14 days'
    ) as prior_14d_revenue
  from daily_business_snapshot
  where snapshot_date >= current_date - interval '28 days'
  group by shop_id
)
select
  shop_id,
  recent_14d_revenue,
  prior_14d_revenue,
  case
    when prior_14d_revenue > 0
      then round((recent_14d_revenue::numeric / prior_14d_revenue), 3)
    else null
  end as growth_ratio
from periods;

-- shop_customer_concentration: what % of trailing-90-day revenue comes
-- from the top 5 customers by spend. High concentration = risk (losing
-- one or two customers materially hurts revenue); low concentration =
-- a broader, more resilient customer base. This reads from
-- revenue_entry directly (not daily_business_snapshot) because
-- concentration is inherently a per-customer breakdown, which the
-- shop-level daily snapshot deliberately does not store — keeping
-- customer-level financial detail out of the daily rollup avoids
-- bloating it with a signal only needed for this one specific view.
create or replace view shop_customer_concentration as
with customer_totals as (
  select
    shop_id,
    customer_id,
    sum(amount) as customer_revenue
  from revenue_entry
  where not is_reversal
    and recorded_at >= current_date - interval '90 days'
  group by shop_id, customer_id
),
ranked as (
  select
    shop_id,
    customer_id,
    customer_revenue,
    row_number() over (partition by shop_id order by customer_revenue desc) as rank
  from customer_totals
),
shop_totals as (
  select shop_id, sum(customer_revenue) as total_revenue
  from customer_totals
  group by shop_id
)
select
  r.shop_id,
  st.total_revenue as total_90d_revenue,
  sum(r.customer_revenue) filter (where r.rank <= 5) as top_5_customer_revenue,
  case
    when st.total_revenue > 0
      then round(
        (sum(r.customer_revenue) filter (where r.rank <= 5))::numeric / st.total_revenue,
        3
      )
    else null
  end as top_5_concentration_ratio
from ranked r
join shop_totals st on st.shop_id = r.shop_id
group by r.shop_id, st.total_revenue;

-- shop_repeat_customer_rate: of all customers ever seen, what fraction
-- have visited more than once. Straightforward, but worth having as a
-- named view rather than an ad-hoc query every consumer reinvents
-- slightly differently.
create or replace view shop_repeat_customer_rate as
select
  shop_id,
  count(*) as total_customers,
  count(*) filter (where visit_count > 1) as repeat_customers,
  case
    when count(*) > 0
      then round((count(*) filter (where visit_count > 1))::numeric / count(*), 3)
    else null
  end as repeat_rate
from customer
group by shop_id;
