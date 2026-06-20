-- UNDO for 01_rename_unused_tables.sql — reverses the rename if
-- something in kinyozios's code turns out to still reference the
-- original table names.

alter table _archived_active_sessions rename to active_sessions;
alter table _archived_business_events rename to business_events;
alter table _archived_revenue_ledger rename to revenue_ledger;
