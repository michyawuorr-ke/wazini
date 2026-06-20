# KinyoziOS / Wazini — System Specification

This is the consolidated, current system spec for the merchant-side (barber) app and its shared backend. It reflects every refinement made during initial design — original MVP spec, premium UX principles, payment-matching architecture, and the payment-display addition — merged into one coherent document.

---

## 1. Product Definition

KinyoziOS (customer/market-facing brand, barber-first for MVP) is the first vertical of a broader engine — internally, **Wazini** — built as a micro-business operating system. It is not booking software, not inventory software, not a CRM. It is:

> A real-time business truth system for micro-businesses that converts payments into structured identity and revenue automatically.

Core feeling goal: *"I am in control of my business."* Premium = Clarity + Speed + Zero confusion. If an action requires thinking, it has failed the design.

---

## 2. Two-App Architecture

```
┌──────────────────────────┐          ┌────────────────────────────┐
│  CUSTOMER WEB APP          │          │  BARBER NATIVE APP            │
│  Next.js · kinyozios       │          │  React Native/Expo · this repo│
│  No install, no login      │          │  Installed, dev-client build  │
└─────────────┬─────────────┘          └──────────────┬─────────────────┘
              │                                        │
              │            ┌─────────────┐             │
              └───────────►│  Supabase    │◄────────────┘
                           │  (shared)    │
                           └─────────────┘
```

Customers never install anything — a website can't read SMS, by design, on any platform. Only the merchant side, which needs SMS access for payment matching, requires installation.

---

## 3. Core Object Model

- **Shop** — one per merchant install (single-shop-per-device in MVP; one QR per shop, not per barber/chair)
- **Customer** — identity is the phone number (`UNIQUE (shop_id, phone)`)
- **Session** — the atomic unit of the system
- **Revenue Entry** — derived from a verified session, never written directly
- **SMS Event** — raw audit log of every intercepted SMS, independent of what the matching engine decided

---

## 4. Data Flow (Full Path)

```
1. Customer scans shop QR → web app → enters name + phone + service
2. System checks UNIQUE(shop_id, phone) for an existing OPEN session
   → if open session exists, resume it instead of creating new
3. Session created [CREATED → AWAITING_PAYMENT], session_code shown
4. Payment instruction screen shown immediately (Till or Paybill,
   pulled live from shop settings, frozen onto the session as a
   snapshot) — customer never needs to look for a poster on the wall
5. Customer pays externally (Till/Paybill on their own phone screen)
6. Safaricom sends confirmation SMS to the BARBER'S PHONE (not the system)
7. Barber app's SMS listener intercepts it
8. Regex extraction → { mpesaCode, amount, senderPhone?, senderName }
9. Matching engine queries the local AWAITING_PAYMENT queue for this shop
10. Match resolution (priority order):
      a. senderPhone present + matches exactly one session's customer.phone
         → AUTO-VERIFY (auto_phone), even if amount differs — phone wins,
           discrepancy is recorded via amount_paid, never silently dropped
      b. amount matches exactly one session + fuzzy name similarity > 0.7
         → AUTO-VERIFY (auto_name)
      c. amount matches one session but name confidence is low, OR amount
         matches multiple sessions → AMBIGUOUS, barber sees a picker
           (even the single-candidate case gets a 1-tap confirm, never
           silent auto-match on low confidence)
      d. no match at all → logged to sms_event only, session stays
         AWAITING_PAYMENT, manual confirm remains fully available
11. On verify (auto or manual): session → VERIFIED (single atomic DB
    function — see verify_session in 002_functions.sql)
12. Revenue Entry created, Customer denormalized fields updated, in the
    SAME atomic transaction
13. Barber sees the "Payment Confirmed" moment — fires identically for
    both SMS-auto and manual confirmations
```

**Critical principle:** SMS matching is an *acceleration layer*, never a hard dependency. The manual M-Pesa-code / Cash confirm buttons are always present on every queue row — automation can silently fail back to manual at any time (phone in airplane mode, Android killed the background listener, SMS format changed) without breaking the barber's workflow.

---

## 5. Source of Truth Rules

- **Session is the only writable entity during a visit.** Customer and Revenue are derived, never edited directly.
- **Revenue Entry is generated, never manually created** — every row traces to exactly one session (`UNIQUE` constraint on `revenue_entry.session_id`).
- **A VERIFIED session is immutable.** Corrections happen via `void_session`, which creates a negative offsetting revenue entry and rolls back customer counters — it never edits history.
- **Phone number is the customer identity key**, not an opaque generated ID the customer never sees.
- **Integrity invariant:** total revenue shown anywhere must always equal `SUM(revenue_entry.amount)` for non-reversed entries. The only intentional denormalization is `customer.visit_count` / `customer.lifetime_value`, which are reconcilable from `revenue_entry` if they ever drift.

