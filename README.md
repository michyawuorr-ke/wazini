# Wazini

The barber/salon-side native app for **KinyoziOS** (barber-first product brand) / **Wazini** (the underlying engine) — a micro-business operating system, starting with barbershops in Nairobi, designed from day one as the financial-identity data layer for an eventual underwriting/capital-access product. See [`docs/SPEC.md`](./docs/SPEC.md) section 11 for that strategic context.

This app is the **merchant-installed counterpart** to the customer-facing web app (`kinyozios`). Customers never install anything — they scan a shop QR code and use a web page. This app exists because Android does not allow a website to read SMS messages, and SMS interception is how this product automatically matches M-Pesa Till/Paybill payments to the right customer without requiring STK Push API access (which small/informal merchants in Kenya cannot obtain — see "Why SMS interception" below).

---

## What this app does

1. Shows the barber a live queue of customers who've checked in via the web app and are awaiting payment.
2. Listens for incoming M-Pesa confirmation SMS on the barber's phone.
3. Automatically matches each SMS to the right customer in the queue (by phone number first, then fuzzy name + amount), and verifies the payment with zero manual action when confident.
4. Falls back to a manual "M-Pesa code / Cash, Confirm" flow — always available, never replaced by automation — when a match isn't confident, or SMS interception isn't working for any reason.
5. Lets the barber browse customer history (read-only) and update the shop's Till/Paybill number.

Full system design — data flow, state machine, edge cases, matching engine logic — is in [`docs/SPEC.md`](./docs/SPEC.md).

---

## Why SMS interception (not STK Push)

STK Push requires a registered Paybill or corporate Till with a bank-linked account, KYC, static server IPs, and SSL webhooks — infrastructure Safaricom will not issue to an informal sole-proprietor barbershop. Instead, this app turns the merchant's own phone into the payment gateway: it reads the M-Pesa confirmation SMS that Safaricom already sends to every Till/Paybill owner, parses it locally, and matches it against the app's own queue.

**This requires SMS permissions, which means this must be a real installed Android app — not a website, not a PWA.** No browser API exposes SMS content to JavaScript, on any browser, by design. The customer side stays web-only; only this barber-facing app needs to be installed.

---

## Tech stack

- **Expo SDK 56** (React Native), TypeScript, strict mode
- **Expo Dev Client** (not Expo Go — required because SMS reading needs a custom native module that Expo Go's generic sandbox doesn't include)
- **EAS Build** — all native compilation happens on Expo's cloud servers, not on-device. This matters a lot for a Termux/Android-only dev workflow: you never need the Android SDK or Gradle installed locally.
- **Supabase** — same project the `kinyozios` customer web app already uses (shared backend, two clients)
- **`@maniac-tech/react-native-expo-read-sms`** — the SMS listener module. See `src/types/maniac-tech-sms.d.ts` for notes on this package's actual API, which differs from its README in places (verified against installed source, not docs).

---

## Project structure

```
src/
  components/      Reusable UI: TabSwitcher, SessionRow, VerifiedFlash (the
                    "premium moment"), MpesaCodeModal, AmbiguousMatchPicker
  config/           shopConfig.ts — persists which shop this install belongs to
  hooks/            useSmsListener.ts — wires the native SMS module to the
                    matching engine
  lib/              supabase.ts (client), sessions.ts (all Supabase queries
                    + RPC calls)
  navigation/       RootNavigator.tsx — the 2-tab structure
  screens/          BusinessScreen (default/core), CustomersScreen,
                    CustomerDetailScreen, PaymentSettingsScreen, SetupScreen
  sms/              parser.ts (raw SMS → structured data), matchingEngine.ts
                    (the core matching logic — pure, fully unit tested)
  theme/            tokens.ts — colors, spacing, typography
  types/            domain.ts (mirrors the Supabase schema), plus the SMS
                    package's hand-written type declarations
supabase/
  migrations/       001_core_schema.sql, 002_functions.sql (verify_session,
                    void_session, abandon_stale_sessions), 003_rls_policies.sql
docs/
  SPEC.md           Full system specification
```

