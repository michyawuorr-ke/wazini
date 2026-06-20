-- Renames the 3 confirmed-empty kinyozios tables out of the way,
-- freeing up the names for wazini's migrations. Non-destructive and
-- reversible — see the matching UNDO script if you ever need to
-- reverse this.
--
-- Already confirmed via separate query: all 3 tables have 0 rows.

alter table active_sessions rename to _archived_active_sessions;
alter table business_events rename to _archived_business_events;
alter table revenue_ledger rename to _archived_revenue_ledger;
