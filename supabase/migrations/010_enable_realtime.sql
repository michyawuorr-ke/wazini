-- KinyoziOS / Wazini — enable Realtime on session table
--
-- WHY THIS EXISTS: the Business tab queue must update instantly when a
-- new customer checks in (via web app OR manual_checkin) or when a
-- session's status changes (verified via SMS-auto-match, manual
-- confirm, or from another device entirely) — without the barber ever
-- needing to pull-to-refresh or background/foreground the app. Supabase
-- Realtime does this via Postgres logical replication, but tables are
-- NOT broadcast by default — each table must be explicitly added to
-- the `supabase_realtime` publication, which is what this migration does.
--
-- Scoped to `session` only (not customer/revenue_entry/etc.) — those
-- are read on-demand (Customers tab, history views) rather than needing
-- a live un-requested push; adding realtime to tables that don't need
-- it is pure overhead (extra replication traffic, extra subscription
-- management) with no UX benefit.

alter publication supabase_realtime add table session;
