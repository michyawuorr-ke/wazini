-- KinyoziOS / Wazini — core schema
-- Implements the data model from SPEC.md sections 2 ("Updated Data Model")
-- and the original v1 spec (Customer, Session, Revenue Entry).
--
-- This migration is additive-only and assumes a fresh Supabase project,
-- or one where these table names are not already in use by the
-- kinyozios web app. If the web app already defines `customer`/`session`
-- with different columns, reconcile before running this — do not run
-- blind against a production database with existing data.

create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────
-- SHOP
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists shop (
  id                  uuid primary key default uuid_generate_v4(),
  name                text not null,
  slug                text not null unique,
  payment_type        text not null check (payment_type in ('till', 'paybill')),
  payment_number      text not null,
  paybill_account     text,
  payment_updated_at  timestamptz,
  created_at          timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- CUSTOMER
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists customer (
  id              uuid primary key default uuid_generate_v4(),
  shop_id         uuid not null references shop(id) on delete cascade,
  phone           text not null,
  name            text not null,
  visit_count     integer not null default 0,
  lifetime_value  integer not null default 0,
  first_seen_at   timestamptz not null default now(),
  last_visit_at   timestamptz,
  unique (shop_id, phone)
);

create index if not exists idx_customer_shop on customer(shop_id);

-- ─────────────────────────────────────────────────────────────────────────
-- SESSION (atomic unit of the system)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists session (
  id                  uuid primary key default uuid_generate_v4(),
  shop_id             uuid not null references shop(id) on delete cascade,
  customer_id         uuid not null references customer(id) on delete cascade,

  service_name        text not null,
  amount_expected      integer not null,
  amount_paid          integer,

  status               text not null default 'CREATED' check (
                          status in (
                            'CREATED', 'AWAITING_PAYMENT', 'PAID',
                            'VERIFIED', 'VOIDED', 'ABANDONED'
                          )
                        ),

  payment_mode         text check (payment_mode in ('mpesa', 'cash')),
  mpesa_code           text,
  session_code         text not null,
  verification_source  text check (
                          verification_source in ('manual', 'sms_auto', 'sms_picker')
                        ),

  -- Payment instruction snapshot, frozen at creation. See SPEC.md
  -- "Payment Display" — never live-joined to shop, so an in-flight
  -- session is unaffected by the barber changing settings mid-payment.
  payment_type         text not null check (payment_type in ('till', 'paybill')),
  payment_number       text not null,
  paybill_account      text,

  created_at           timestamptz not null default now(),
  verified_at          timestamptz,
  voided_at            timestamptz,
  void_reason          text
);

create index if not exists idx_session_shop_status on session(shop_id, status);
create index if not exists idx_session_customer on session(customer_id);

-- Enforce "single open session per customer" at the database level —
-- a partial unique index covering only the non-terminal statuses.
create unique index if not exists idx_session_one_open_per_customer
  on session(customer_id)
  where status in ('CREATED', 'AWAITING_PAYMENT');

-- ─────────────────────────────────────────────────────────────────────────
-- REVENUE ENTRY (derived, immutable, 1:1 with session)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists revenue_entry (
  id              uuid primary key default uuid_generate_v4(),
  shop_id         uuid not null references shop(id) on delete cascade,
  session_id      uuid not null unique references session(id) on delete cascade,
  customer_id     uuid not null references customer(id) on delete cascade,
  amount          integer not null,
  payment_mode    text not null check (payment_mode in ('mpesa', 'cash')),
  recorded_at     timestamptz not null default now(),
  is_reversal     boolean not null default false
);

create index if not exists idx_revenue_shop on revenue_entry(shop_id);

-- ─────────────────────────────────────────────────────────────────────────
-- SMS EVENT (raw audit log — see SPEC.md rationale: dispute resolution)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists sms_event (
  id                  uuid primary key default uuid_generate_v4(),
  shop_id             uuid not null references shop(id) on delete cascade,
  raw_text            text not null,
  parsed_code         text,
  parsed_amount       integer,
  parsed_phone        text,
  parsed_name         text,
  match_result        text not null check (
                         match_result in ('auto_phone', 'auto_name', 'ambiguous', 'no_match')
                       ),
  matched_session_id  uuid references session(id),
  received_at         timestamptz not null default now()
);

create index if not exists idx_sms_event_shop on sms_event(shop_id, received_at desc);