---

## Setup — from Termux

### 1. Clone and install

```bash
git clone https://github.com/michyawuorr-ke/wazini.git
cd wazini
npm install
```

**Disk space note:** `node_modules` for this project is roughly 650MB. Check `df -h /data` before installing — you'll want at least ~1GB free. If you're tight on space, `npm cache clean --force` first (this alone freed ~650MB during initial development on this exact device).

### 2. Environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in the **same** Supabase URL and anon key the `kinyozios` web app uses — this app talks to the same backend.

### 3. Run the database migrations

Open your Supabase project's SQL Editor (web dashboard, works fine from your phone's browser) and run, in order:
1. `supabase/migrations/001_core_schema.sql`
2. `supabase/migrations/002_functions.sql`
3. `supabase/migrations/003_rls_policies.sql`

**Read the comments at the top of `003_rls_policies.sql` before running it** — it documents an explicit MVP security tradeoff (anon-key access scoped only by query-level `shop_id` filtering, not real per-barber auth) that needs revisiting before a real multi-shop production launch.

### 4. Create your first shop row

In the Supabase table editor, insert a row into `shop`:

```sql
insert into shop (name, slug, payment_type, payment_number)
values ('Test Barbershop', 'test-shop', 'till', '174379')
returning id;
```

Copy the returned `id` (a UUID) — you'll paste this into the app's first-run setup screen.

### 5. Log into Expo / EAS

```bash
npx eas-cli login
```

(First run will prompt to install `eas-cli` — accept it.)

```bash
npx eas-cli init
```

This links the project to your Expo account and fills in the `eas.projectId` value the app needs. It may ask to create the project remotely — accept.

### 6. Build a development APK

```bash
npx eas-cli build --profile development --platform android
```

This uploads your code to Expo's build servers and compiles there — nothing heavy runs on your device. Takes several minutes. When done, it gives you a download link/QR for the resulting APK.

### 7. Install on your test phone

Download the APK (the EAS CLI can show a QR code to scan, or you can open the build URL in your phone's browser) and sideload it — Android will prompt to "allow install from this source" the first time, which is expected for any APK not from the Play Store.

### 8. First launch

Open the app, paste in the shop UUID from step 4, tap Continue. You'll land on the Business tab — empty queue until a customer checks in via the web app.

### 9. Grant SMS permission

The app will request SMS read/receive permission on first attempt to start listening. **Accept it** — without this, the app falls back entirely to the manual confirm flow (still fully functional, just not automatic).

---

## Iterating after the first build

Once the dev-client APK is installed, most day-to-day changes (anything that's pure JS/TS, not a new native dependency) don't require a new EAS build at all:

```bash
npx expo start --dev-client
```

This starts Metro bundler from Termux; the installed dev-client app on your phone connects to it over your local network (same WiFi) and hot-reloads. You only need to re-run `eas build` when you add a new native module/permission, or when you want a fresh standalone build to test without Metro running.

---

## Known limitations (intentional, not oversights)

- **SMS listener is not yet a true Android foreground service.** Per the architecture spec, a persistent-notification foreground service is the more battery-optimization-resistant option (especially on Xiaomi/Tecno/Itel devices common in Kenya). The current implementation listens while the app process is alive but hasn't been upgraded to survive aggressive background killing. The manual confirm flow exists specifically to make this gap non-fatal. Tracked as a follow-up.
- **No real per-barber authentication.** RLS policies currently allow any holder of the anon key to read/write any shop's data, scoped only by knowing the shop's UUID. Documented explicitly in `003_rls_policies.sql` with the upgrade path. Acceptable for single-shop MVP testing; not acceptable before real multi-shop production use.
- **SMS regex is calibrated against a small number of sample message formats**, not validated against Safaricom's full format variation. Expect to need real-world calibration once tested against live Till payments.
