-- KinyoziOS / Wazini — replace permissive anon policies with real
-- identity-scoped access control.
--
-- This is the upgrade explicitly promised and deferred in
-- 003_rls_policies.sql's own header comment: "Add Supabase Auth ...
-- Replace the using (true) policies above with using (shop_id in
-- (select shop_id from shop_owner where user_id = auth.uid()))."
-- We're doing almost exactly that, using shop_member instead of the
-- placeholder shop_owner name from that earlier comment, and covering
-- barbers as well as owners.
--
-- IMPORTANT — read before running: this migration assumes every
-- existing shop in the database already has at least one shop_member
-- row (an owner) created via create_shop_with_owner before this runs.
-- If you have a shop from MVP testing with NO owner assigned, that
-- shop's data becomes inaccessible under these new policies until you
-- manually insert a shop_member row for it. Check first:
--
--   select s.id, s.name from shop s
--   left join shop_member sm on sm.shop_id = s.id
--   where sm.id is null;
--
-- For any shop returned by that query, either assign an owner manually
-- before proceeding, or accept that shop's data becomes inaccessible
-- (acceptable for throwaway MVP test shops, NOT acceptable for any
-- shop with real data you care about).

drop policy if exists "anon full access - shop" on shop;
drop policy if exists "anon full access - customer" on customer;
drop policy if exists "anon full access - session" on session;
drop policy if exists "anon full access - revenue_entry" on revenue_entry;
drop policy if exists "anon full access - sms_event" on sms_event;
drop policy if exists "anon full access - service_price" on service_price;
drop policy if exists "anon full access - daily_business_snapshot" on daily_business_snapshot;

-- Helper pattern used throughout: "is this shop_id one the current
-- user belongs to (as owner OR barber)". Both roles get full read/write
-- on the operational tables (session, customer, revenue_entry) — see
-- the role-distinction note in shop_member: owner-only restrictions
-- apply specifically to payment settings, services, and member
-- management, NOT to day-to-day payment confirmation, which both
-- roles need to do identically.

create policy "members access their shop"
  on shop for select
  using (id in (select shop_id from shop_member where user_id = auth.uid()));

create policy "owners update their shop"
  on shop for update
  using (id in (select shop_id from shop_member where user_id = auth.uid() and role = 'owner'))
  with check (id in (select shop_id from shop_member where user_id = auth.uid() and role = 'owner'));

create policy "members access their shop's customers"
  on customer for all
  using (shop_id in (select shop_id from shop_member where user_id = auth.uid()))
  with check (shop_id in (select shop_id from shop_member where user_id = auth.uid()));

create policy "members access their shop's sessions"
  on session for all
  using (shop_id in (select shop_id from shop_member where user_id = auth.uid()))
  with check (shop_id in (select shop_id from shop_member where user_id = auth.uid()));

create policy "members read their shop's revenue"
  on revenue_entry for select
  using (shop_id in (select shop_id from shop_member where user_id = auth.uid()));
-- NOTE: deliberately no insert/update/delete policy on revenue_entry
-- for regular members — per the original "Revenue Entry is generated,
-- never manually created" integrity rule, this table should ONLY ever
-- be written by the verify_session/void_session functions (security
-- definer, bypasses RLS for their own writes). Members can read it,
-- never write it directly.

create policy "members access their shop's sms_events"
  on sms_event for all
  using (shop_id in (select shop_id from shop_member where user_id = auth.uid()))
  with check (shop_id in (select shop_id from shop_member where user_id = auth.uid()));

create policy "members access their shop's services"
  on service_price for all
  using (shop_id in (select shop_id from shop_member where user_id = auth.uid()))
  with check (shop_id in (select shop_id from shop_member where user_id = auth.uid()));

create policy "members read their shop's daily snapshots"
  on daily_business_snapshot for select
  using (shop_id in (select shop_id from shop_member where user_id = auth.uid()));
