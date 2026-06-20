-- ============================================================
-- READ-ONLY DIAGNOSTIC — checks for naming conflicts before
-- running wazini's migrations (001-007) against this Supabase
-- project. This script makes NO changes — it only reads from
-- Postgres's system catalogs. Safe to run any time.
-- ============================================================

-- 1. Do any of the table names wazini's migrations want to create
--    already exist in this database?
select
  table_name,
  table_schema
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'shop',
    'customer',
    'session',
    'revenue_entry',
    'sms_event',
    'service_price',
    'daily_business_snapshot'
  )
order by table_name;

-- If the query above returns ZERO rows, there is no naming conflict —
-- safe to run migrations 001 through 007 as-is.
--
-- If it returns ANY rows, STOP before running migrations and look at
-- section 2 and 3 below to see what's actually in that existing table.


-- 2. If a conflicting table DID show up above, see its actual columns
--    here (replace 'customer' with whichever table name conflicted):

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'customer'   -- ← change this to the conflicting table name
order by ordinal_position;


-- 3. Also worth checking: do any of the FUNCTION names wazini's
--    migrations create already exist? (less likely to conflict, but
--    cheap to check)
select
  routine_name,
  routine_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'verify_session',
    'void_session',
    'abandon_stale_sessions',
    'recompute_daily_snapshot'
  );


-- 4. Full inventory — every table currently in your public schema,
--    just so you have the full picture in one place.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;
