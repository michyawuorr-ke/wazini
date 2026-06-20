-- ============================================================
-- FULL DATABASE INVENTORY — read-only, makes no changes.
-- Run each numbered block separately (or all together — Supabase's
-- SQL Editor will show each result set) to get a complete picture
-- before running wazini's migrations.
-- ============================================================


-- 1. EVERY table currently in the public schema, with approximate
--    row counts (fast — uses Postgres statistics, not a live COUNT).
select
  relname as table_name,
  n_live_tup as approx_row_count
from pg_stat_user_tables
where schemaname = 'public'
order by relname;


-- 2. Did the rename actually happen? Check for both the old names
--    AND the _archived_ names explicitly.
select table_name
from information_schema.tables
where table_schema = 'public'
  and (
    table_name in ('active_sessions', 'business_events', 'revenue_ledger')
    or table_name like '_archived_%'
  )
order by table_name;


-- 3. Every FUNCTION currently defined in the public schema — useful to
--    see what kinyozios already created, separate from tables.
select
  routine_name,
  routine_type
from information_schema.routines
where routine_schema = 'public'
order by routine_name;


-- 4. Every VIEW currently defined — relevant since wazini's own
--    migration 007 creates views, want to check for name collisions
--    there too.
select table_name as view_name
from information_schema.views
where table_schema = 'public'
order by table_name;


-- 5. RLS status on every table — useful context: are kinyozios's
--    existing tables using RLS or wide open? Helps sanity-check the
--    security model wazini's migrations will sit alongside.
select
  tablename,
  rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
order by tablename;
