-- ============================================================
-- CLEANUP: remove unused active_sessions / business_events /
-- revenue_ledger tables from kinyozios's schema, freeing up the
-- conceptual space for wazini's session / sms_event / revenue_entry
-- tables in the same Supabase project.
--
-- Run each step IN ORDER. Do not skip step 1 — it's your safety net.
-- ============================================================


-- STEP 1 — confirm these are actually empty before doing anything
-- destructive. If any of these return a number > 0, STOP and tell me
-- before proceeding to step 2.

select 'active_sessions' as table_name, count(*) as row_count from active_sessions
union all
select 'business_events', count(*) from business_events
union all
select 'revenue_ledger', count(*) from revenue_ledger;


-- STEP 2 — (optional but cheap insurance) rename instead of dropping
-- first, so there's a one-command undo available for the next few days
-- in case anything in kinyozios's own code still references these
-- table names somewhere you don't remember.
--
-- This does NOT delete anything — it just moves them out of the way.
-- Skip straight to step 3 if you're confident nothing references them.

alter table if exists active_sessions rename to _archived_active_sessions;
alter table if exists business_events rename to _archived_business_events;
alter table if exists revenue_ledger rename to _archived_revenue_ledger;


-- STEP 3 — once you've confirmed (over the next few days of testing
-- kinyozios) that nothing broke from the rename in step 2, run this to
-- actually drop them for good. CASCADE will also drop any foreign keys,
-- views, or other objects that reference these tables — read the
-- NOTICE messages Postgres prints when you run this, they'll tell you
-- exactly what else got removed as a side effect.

-- drop table if exists _archived_active_sessions cascade;
-- drop table if exists _archived_business_events cascade;
-- drop table if exists _archived_revenue_ledger cascade;