---

## 6. Session State Machine

```
   CREATED
      │  (customer submits name+phone+service)
      ▼
AWAITING_PAYMENT
      │ barber confirms (manual or SMS-auto)
      ▼
  VERIFIED  (terminal, immutable)
      │
      │ barber catches an error after verification
      ▼
   VOIDED  (terminal, creates reversal revenue_entry)

AWAITING_PAYMENT
      │ no action for N hours (default 3)
      ▼
  ABANDONED  (terminal, no revenue_entry — self-heals without
              depending on the barber's memory)
```

PAID and VERIFIED are intentionally collapsed into a single barber action — splitting payment-confirmation from verification adds a tap with no integrity benefit, since the barber is the verifier either way.

---

## 7. Data Model

See `supabase/migrations/001_core_schema.sql` for the authoritative, executable schema. Summary of key design decisions:

- `service_name` is a free-text snapshot, not a foreign key to a services catalog — avoids forcing a services-CRUD build when inventory/catalog management is explicitly out of MVP scope.
- `amount_expected` and `amount_paid` are separate columns — the fix for cash/M-Pesa mismatch. Without this split, "customer paid less than expected" cannot be represented without lying about what was agreed.
- `payment_type` / `payment_number` / `paybill_account` are snapshotted onto `session` at creation, not live-joined to `shop` — so a barber changing payment settings mid-session never disrupts an in-flight payment.
- A partial unique index (`idx_session_one_open_per_customer`) enforces "single open session per customer" at the database level, not just in application code.

### 7.1 Service price list — cross-repo contract

`service_price` (migration `004_service_prices.sql`) is the list of tappable services + prices the customer sees at check-in. The barber manages this list **from this app** (`wazini`, Settings → Services & Prices). The **`kinyozios` web app must read from this same table** when rendering the check-in service-selection screen — this is a contract between the two repos, not something either one fully owns in isolation:

```sql
select id, name, price
from service_price
where shop_id = :shop_id and is_active = true
order by sort_order asc;
```

When a customer taps a service, the web app should write the selected `name` into `session.service_name` (snapshot, as designed) and `price` into `session.amount_expected` — at that point the link to `service_price` is intentionally severed; later changes to the price list must never retroactively alter an existing session.

**This is the one piece of this spec that requires a change in the `kinyozios` repo, not just this one** — flagging it explicitly so it isn't assumed to be "done" just because the barber-side half is built.

---

## 8. Key Edge Cases

| Case | Resolution |
|---|---|
| Duplicate phone numbers | `UNIQUE (shop_id, phone)` — repeat visits keep the original name, phone is identity |
| Unpaid sessions | Live in `AWAITING_PAYMENT` until verified or auto-expired |
| Wrong M-Pesa code | Not validated against an API in MVP; correctable only via `void_session` + re-creation, never an edit to a verified row |
| Cash/M-Pesa amount mismatch | `amount_paid` records the true amount; session still verifies; gap is visible, not hidden |
| Abandoned sessions | Auto-`ABANDONED` after a configurable window via scheduled job (`abandon_stale_sessions` function + cron) |
| Barber forgets to verify | Same self-healing mechanism as abandoned sessions — system doesn't depend on memory |

---

## 9. UX Flow

**Customer (web, no install):** scan QR → name + phone + service → see payment instructions (Till/Paybill) + session code → pay externally → done.

**Barber (this app), Business tab — default screen:**
- "Awaiting Payment" queue, each row: customer name, service, amount, session code, time waiting
- Manual M-Pesa / Cash confirm buttons always visible on every row
- SMS-matched rows get a brief visual flash before sliding out — so automation is *visible*, not silently magic
- Ambiguous matches surface a picker modal

**Customers tab — secondary, read-only:** sorted by last visit, tap through to a read-only visit history + lifetime value. No edit capability anywhere — reinforces that this data is system-generated truth, not manually entered.

**Payment Settings — tucked away (header icon, not a third tab):** barber can change Till/Paybill at any time; changes apply to new check-ins only, never retroactively to an in-flight session.

---

## 10. Risks & Failure Points

- **Android background process killing** (aggressive on Xiaomi/Tecno/Itel) — current implementation listens while the app is alive but is not yet a persistent foreground service. Tracked as a follow-up; manual confirm flow makes this non-fatal in the meantime.
- **SMS format drift** — Safaricom's message format isn't contractually fixed. The parser is defensive (extracts what it can, fails to `no_match` rather than crashing) but needs real-world calibration against live messages.
- **Dual-SIM phones** — a listener needs to eventually filter by sender shortcode to avoid false matches from an unrelated SIM's messages; not yet implemented.
- **Internet dependency on the customer side** — the web check-in requires connectivity; there's no offline fallback for a customer who can't load the QR page at all.
- **Denormalized customer counters at scale** — fine for single-shop MVP; would need to become computed views rather than cached counters if this becomes a true multi-shop platform.
- **No real per-barber auth yet** — see `supabase/migrations/003_rls_policies.sql` for the explicit, documented MVP tradeoff and upgrade path.

