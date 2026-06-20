-- KinyoziOS / [renamed engine] — daily business snapshot
--
-- WHY THIS TABLE EXISTS (read before assuming it's premature):
--
-- The product strategy is explicit that the durable asset being built
-- is not "barber CRM data" but a financial-identity/underwriting signal
-- layer — see docs/SPEC.md section 11 ("Financial Signal Layer"). That
-- strategy names specific signals: revenue by day/week/month, revenue
-- volatility, customer concentration risk, growth trajectory, repeat
-- customer rate. None of those are representable as a single column
-- anywhere in the existing schema — they are properties of a TIME
-- SERIES of business activity, which does not exist yet without this
-- table. Adding it now (rather than "later, once we need it") is a
-- direct response to that strategy: every day this table doesn't exist
-- is a day of underwriting-relevant history permanently lost, since it
-- cannot be reconstructed retroactively with the same fidelity (e.g.
-- "which customers were active in this specific week" degrades once
-- session-level granularity rolls off whatever retention policy comes
-- later).
--
-- DESIGN: one row per shop per day, computed (not hand-entered) from
-- revenue_entry + customer + session for that day. Append-only,
-- effectively immutable once a day has fully closed (today's row is the
-- only one that should ever be recomputed in place — see
-- recompute_daily_snapshot below).
--
-- This table answers "what happened" at a daily grain. Volatility,
-- growth trajectory, and customer concentration are NOT separate
-- tables — they are queries/views computed FROM this table's time
-- series. Building five buzzword tables instead of one well-designed
-- rollup would be over-engineering in the opposite direction from the
-- original "no inventory system" discipline this product was built with.

create table if not exists daily_business_snapshot (
  id                      uuid primary key default uuid_generate_v4(),
  shop_id                 uuid not null references shop(id) on delete cascade,
  snapshot_date           date not null,

  -- Cash-flow signal
  revenue_total           integer not null default 0,   -- KES, sum of verified, non-reversed revenue_entry for the day
  revenue_mpesa           integer not null default 0,
  revenue_cash            integer not null default 0,
  transaction_count       integer not null default 0,    -- count of verified sessions for the day

  -- Demand / activity signal
  unique_customers        integer not null default 0,    -- distinct customers served this day
  new_customers           integer not null default 0,    -- customers whose first_seen_at falls on this day
  returning_customers     integer not null default 0,    -- unique_customers - new_customers

  -- Trust / operational-health signal
  voided_count             integer not null default 0,    -- sessions voided that referenced a session created this day
  abandoned_count          integer not null default 0,    -- sessions abandoned that were created this day
  sms_auto_match_count     integer not null default 0,    -- verification_source = 'sms_auto', a proxy for system reliability that day

  computed_at              timestamptz not null default now(),

  unique (shop_id, snapshot_date)
);

create index if not exists idx_daily_snapshot_shop_date
  on daily_business_snapshot(shop_id, snapshot_date desc);

alter table daily_business_snapshot enable row level security;

-- Matches the same MVP anon-access tradeoff documented in
-- 003_rls_policies.sql. This table is read-heavy and write-only via the
-- recompute function below (security definer) — see that file for the
-- real security model and required upgrade before this data is ever
-- shared with an external lender/underwriting partner. A financial
-- signal layer being read by a real lender is a much higher-stakes
-- access-control situation than a single barber's own app — do not
-- treat the MVP anon policy as adequate once that day comes.
create policy "anon full access - daily_business_snapshot"
  on daily_business_snapshot for all
  using (true)
  with check (true);
