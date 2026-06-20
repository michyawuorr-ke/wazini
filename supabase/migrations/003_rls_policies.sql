-- KinyoziOS / Wazini — Row Level Security policies
--
-- IMPORTANT CONTEXT: in MVP, both the customer web app (kinyozios) and
-- this barber app authenticate to Supabase using the anon key only —
-- there is no per-barber login system yet. That means RLS cannot
-- distinguish "the barber for shop X" from "any anonymous client" at
-- the database level; the boundary that exists is shop_id scoping in
-- queries, enforced by the app code, not by auth identity.
--
-- This is an explicit, known MVP limitation, not an oversight: it means
-- anyone with the anon key (which ships inside the public app bundles —
-- normal for Supabase) and a shop's UUID could theoretically read/write
-- that shop's data. For a single-shop MVP test this is an acceptable
-- risk. It is NOT acceptable once real money and multiple real shops
-- are live — at that point this needs real auth (Supabase Auth, magic
-- link or phone OTP for the barber) with policies scoped to
-- auth.uid() rather than open anon access. Flagging this prominently
-- so it isn't forgotten before a real production launch.

alter table shop enable row level security;
alter table customer enable row level security;
alter table session enable row level security;
alter table revenue_entry enable row level security;
alter table sms_event enable row level security;

-- MVP policy: anon key can do everything, scoped only by shop_id in the
-- query itself (app-level boundary, not DB-level). This matches the
-- access pattern of the existing kinyozios web app and avoids the
-- "missing RLS policy silently blocks all inserts" failure mode
-- documented in that project's debugging history — being permissive
-- and explicit here is safer than guessing at restrictive policies
-- that might silently break legitimate writes.

create policy "anon full access - shop"
  on shop for all
  using (true)
  with check (true);

create policy "anon full access - customer"
  on customer for all
  using (true)
  with check (true);

create policy "anon full access - session"
  on session for all
  using (true)
  with check (true);

create policy "anon full access - revenue_entry"
  on revenue_entry for all
  using (true)
  with check (true);

create policy "anon full access - sms_event"
  on sms_event for all
  using (true)
  with check (true);

-- TODO before real multi-shop production launch:
--   1. Add Supabase Auth (phone OTP recommended for barbers in Kenya —
--      no email required, matches existing UX patterns)
--   2. Add a `shop_owner (shop_id, user_id)` mapping table
--   3. Replace the `using (true)` policies above with
--      `using (shop_id in (select shop_id from shop_owner where user_id = auth.uid()))`
--   4. Revoke anon insert/update on revenue_entry entirely — that table
--      should only ever be written by the verify_session/void_session
--      functions (security definer), never directly by client code.