---

## 11. Financial Signal Layer — Strategic Context

This product is designed, from day one, to be fintech-native rather than fintech-by-accident. The operating thesis:

> The future of lending is not built on credit history. It's built on operational history.

Traditional underwriting evaluates paperwork (bank statements, payslips, credit history, collateral). A barber with a genuinely profitable business can fail that evaluation purely for lacking documentation. Alternative underwriting evaluates *behavior* — daily revenue, active customers, repeat-customer rate, revenue history — and asks "based on how this business actually operates, can it repay?"

The sequence this product is built around:

```
Business Activity → Financial Identity → Risk Understanding → Capital Access
```

Most fintech startups try to start at the last step. This one is deliberately starting at the first.

**Important framing distinction, stated explicitly so it doesn't get lost:** this is not a lending product today, and "underwriting" is a regulated activity — actually extending credit requires either a lending license, or a partnership with a bank/SACCO/fintech that does the lending while this system supplies the signal. The architecture below builds the *data layer* that such a partnership (or a future licensed lending arm) would consume. Claiming to underwrite before that structure exists would be inaccurate; building the data that makes underwriting *possible* is accurate today.

**The discipline this implies for every future feature:** before adding anything, ask "does this improve our understanding of business health?" — not "is this a nice feature." Viewed through that lens, the existing object model already maps cleanly:

| Existing data | Signal it represents |
|---|---|
| Customer identity (`customer`) | Customer retention base |
| Session creation (`session`) | Business activity / demand |
| Revenue tracking (`revenue_entry`) | Cash-flow |
| Payment verification (`verification_source`, immutable `VERIFIED` state) | Trust / data integrity |
| `customer.visit_count` | Repeat-demand signal |
| Revenue consistency over time | Underwriting-relevant stability signal |

The CRM/payment-matching surface is the **data acquisition mechanism**, not the product in isolation.

### 11.1 What was built to support this (migrations 005–007)

The signals this strategy names — revenue by day/week/month, revenue volatility, customer concentration risk, growth trajectory, repeat-customer rate — were **not** representable in the original schema; they are properties of a *time series* of business activity that didn't exist as a first-class concept. Three things were added:

1. **`daily_business_snapshot`** (migration 005) — one row per shop per day: revenue (total/M-Pesa/cash), transaction count, unique/new/returning customers, voided/abandoned counts, SMS-auto-match rate. This is the foundational rollup; without it, volatility and growth trajectory are mathematically impossible to compute (they require a time series, not a single running total).
2. **`recompute_daily_snapshot`** (migration 006) — an idempotent function that computes a day's snapshot from raw `revenue_entry`/`session`/`customer` data. Called after every verification (fire-and-forget, never blocks the payment flow) and intended to also run on a schedule to keep historical days settled.
3. **Derived signal views** (migration 007) — `shop_revenue_volatility`, `shop_growth_trajectory`, `shop_customer_concentration`, `shop_repeat_customer_rate`. These are deliberately **views, not tables** — computed fresh on every read from `daily_business_snapshot`/`revenue_entry`/`customer`, so they can never drift out of sync with source data. This mirrors the same "Revenue Entry is generated, never manually created" integrity principle from section 5, applied one layer up: derived signals must never become a second source of truth that can disagree with the data they're derived from.

**What this deliberately does NOT do:** there is no scoring model, no risk algorithm, no loan-decisioning logic anywhere in this codebase. That's intentional — the strategy calls for building the *signal layer* first and treating any actual underwriting product as a later, separate, properly-licensed/partnered decision. Conflating "we can measure revenue volatility" with "we can decide who gets a loan" would be a category error this codebase is deliberately not making yet.

### 11.2 Why every day of missing history matters

Unlike most schema additions, this one has a real cost to delaying it: `daily_business_snapshot` can only be backfilled from `revenue_entry`, which exists from day one — so historical backfill is possible. But signals that depend on finer granularity than daily rollups (e.g., "which specific customers were active in week 3") degrade in reconstructability the longer this table doesn't exist, especially once any future data-retention policy starts pruning raw session-level history. Building this now, even before any UI consumes it, preserves optionality that gets permanently more expensive to recover the longer it's deferred.

---

## 12. Future-Proofing — STK Push Path

