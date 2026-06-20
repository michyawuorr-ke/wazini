-- KinyoziOS / Wazini — service price list
--
-- Fixes a gap in the original schema: session.service_name was correctly
-- designed as a free-text snapshot (no FK to a services catalog, per the
-- "no inventory system in MVP" constraint), but nothing defined WHERE the
-- customer's check-in screen gets the list of tappable services + prices
-- from in the first place.
--
-- This table is intentionally minimal — name + price, nothing else. It is
-- NOT an inventory/catalog system: no categories, no stock, no images, no
-- duration, no per-barber assignment. It exists purely so the customer
-- web app can render "tap a service" buttons with real prices, and so the
-- SMS matching engine has consistent amount_expected values to match
-- against (a free-typed price per customer would make amount-based
-- matching unreliable — see SPEC.md section 4, matching priority 2).
--
-- CROSS-REPO CONTRACT: this table is managed (created/edited/removed)
-- from the wazini app (this repo). The kinyozios web app's
-- check-in screen must READ from this same table to render service
-- options to customers — that change has NOT been made in the
-- kinyozios repo as of this migration. See docs/SPEC.md section 7.1.

create table if not exists service_price (
  id          uuid primary key default uuid_generate_v4(),
  shop_id     uuid not null references shop(id) on delete cascade,
  name        text not null,
  price       integer not null check (price > 0),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_service_price_shop on service_price(shop_id, is_active, sort_order);

alter table service_price enable row level security;

-- Matches the same MVP anon-access tradeoff documented in
-- 003_rls_policies.sql — see that file's header comment for the real
-- security model and upgrade path before production launch.
create policy "anon full access - service_price"
  on service_price for all
  using (true)
  with check (true);