If a shop eventually qualifies for and obtains real Daraja/STK Push API access:
- `AWAITING_PAYMENT → VERIFIED` gets a second trigger: a webhook matching `amount_expected` + till number, instead of the barber's tap or the SMS listener.
- `mpesa_code` becomes system-populated instead of barber-typed or SMS-parsed.
- No schema change required — `payment_mode` and `mpesa_code` already exist for this. Only a new webhook endpoint is needed; the state machine's shape doesn't change.

---

## 13. Offline-First Design & Live Updates

Two related but distinct real-world constraints drove this section, surfaced after the initial build:

1. **Customers walking into a barbershop frequently have no mobile data or WiFi at all.** There is no web-technology fix for a device with zero connectivity trying to load a page for the first time — this is a hard physical limit, not a design gap.
2. **The barber's own connection also drops often.** This one IS fixable with proper offline-first engineering.
3. **The barber should never need to manually refresh to see a new check-in or a payment that just got confirmed** — by any path, on any device.

### 13.1 Manual check-in (the fix for constraint 1)

Since a customer with zero connectivity cannot be the one making the network call, the fix is structural: the **barber's own phone** (this app) can create a session directly, bypassing the customer web check-in entirely. See `migration 008_manual_checkin.sql` and `ManualCheckinScreen.tsx`. This is a parallel entry point into the exact same `customer`/`session` model — everything downstream (matching engine, verification, revenue tracking, financial signal layer) works identically regardless of which path created the session.

The `manual_checkin()` database function is itself idempotent: a duplicate call against an already-open session returns the existing session rather than erroring, which matters because of 13.2 below.

### 13.2 Offline write queue (the fix for constraint 2)

When the barber's own connection is down, three actions need to keep working anyway: manual check-in, verify session, void session. See `src/offline/queue.ts` and `src/offline/sync.ts`.

**Design:**
- Each action is stored locally (AsyncStorage) with a client-generated `localId`, a payload, and an attempt counter.
- `useNetworkStatus.ts` detects connectivity changes and automatically drains the queue when the device comes back online, with a 60-second periodic safety-net sync as a backstop for the (documented, real) cases where a connectivity-change event is missed by the OS — the same category of Android-OEM background-process unreliability already flagged for the SMS listener.
- **Idempotency is handled per-action-type**, not generically, because each underlying DB function has different "already done" semantics:
  - `manual_checkin`: idempotent by design (see 13.1).
  - `verify_session` / `void_session`: the DB functions raise a specific exception when a session is no longer in a state that permits the action (e.g. already `VERIFIED`). The sync layer detects that specific exception message and treats it as a successful no-op rather than a real failure to retry — this is what prevents a crash-mid-sync from double-applying a verification (which would otherwise create a duplicate `revenue_entry` and double-count revenue, a direct violation of the integrity invariant in section 5).
- An action that fails 10 times in a row is logged and dropped rather than retried forever — a deliberate, documented tradeoff (an action with a permanently malformed payload, e.g. from a bug, would otherwise block all future sync attempts indefinitely).
- The barber's confirmation UX (`VerifiedFlash`) fires identically whether a write succeeded immediately or was queued — with a small "will sync when back online" subtext in the queued case, so the offline state is visible rather than silently hidden, per the "zero confusion" design law.

**What this deliberately does NOT do:** queue customer-facing web check-ins. A browser genuinely cannot queue "load this page" while offline for a first-time visitor — that gap is closed by manual check-in (13.1), not by trying to make the web app work with zero connectivity.

### 13.3 Live updates via Supabase Realtime

Separately from the offline queue, the Business tab queue needed to update **instantly** when anything changes — a new check-in (from the web app, or from manual check-in), or a payment verified through any path (SMS-auto-match, manual confirm, or even a second barber device) — without the barber ever pulling to refresh.

`useSessionRealtimeSubscription.ts` subscribes to Postgres changes on the `session` table, scoped to the current shop (`migration 010_enable_realtime.sql` adds the table to Supabase's realtime publication, required and not automatic). On any insert/update/delete, it triggers a debounced re-fetch of the full awaiting-payment queue, rather than trying to hand-patch a single row into local state — `postgres_changes` payloads don't include joined data (no customer name/phone), so a full re-fetch is simpler and less bug-prone than partial in-place merging.

This is intentionally a *separate* mechanism from the offline queue and the SMS-match flow — it doesn't drive any writes, it only reacts to the *result* of a write reaching the database, regardless of which path produced it. That separation is what makes the queue view correct even in scenarios this single app instance has no other way of knowing about.

**Known limitation, stated plainly rather than assumed solved:** this has not yet been verified against real on-device conditions — specifically, Realtime's reconnection behavior after the phone sleeps or the app is backgrounded for an extended period is untested. This is the same category of risk already flagged for the SMS listener (Android's aggressive background-process management on common Kenyan device brands) and should be verified during real device testing, not assumed correct from compiling cleanly.
