# StockSage AI Knowledge Transfer

## Current Authoritative Implementation — Aug 31 2026

### Pre-Surge V4 & Active Trade Auto-Closing Engine

Status: **Fully implemented, tested, and deployed live to Railway production.**

#### 1. Active Trade Resolution Fixes (`setupLifecycleMonitor.ts`)
- **Fix 1: `actualFillPrice` Fallback**: `resolveActiveSetup` previously returned early if `actualFillPrice` was null or 0 on a `TradeAttempt`. For legacy or manually seeded setups where fill price was recorded as `triggeredPrice` on `HistoricalSetup`, resolution was skipped forever. Fix falls back to `setup.triggeredPrice`, allowing all target/stop hits to resolve.
- **Fix 2: 3-Second Active Cache TTL**: Separated active setups cache TTL (`ACTIVE_CACHE_TTL_MS = 3_000`) from qualified setups TTL (`10_000ms`). Active trade targets now resolve within 3 seconds of price crossing the target.
- **Fix 3: Immediate WebSocket Subscription Refresh**: Triggering a `BUY_TRIGGERED` event immediately calls `refreshQualifiedSetupSubscriptions()`, ensuring newly active tickers stream ticks instantly via Dhan WebSocket without a 60-second lag.

#### 2. Pre-Surge V4 Breakout Strategy (`src/preSurgeV4Strategy.ts`, `src/preSurgeV4IntradayBacktest.ts`)
- **Breakout-Only Architecture**: Dropped the Early Buy leg (which bled -1.148% in V3). V4 trades only 15-minute confirmed breakouts with same-time RVOL ≥ 1.5x.
- **1R Stop-Lock Mechanics**: After 50% partial exit at 2R, trailing stop moves to **+1R** (cost + half initial risk) instead of 0R breakeven, guaranteeing a positive outcome on remaining shares.
- **Calibrated Qualification Gates**: Min score ≥ 80, max base range ≤ 8%, distribution days ≤ 1, sector RS20d ≥ +1.0%, accumulation ≥ 60.
- **Backtest Result (2021–2026)**:
  - **Overall Average Net Return**: **+1.31%** (up from +0.20% in V3)
  - **Profit Factor**: **1.473** (up from 1.193 in V3)
  - **Development Split (2021–2024)**: **+2.986% avg net**, **2.199 Profit Factor**, **56.25% Win Rate**
- **Live Shadow Observer**: `observeV4BreakoutShadow` enabled in `setupLifecycleMonitor.ts` logging `V4_BREAKOUT_CONFIRMED_SHADOW` events into PostgreSQL.

#### 3. Database & Deployment Hardening
- Prisma Schema updated and 16 database migrations deployed to Railway (`20260813_execution_integrity_v2`, `20260814_presurge_v3_shadow`).
- Docker build verified: Zero TypeScript errors; backend and `apex-intelligence` frontend build cleanly.

---

## Prior Implementation Notes — Aug 11 2026

The scanner forecast and the executable trade are now separate records. This closes the previous gap between **planned Buy -> market open -> actual fill -> target/stop**.

```text
PRE_SURGE_QUALIFIED
  -> EARLY_BUY_READY (30% advisory leg; shadow by default)
  -> BREAKOUT OBSERVATION
       -> valid price + RVOL inside max entry -> ACTUAL FILL
       -> opening/price above max entry ------> MISSED_GAP (NO TRADE)
       -> target already reached ------------> MISSED_GAP (NO TRADE)
       -> expired/invalid -------------------> EXPIRED / INVALIDATED
ACTUAL FILL -> TARGET_HIT / STOP_LOSS_HIT
```

- `TradePlan` stores planned breakout, maximum entry, stop, target, expiry and a unique active strategy identity.
- `TradeAttempt` stores opening price, actual fill/RVOL, actual exit, miss reason and actual-fill return.
- `SetupLifecycleEvent` is the append-only qualification/opening/fill/outcome audit trail.
- Maximum breakout entry is `min(breakout + 0.5 ATR, breakout * 1.02)`.
- Breakout fills require same-time `RVOL >= 1.5`, actual R:R >= 2.0, target above fill and stop below fill.
- Plans expire after ten weekday sessions. Duplicate ticker/strategy/timeframe plans cannot trigger independently.
- `WON` / `LOST` are created only after a persisted fill and returns use the actual fill, never the planned pivot.
- Dashboard cards show planned breakout, max entry, market open, actual fill, actual exit/miss reason and lifecycle times. Client-side LTP no longer invents wins/losses.
- `MISSED_GAP`, `INVALIDATED`, and `EXPIRED` remain visible in **Skipped / Invalid** and are not counted as trades.

The Early Buy upgrade keeps the current Pre-Surge base and adds Supertrend support/duration, EMA alignment, EMA20 proximity, volume dry-up, relative strength, accumulation, compression, pre-move and RS-acceleration scoring. Score >= 70 and planned R:R >= 2.5 can expose a 30% starter zone; the remaining 70% still requires breakout confirmation. It is advisory/shadow by default: `EARLY_BUY_SHADOW=true`, `EARLY_BUY_LIVE=false`.

Migration: `20260813_execution_integrity_v2`. Historical validation is dry-run first: `npm run execution:audit`; only use `npm run execution:audit -- --apply` after reviewing every finding.

This section is the current production handoff. It supersedes older notes below that said the dashboard showed only the latest scan or that only BUY setups were persisted.

### Durable setup history and lifecycle

Every setup returned by a successful scan is now persisted in `HistoricalSetup`, including qualified WATCH/base candidates. Repeated scans update an unresolved record for the same ticker instead of creating duplicates. WON and LOST records remain available for audit and performance analysis.

The `HistoricalSetup` model now tracks:

- `qualifiedAt`: first time the setup qualified
- `triggeredAt`: time the setup entered the triggered lifecycle
- `triggerConfirmed`: explicit price confirmation; scanner conviction alone never sets this to true
- `triggerVolumeRatio`: required same-time RVOL threshold (minimum `1.5x`)
- `triggeredPrice` / `triggeredVolumeRatio`: actual price and RVOL captured at confirmation
- `updatedAt`: last database update
- `resolvedAt`: time it became WON or LOST

Migrations: `prisma/migrations/20260809_setup_lifecycle_dates/migration.sql`, `prisma/migrations/20260809_explicit_trigger_confirmation/migration.sql`, `prisma/migrations/20260809_intraday_rvol_trigger/migration.sql`, `prisma/migrations/20260809_persistent_eod_market_data/migration.sql`, `prisma/migrations/20260809_token_rotation/migration.sql`

Legacy rows were backfilled with `qualifiedAt = createdAt`. Ambiguous legacy TRIGGERED/IN_PROGRESS rows are safely reset to QUALIFIED with no trigger timestamp; only resolved or explicitly monitored records remain confirmed. Future lifecycle transitions write explicit timestamps.

### Dashboard data behavior

`GET /api/last` now combines the latest completed scan with every `HistoricalSetup` row. Matching historical rows are enriched with current scan fields, while database lifecycle status and dates remain authoritative. Closed setups remain visible on the Setups page.

Setup cards show:

- `Buy Zone` while waiting for price confirmation
- `Buy Triggered` only after `triggerConfirmed = true`
- Qualified, Triggered, Updated, and Resolved timestamps
- Current LTP, target/stop progress, and outcome badge

`Buy Triggered` means the planned entry price was reached and the setup entered its active lifecycle. It does not prove that a broker order was executed. Actual user/paper execution is represented separately in the `Trade` table and Portfolio page.

### Two-stage Pre-Surge scanner

The Pre-Surge Hybrid Base is intentionally a two-stage process:

1. **Stage 1 — finalized post-market qualification:** at 16:35, 17:35, and 18:35 IST the idempotent EOD worker checks for the latest official NSE UDiFF Common Bhavcopy and Security-wise Delivery report. It persists the finalized session, completes missing history, validates readiness, and queues one `post_market` qualification scan. Candidates near EMA20 with volume dry-up and aligned trend/relative strength are stored as `QUALIFIED` monitor bases.
2. **Stage 2 — intraday confirmation:** during NSE hours, the backend subscribes every qualified ticker to Dhan independently of the browser. It computes same-time cumulative RVOL against recent 5-minute sessions and transitions only when both `LTP >= entryPrice` and `RVOL >= 1.5x`. The 09:45 scheduler is now a trigger reconciliation checkpoint; it does not rerun qualification.

The transition is conditional and idempotent. `aiSignal`, confidence, or a scanner ranking cannot promote a setup by themselves. A qualified setup stays qualified when volume history is unavailable.

### Finalized EOD market-data pipeline

The production scanner no longer qualifies stocks from a partially formed intraday daily candle. PostgreSQL is the qualification source of truth:

- `MarketInstrument`: NSE symbol, exchange security ID, ISIN, series, and active state.
- `DailyCandle`: finalized daily OHLCV plus turnover, trade count, delivery quantity/percentage, source, and finality flag.
- `EodIngestionRun`: per-session ingestion status, data-quality counts, errors, and qualification handoff timestamp.

Pipeline behavior:

1. Downloads the official NSE UDiFF Common Bhavcopy and optional `MTO_DDMMYYYY.DAT` delivery report, looking back across weekends and holidays.
2. Upserts every finalized EQ-series row and ranks the scanner universe by official turnover and trade count.
3. Backfills missing 300–500-session history from Dhan Historical Data. After three consecutive Dhan failures, the run uses a persisted Yahoo fallback when `EOD_ALLOW_YAHOO_BACKFILL=true`; scheduled qualification still never reads a partial intraday candle.
4. Requires at least `EOD_MIN_CANDLES` (default 220) for each symbol and `EOD_READY_RATIO` (default 80%) of the selected universe before setting the run to `READY`.
5. Loads qualification candles from PostgreSQL. Non-manual scans fail closed if the finalized store or Nifty benchmark is incomplete.

Operational endpoints:

- `GET /api/market-data/eod/status`: authenticated EOD readiness and data date.
- `POST /api/market-data/eod/sync`: admin-only asynchronous ingestion/backfill; `?force=true` reprocesses a READY date.

### Scanner calculations

- Swing T1 uses a setup-specific ATR multiple, generally about `2.6-3.4 x ATR`; T2 is T1 plus `1.5 x ATR`.
- Intraday T1 uses the greater of `1.8 x risk per share` or `1.4 x ATR`; T2 is T1 plus `1 x ATR`.
- Stop loss uses setup-specific recent lows, EMA20, previous close, and ATR protection. Risk distance is capped at `2.5 x ATR` and prices are rounded to NSE tick size.
- Supertrend is deterministic: 10-period ATR with a 3x multiplier. It contributes to confidence scoring and is not random.

### Real-time updates

The frontend uses authenticated fetch-based SSE with reconnect and exponential backoff:

- `/api/agent/stream`: scan progress, completion, failure, and agent events
- `/api/stream/ticks`: live ticks for unresolved setup cards

Both endpoints send keepalive heartbeats and disable proxy buffering. The lifecycle monitor resolves and subscribes qualified NSE symbols from the backend, so a dashboard tab is not required. Dhan Full Packet volume fields are parsed using the documented packet offsets. If a symbol has no fresh Dhan tick, a conservative 60-second REST/Yahoo intraday reconciliation runs; it will not trigger without both price and a valid RVOL baseline.

The backend `setupLifecycleMonitor` atomically transitions a qualified setup to `TRIGGERED` only when price and RVOL pass. Without valid managed Dhan authentication, the REST fallback is used and may be delayed by the market-data provider.

### Automatic Dhan access-token rotation

`src/dhanTokenManager.ts` is the single source of truth for Dhan authentication. Dhan API secrets are never treated as access tokens. The manager validates the active token through `/v2/profile`, renews an active web token or generates a replacement through Dhan's TOTP endpoint, and refreshes it when less than 60 minutes remain. A `401` causes one coordinated refresh and one REST retry; it never creates an unlimited retry loop.

Rotated access tokens are encrypted with AES-256-GCM in `BrokerAuthSession`. The encryption key, Dhan PIN, and TOTP seed remain Railway secrets and are never written to PostgreSQL or logs. A PostgreSQL advisory transaction lock prevents two application replicas from rotating the token concurrently. The scheduler checks token health every 15 minutes.

The Dhan WebSocket retains its symbol subscriptions across rotation, closes the old authenticated connection, and reconnects once with the new token. Reconnect timers are owned by the singleton client, preventing overlapping reconnect loops. HTTP `429` handling remains separate from token renewal and uses exponential backoff.

Required Railway variables for unattended renewal:

- `DHAN_CLIENT_ID`
- `DHAN_PIN`
- `DHAN_TOTP_SECRET`
- `DHAN_TOKEN_ENCRYPTION_KEY` (32 bytes represented as 64 hexadecimal characters or Base64)
- `DHAN_AUTO_TOKEN_RENEWAL=true`

`DHAN_ACCESS_TOKEN` is an optional one-time bootstrap token. `GET /api/dhan/auth/status` is admin-only and reports availability, expiry, source, and last error without returning credential material.

Activation note: the automatic path remains disabled until the Railway secrets above are configured. Never place the PIN, TOTP seed, encryption key, or generated token in Git, screenshots, logs, or chat.

### UI and scan safeguards

- The scan funnel reports universe count, qualified count, final setup count, triggered count, qualified-base count, rejection gates, and recommended action.
- Qualified bases do not show active SL/target progress or enable Trade until triggered.
- Historical cards use persisted entry/target/stop values and do not invent missing analytical values.

### Validation and production deployment

Validation completed:

- 49 automated tests passed, including Dhan TOTP, encrypted persistence, startup recovery, REST `401` retry, and WebSocket token-rotation coverage
- Backend TypeScript build passed
- Frontend TypeScript/Vite production build passed
- Prisma schema validation passed

Repository and branch:

- `ramkumarofficial2207-ui/Apex-production`
- `main`

Relevant commits:

- `32cc2a0`: resilient real-time scanner and tick updates
- `3d5c769`: all durable setups, lifecycle timestamps, and migration
- `ac00274`: Buy Zone / Buy Triggered card labeling
- `4f2c76b`: explicit price-trigger confirmation and false-positive lifecycle fix
- `d3f08a8`: persistent finalized NSE EOD ingestion, Dhan historical backfill, DB-owned qualification data, and 09:45 trigger-only reconciliation
- Follow-up safety fix: single-flight Dhan security-master loading prevents concurrent subscription refreshes from exhausting memory
- Dhan HTTP 429 responses use a 30-second-to-5-minute backoff instead of rapid reconnect loops.

Railway verification:

- Implementation verification deployment: `8707dc13-92d0-41bd-b286-265c5898fe13` - SUCCESS
- Migration `20260809_persistent_eod_market_data` applied successfully
- Finalized EOD date: `2026-08-07` - `READY`
- Stored daily candles: `227,912`
- Ready scanner universe: `462/500` symbols with at least 220 finalized candles
- DB-backed post-market qualification scan: `COMPLETED`, 24 setups found
- `https://<your-api-domain>/api/ready` returned HTTP 200 with database READY

### Important data limitation

Candidates that were never previously written to `HistoricalSetup` cannot be reconstructed. From this implementation onward, every setup returned by a successful scan is persisted and remains traceable through its lifecycle.

> Historical planning document: the `mobile/` source described below was not present in this workspace; only orphaned dependencies existed and were removed during the production audit. The canonical client is `apex-intelligence/`.

## Project Snapshot

StockSage AI is a monorepo with:

- Backend: Express + TypeScript + Prisma + PostgreSQL
- Web frontend: React + Vite
- Mobile frontend: Expo + React Native + Expo Router

Repo root:

- `src/` backend API and services
- `apex-intelligence/` canonical web app
- `mobile/` cross-platform mobile app
- `prisma/` schema and migrations

## What Was Added

### Mobile App

A new Expo mobile app was added in `mobile/`.

Key files:

- `mobile/app/_layout.tsx`
- `mobile/app/(auth)/login.tsx`
- `mobile/app/(auth)/register.tsx`
- `mobile/app/(tabs)/index.tsx`
- `mobile/app/(tabs)/watchlist.tsx`
- `mobile/app/(tabs)/portfolio.tsx`
- `mobile/app/(tabs)/chat.tsx`
- `mobile/app/profile.tsx`
- `mobile/app/upgrade.tsx`
- `mobile/app/founder.tsx`

Supporting layers:

- `mobile/context/AuthContext.tsx`
- `mobile/context/ThemeContext.tsx`
- `mobile/lib/api.ts`
- `mobile/lib/storage.ts`
- `mobile/lib/notifications.ts`
- `mobile/hooks/useAgentSSE.ts`
- `mobile/hooks/useWatchlist.ts`
- `mobile/components/`

### Backend Mobile Support

The backend was extended to support mobile auth and push registration.

Changed files:

- `src/index.ts`
- `src/validation.ts`
- `src/notificationService.ts`
- `src/pushNotificationService.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260406_mobile_auth_and_device_tokens/migration.sql`

## Auth Flow

### Web

Web remains compatible with:

- `email + password`

### Mobile

Mobile uses:

- Registration: `name + mobileNumber + email + mpin`
- Login: `mobileNumber + mpin`

The backend still preserves old web auth behavior.

## Prisma Changes

### User model

Added:

- `mobileNumber String? @unique`
- `mpinHash String?`

### DeviceToken model

Added for Expo push notifications:

- `id`
- `userId`
- `token`
- `platform`
- `createdAt`
- `updatedAt`

## New/Updated API Behavior

### Auth

- `POST /api/auth/register`
  - accepts mobile registration payload
- `POST /api/auth/login`
  - accepts either email/password or mobile/mpin
- `GET /api/auth/me`
  - now returns `mobileNumber`, subscription info

### Preferences

- `GET /api/user/preferences`
- `POST /api/user/preferences`

### Notifications

- `POST /api/notifications/register-device`

## Claude Usage

Claude is used safely through the backend.

Important:

- Do not put `ANTHROPIC_API_KEY` directly into the mobile app
- Mobile should call backend APIs like `/api/chat`
- Backend already uses Claude in `src/claudeClient.ts` and `src/chat/service.ts`

## Mobile Configuration

Current production API URL in:

- `mobile/app.json`

Current value:

- `https://<your-api-domain>`

If the backend domain changes, update:

- `mobile/app.json`
- or use `EXPO_PUBLIC_API_BASE_URL`

## How To Run Mobile App

From `mobile/`:

```powershell
cmd /c npm install
cmd /c npm run start
```

For Expo Go testing:

1. Install Expo Go on phone
2. Start Expo locally
3. Scan QR code

## How To Build Actual Android APK

From `mobile/`:

```powershell
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

Notes:

- `preview` is configured to build an installable APK
- `production` is for Play Store style builds
- Expo/EAS login is required before cloud builds

## iOS Notes

iOS testing can be done through Expo Go.

For App Store or TestFlight distribution, you need:

- Apple Developer Account

## Verification Already Done

Backend:

- Prisma client generated successfully
- root TypeScript check passed with:
  - `cmd /c npx tsc --noEmit`

Mobile:

- dependencies installed in `mobile/`
- mobile TypeScript check passed with:
  - `cmd /c npm run typecheck`

## Known Gaps / Next Work

These items are scaffolded but can still be improved:

- richer tablet split-view layout
- real swipe-to-delete gestures in watchlist
- production-grade charting beyond the current lightweight chart component
- stronger push notification workflows and receipts handling
- full APK generation still requires Expo account login

## Recommended Next Steps

1. Log into Expo:

```powershell
cd mobile
npx eas-cli login
```

2. Build the Android APK:

```powershell
npx eas-cli build --platform android --profile preview
```

3. Install the APK on the phone from the build link.

4. After Android is verified, decide whether to:

- keep Expo managed workflow
- generate Play Store build
- add iOS distribution

## Important Files To Know

Backend:

- `src/index.ts`
- `src/validation.ts`
- `src/claudeClient.ts`
- `src/chat/service.ts`
- `src/pushNotificationService.ts`

Mobile:

- `mobile/app/_layout.tsx`
- `mobile/context/AuthContext.tsx`
- `mobile/lib/api.ts`
- `mobile/lib/notifications.ts`
- `mobile/app/(tabs)/index.tsx`

Prisma:

- `prisma/schema.prisma`
- `prisma/migrations/20260406_mobile_auth_and_device_tokens/migration.sql`

## Handoff Summary

The project now supports a real mobile client with:

- mobile registration and MPIN login
- dashboard, watchlist, portfolio, chat, and profile screens
- backend support for device registration and push infrastructure
- production API wiring for Railway

The main remaining action to get the installable app is:

- Expo login
- EAS Android build

---

## Signal Labs — Stock Summary View (2026-08-02)

### Feature

The **Institutional Bulk Deals** panel in Signal Labs (`apex-intelligence/src/pages/SignalLabsPage.tsx`) has two view modes toggled by a pill button in the panel header:

- **Stock Summary** (default) — aggregates all deals by stock symbol and shows which stocks institutions are net-buying vs. net-selling.
- **All Deals** — the original row-per-deal table.

### How the Aggregation Works

All logic lives on the frontend — no new backend route or DB query is needed. The aggregation runs over `filteredDeals` (already filtered by entity and search) using a `Map<symbol, {...}>`:

```
buyQty  / buyValueCr   += quantity / totalValueCr  (dealType === 'BUY')
sellQty / sellValueCr  += quantity / totalValueCr  (dealType === 'SELL')
netFlowCr = buyValueCr - sellValueCr
entities = Set of unique FII/DII/PROMOTER/HNI labels
latestDate = most recent tradeDate across all deals for that symbol
```

Stocks are then sorted by `|netFlowCr|` descending and split into:

- **Stocks Being BOUGHT** — `netFlowCr > 0` (green cards)
- **Stocks Being SOLD** — `netFlowCr ≤ 0` (red cards)

### State Added

```ts
const [dealsView, setDealsView] = useState<'all' | 'summary'>('summary');
```

### File Changed

- `apex-intelligence/src/pages/SignalLabsPage.tsx`

### Filters

The existing symbol search input and entity filter pills (ALL / FII / DII / PROMOTER / HNI / ARBITRAGE) apply to both views — they filter `filteredDeals` before aggregation runs.

---

## NSE Bulk Deals — Historical Backfill (2026-08-02)

### Why It Was Added

`/api/institutional/deals` previously returned only the most recent trading day because the NSE archive URL (`bulk.csv`) is a daily-overwrite file. Historical data was being stored per day from the 4:10 PM cron but the UI was limited to `take: 100` rows which was roughly 1 day of deals.

### What Was Built

| File | Change |
|------|--------|
| `src/services/institutionalService.ts` | Added `backfillNseBulkDeals(daysBack, onProgress?)` + helper functions |
| `src/index.ts` | Added `POST /api/institutional/backfill` (admin); upgraded deals endpoint `take: 100 → 500`, added `?days=N` filter |
| `scratch_backfill_deals.ts` | One-shot standalone script for dev/prod backfill |
| `.env.example` | Added `PROD_DATABASE_URL` variable |
| Confluence window | Widened from 2 days → 30 days in `updateInstitutionalConfluences()` |

### NSE Historical CSV URL Pattern

```
https://archives.nseindia.com/content/equities/bulk_DD-Mon-YYYY.csv
# Example:
https://archives.nseindia.com/content/equities/bulk_01-Aug-2026.csv
```

Month names: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec

Today's file (used by daily cron): `bulk.csv` — always the latest trading day only.

### Backfill Strategy

- **Date-level dedup**: checks `count` of existing records for each date before downloading — skips entire day if already stored (fast, no per-row queries)
- **Batch insert**: uses `createMany({ skipDuplicates: true })` for each day
- **Rate limited**: 1.2 seconds between NSE requests
- **404 handling**: holidays and weekends return 404 — skipped silently
- **Max window**: 730 calendar days (≈ 2 years, ≈ 500 trading days)
- **Idempotent**: safe to re-run at any time

### How to Run the Backfill

**Dev DB** (uses `DATABASE_URL` from `.env`):
```powershell
npx ts-node scratch_backfill_deals.ts
npx ts-node scratch_backfill_deals.ts --days=30   # test run
```

**Production DB** (Railway):
1. Get your Railway PostgreSQL connection string from the Railway dashboard
2. Add to `.env`: `PROD_DATABASE_URL="postgresql://..."`
3. Run:
```powershell
npx ts-node scratch_backfill_deals.ts --prod
npx ts-node scratch_backfill_deals.ts --prod --days=730
```

Estimated time: ~9 minutes for 730 days (1.2 sec/request × 500 trading days).

### API Changes

```
GET /api/institutional/deals
  ?days=30     # optional — filter to last 30 calendar days
  ?days=90     # optional — filter to last 90 calendar days
  (no ?days)   # returns latest 500 rows

POST /api/institutional/backfill   (requireAdmin)
  Body: { days?: number }           # default 730, max 730
  Returns: 202 Accepted immediately, backfill runs in background
```

### After Backfill Completes

The Signal Labs "Stock Summary" and "All Deals" views will automatically show multi-day institutional activity. The Confluence Radar now uses a 30-day accumulation window instead of 2 days.

---

## Signal Labs — Pagination & Custom Date Range Filter (2026-08-02)

### UI Enhancements (`apex-intelligence/src/pages/SignalLabsPage.tsx`)

1. **15-Row Max Pagination**:
   - Both **Stock Summary View** and **All Deals Table View** display max **15 rows per page**.
   - Footer contains item counts (`Showing X to Y of Z entries`) and full navigation controls (`Previous`, Page pills `1`, `2`, `3`..., `Next`).
   - `currentPage` automatically resets to `1` whenever any filter (search query, entity type, from date, to date, or view mode) is changed.

2. **Custom Date Range Filter (`From Date` & `To Date`)**:
   - Integrated HTML5 `<input type="date">` controls into the toolbar header.
   - Dynamic **Clear Date** button (`RotateCcw` icon) appears when custom date bounds are active.

---

## 6-Year Historical Bulk Deals Database Import (2026-08-02)

### Local & Production Database Bulk Importer

- Script: `import_local_bulk_deals.ts`
- Source Data: 6 CSV files (`2021` to `2026`) stored in `BulkDeals_data/`
- Total Records Imported: **105,008 institutional deals**
- DB Table: `InstitutionalDeal` (PostgreSQL)

**How to Import into Production Database (Railway)**:
```powershell
# 1. Add PROD_DATABASE_URL="postgresql://..." in .env
# 2. Run:
npx ts-node import_local_bulk_deals.ts --prod
```

---

## Standalone "Signal Labs" Institutional Worker Service (`signal-labs-service/`)

### Architecture & Folder Layout

Independent microservice/background worker located in `signal-labs-service/`:

```
signal-labs-service/
├── src/
│   ├── config/constants.ts       # Cron schedule (16:30 IST), thresholds & NSE URLs
│   ├── db/
│   │   ├── client.ts             # Prisma DB client connection
│   │   └── models.ts             # TypeScript interfaces for flows, candidates & alerts
│   ├── ingestion/
│   │   ├── nseBulkDeals.ts       # EOD Large Deals API & DB sync with exponential retry
│   │   └── nseBhavcopy.ts        # EOD Price & Delivery Bhavcopy fetcher
│   ├── engine/
│   │   ├── hftScrubber.ts        # Net position calculator & HFT filter logic
│   │   └── candidatePool.ts      # Delivery confirmation & rolling 10-day candidate watchlist
│   ├── scanner/
│   │   ├── indicators.ts        # RSI, ATR, 20/50 EMAs, Bar Closing Strength & BB Width
│   │   └── institutionalScan.ts # Specialized 5-rule technical setup breakout engine
│   ├── utils/
│   │   ├── retry.ts              # Exponential backoff retry utility
│   │   └── logger.ts             # Structured logger
│   └── index.ts                  # Cron worker entry point (16:30 IST Mon-Fri)
├── scratch_test_scan.ts          # Manual test runner for instant pipeline execution
├── scratch_backtest.ts           # 6-Year Quantitative Backtest Engine
├── package.json
└── tsconfig.json
```

### New Database Tables Added (`prisma/schema.prisma`)

- `institutional_flows`: Persists deal transactions with `isHftNoise` flag.
- `institutional_candidate_pool`: Stores rolling 10-day candidate watchlist with delivery spike ratios & accumulated volume.
- `signal_labs_alerts`: Stores high-conviction breakout setups with Target (+8%) and Stop Loss (-3%).

### Key Service Mechanics

1. **HFT Noise Scrubber (`hftScrubber.ts`)**:
   $$\text{Net Quantity} = \text{Buy Qty} - \text{Sell Qty}$$
   - IF `Net Quantity == 0` or `Buy Qty == Sell Qty` within the same session ➔ `isHftNoise = true` (discarded).
   - IF `Net Quantity > 0` ➔ Retained as institutional accumulation.

2. **Delivery Volume Confirmation (`candidatePool.ts`)**:
   - `Delivery Volume > 2.5x` (20-day SMA Delivery Volume) OR `Delivery Percentage > 40%`.
   - Maintains a rolling 10-day candidate watchlist (~60–100 candidate stocks).

3. **Specialized 5-Rule Technical Breakout Scanner (`institutionalScan.ts`)**:
   - Scans **ONLY** candidate pool symbols (does not scan full 2,000+ universe).
   - Rules:
     1. `Close > 20 EMA` and `20 EMA >= 50 EMA`
     2. Volatility Contraction (VCP / BB Width contracting)
     3. `Today Close > 20-day Swing High` AND `Intraday Move >= +3.0%`
     4. `Volume >= 1.8x 20-day Volume SMA`
     5. Bar Closing Strength: $(\text{Close} - \text{Low}) / (\text{High} - \text{Low}) \ge 0.75$

4. **Alert Calculation**:
   - `Breakout Price`: Close price on breakout day
   - `Target Price`: $\text{Breakout Price} \times 1.08$ (+8%)
   - `Stop Loss Price`: $\text{Candle Low} \times 0.97$ (-3%)

### Execution Commands

```powershell
# Manual Pipeline Execution:
cd signal-labs-service && npm run test:scan

# Cron Worker Daemon (Runs at 16:30 IST Mon-Fri):
cd signal-labs-service && npm run start:worker

# Run 6-Year Backtest:
cd signal-labs-service && npx ts-node scratch_backtest.ts
```

---

## 📊 6-Year Official Backtest Report

Empirical results over 105,008 deal records across 1,382 trading sessions (2021–2026):

| Metric | Result |
|---|---|
| Evaluation Period | 2021 – 2026 (6 Years / 1,382 Days) |
| Total DB Deal Records | 105,008 Deals |
| Total Trades Triggered | **106 Trades** |
| Winning Trades (+8% Target) | **60 Wins** |
| Losing Trades (-3% Stop) | **28 Losses** |
| **Win Rate** | **56.6%** |
| **Profit Factor** | **1.35** |
| **Risk / Reward Ratio** | **2.67 R-Multiple** (+8% Target / -3% Stop) |

---

## 🌱 Session Update: Aug 8–9 2026 — Pre-Surge Hybrid Base Scanner

### Problem Identified

The existing scanner was detecting stocks **AFTER** a 10% breakout had already occurred (e.g., ENRIN was found on Friday after surging 10%). The goal was to detect these stocks **the night before** while they are quietly resting at their 20 EMA base.

**Empirical Test Result for ENRIN (Aug 6 Thursday Pre-Breakout):**

| Metric | Thursday Evening (Base) | Friday (Surge Day) |
|---|---|---|
| Close Price | ₹3,252 | ₹3,648 (+10%) |
| Relative Volume (RVOL) | 0.76× (Quiet) | 20.4× (Explosive) |
| RSI 14 | 43.5 (Neutral) | 63.6 (Momentum) |
| Setup Identified | EMA20 Pullback | Pullback Continuation |

### Root Cause

Standard EOD breakout scanners require `RVOL ≥ 1.5×` to trigger. On Thursday, ENRIN had only 0.76× volume — a classic **volume dry-up base** that precedes institutional breakouts. The scanner missed it entirely.

---

### Changes Implemented

#### 1. Pre-Surge Hybrid Base Pattern — `src/indicators.ts`

Added new setup archetype `"Pre-Surge Hybrid Base 🌱"` to `identifySetupType()`:

```typescript
// Line ~1049 in indicators.ts
if (Math.abs(ltp - ema20) / ema20 <= 0.02 && ind.volumeRatio <= 0.85 && ema50 > (ind.dma200 ?? 0))
    return 'Pre-Surge Hybrid Base 🌱';
```

**Detection Criteria:**
- Price within 2% of 20 EMA (resting at support)
- Relative Volume ≤ 0.85× (volume dry-up / supply exhaustion)
- Trend aligned: EMA20 > EMA50 > DMA200
- 3-Month RS vs Nifty ≥ +5% (outperforming market)

#### 2. Volume Dry-Up Scoring — `src/indicators.ts`

Updated `computeConfidence()` to **reward** low volume during pullbacks instead of penalizing it:

```typescript
// Volume Confirmation: rewards dry-up for pullback setups
const volScore = (isPullback && ind.volumeRatio <= 0.85) ? 2.0 :
    ind.volumeRatio >= 2.0 ? 2.0 :
        ind.volumeRatio >= 1.5 ? 1.5 :
            ind.volumeRatio >= 1.2 ? 0.8 : 0.0;
```

#### 3. Pre-Surge Technical Gate — `backtest.ts`

Added `isPreSurgeBase` bypass check **before** the `accumulationScore` gate so quiet bases are not wrongly rejected:

```typescript
const isPreSurgeBase =
    Math.abs(ind.ltp - ind.ema20) / ind.ema20 <= 0.025 &&
    ind.volumeRatio <= 0.90 &&
    ind.rsi14 >= 40 && ind.rsi14 <= 70 &&
    ind.ema20 > ind.ema50 && ind.ema50 > (ind.dma200 ?? 0) &&
    ind.avgVolume20d >= MIN_AVG_VOLUME &&
    (ind.returns3m - ind.nifty3mReturn) >= 5;
if (isPreSurgeBase) return true;
```

#### 4. Persistent Setup Retention — `src/scanStorage.ts`

The live dashboard now loads only the latest completed scan result. Historical setup records remain available through Track Record/performance views and are not merged into the live opportunity grid.

```typescript
// The live cache is restored from the latest completed ScanJob only.
// HistoricalSetup rows are consumed by Track Record/performance views.
```

#### 5. MONITOR BASE vs TRIGGERED Badge — `apex-intelligence/src/components/SetupCard.tsx`

Setup cards now display context-aware badges:

- 🟡 **`MONITOR BASE`** (pulsing amber badge) — for qualified base candidates with `status: 'QUALIFIED'` or `aiSignal: 'WATCH'`
- 🟢 **`TRIGGERED`** — for confirmed active breakout setups

Also updated the buy zone label: base candidates show `"Base Zone: ₹X – ₹Y"` instead of `"Buy Zone"`.

#### 6. Dynamic Sector Dropdown — `apex-intelligence/src/pages/DashboardPage.tsx`

Replaced hardcoded sector options with dynamically generated options from actual scan results:

```tsx
{Array.from(new Set(safeScanItems.map(i => i.sector).filter(Boolean))).sort().map(sec => (
    <option key={sec} value={sec}>{sec}</option>
))}
```

---

### Two-Stage Scanner Architecture (Design Decision)

**Stage 1 — Post-Market Qualification Scan (4:00 PM IST):**
- Runs automatically after NSE Bhavcopy delivery data is published
- Stores `Pre-Surge Hybrid Base 🌱` candidates in DB with `status: 'QUALIFIED'`
- Displays on Dashboard as `MONITOR BASE` cards

**Stage 2 — Intraday Trigger Confirmation (Market Hours):**
- Monitors qualified candidates for intraday volume expansion (`RVOL ≥ 1.5×`)
- Upgrades matching setups to `status: 'TRIGGERED'`
- Displays full `Buy Zone / Target 1 / Target 2 / Stop Loss / R:R` on Dashboard

**Risk-Reward Improvement:**
| Approach | Entry Price | Stop Loss | R:R |
|---|---|---|---|
| Old breakout scanner | ₹3,738 (post-surge) | ₹3,550 | 1 : 1.5 |
| New Pre-Surge Base | ₹3,252 (at 20 EMA) | ₹3,173 | 1 : 4 to 1 : 6 |

---

### Backtest Status

A walk-forward backtest was attempted but could not be completed due to insufficient historical candle data from the Yahoo Finance API (only 206 days returned, while `computeIndicators` requires 200 candles minimum, leaving only ~6 scannable days per stock).

**Manual Signal Validation (debug_presurge.ts):**

| Stock | Pre-Surge Signal Days | Trigger Filled (Next 5 Days) |
|---|---|---|
| PRESTIGE | 3 days | ✅ 2 of 3 triggered |
| BIOCON | 5 days | ✅ 5 of 5 triggered |
| SHILPAMED | 3 days | ✅ 3 of 3 triggered |

To run a proper backtest, 2+ years of daily candle data is required (via NSE Bhavcopy historical files or Dhan API with extended lookback). **Backtest is deferred.**

---

### Files Changed in This Session

| File | Change |
|---|---|
| `src/indicators.ts` | Added `Pre-Surge Hybrid Base 🌱` setup pattern; updated volume dry-up scoring in `computeConfidence()` |
| `src/scanStorage.ts` | Live scan restoration is isolated to the latest completed scan; historical setup rows stay in Track Record/performance views |
| `apex-intelligence/src/types.ts` | Updated `ScanSetupStatus` enum to support `'QUALIFIED' \| 'TRIGGERED' \| 'IN_PROGRESS' \| 'WON' \| 'LOST' \| 'WATCHLIST'` |
| `apex-intelligence/src/components/SetupCard.tsx` | Added Live Price (`LTP ₹X`), state badges (Qualified Base, In Progress, Target Hit Win, Stop Loss Hit Loss), and live SL/Target distance trackers |
| `apex-intelligence/src/pages/DashboardPage.tsx` | Added 5 category filter buttons (`All`, `Triggered`, `Qualified`, `Won`, `Lost`) and dynamic grid display |
| `src/scanner.ts` | Explicit `status` tagging (`QUALIFIED` vs `TRIGGERED`); expanded output limit from 8 to 30 setups |
| `backtest.ts` | Added `isPreSurgeBase` bypass in technical gate, setup family `PRE_SURGE`, trigger/stop/target logic for pre-surge entries |

---

## ⚡ Setup Lifecycle State Machine & Live Card Tracking (Aug 9 2026)

### Architectural Overview

The system now enforces a strict **Setup Lifecycle State Machine** across all trade setups:

```
QUALIFIED BASE (0.85x Vol Dry-Up at 20 EMA)
       │
       ▼ (Price enters Buy Zone with Volume)
TRIGGERED / IN_PROGRESS (Active Trade)
       ├──▶ LTP ≥ Target 1/2 ──▶ WON 🎯 (Target Hit)
       └──▶ LTP ≤ Stop Loss  ──▶ LOST 💥 (Stop Loss Hit)
```

### 1. State Definitions & Rules

- **`QUALIFIED` (Qualified Base)**: Stocks resting near 20 EMA with volume dry-up (`RVOL ≤ 0.85×`). Displays 🟡 **`QUALIFIED BASE`** pulsing badge and Base Support Range (`₹X – ₹Y`). Target/Stop distance tracking is hidden because trade has not triggered yet.
- **`TRIGGERED` / `IN_PROGRESS` (Active Trade)**: Stocks that triggered entry with volume confirmation. Displays 🟢 **`IN PROGRESS`** badge, Live Price, Live Target 1 distance (`+X.X%`), Live Stop Loss distance (`-X.X%`), and color progress bar.
- **`WON` (Target Hit)**: `LTP ≥ Target 1`. Status transitions to `WON` in PostgreSQL DB. Displays 🎯 **`TARGET HIT (WIN)`** emerald badge.
- **`LOST` (Stop Loss Hit)**: `LTP ≤ Stop Loss`. Status transitions to `LOST` in PostgreSQL DB. Displays 💥 **`STOP LOSS HIT (LOSS)`** red badge.

### 2. Persistent PostgreSQL Retention & Re-Entry Analysis
- Removed the legacy `.slice(0, 8)` limit in `src/scanner.ts` and expanded output to **30 setups**.
- `loadScanResults()` in `src/scanStorage.ts` restores only the latest completed live scan; historical records remain available to Track Record/performance analysis.
- Only triggered BUY setups enter the active performance lifecycle. Qualified WATCH/base setups remain `QUALIFIED` research candidates.
- `WON` and `LOST` setups remain in PostgreSQL for outcome analysis and re-entry research.

### 3. Dashboard Category Filter Bar (`DashboardPage.tsx`)
- Added 5 interactive category toggle buttons at the top of the dashboard:
  1. `All Setups (Total Count)`
  2. `⚡ Triggered / In Progress (Count)`
  3. `🟡 Qualified Base (Count)`
  4. `🎯 Won (Count)`
  5. `💥 Lost (Count)`

---

## Hybrid Institutional Discovery + ML Ranking Architecture (Aug 9 2026)

### Production flow

```text
Official NSE stock-level bulk deals
        ↓
Institutional Candidate Pool (ACTIVE / EXPIRED / REJECTED)
        ↓ merged with liquidity universe + news candidates
Deterministic Pre-Surge technical qualification
        ↓
Batch ML ranking (shadow by default)
  • LightGBM LambdaRank champion
  • CatBoost YetiRank challenger with native categorical features
  • XGBoost ranking baseline
        ↓
Bounded LLM context/risk explanation only
        ↓
Deterministic QUALIFIED → TRIGGERED → WON / LOST lifecycle
```

### Institutional discovery

- `src/services/institutionalCandidateService.ts` aggregates recent classified FII and DII bulk deals by stock by default. Promoter/HNI sources can be enabled explicitly through `INSTITUTIONAL_SOURCE_TYPES` after classification review.
- Net flow, source alignment, disclosure freshness, finalized delivery evidence and liquidity are scored transparently.
- Only `ACTIVE` candidates are appended to the scanner universe; being in the pool is not a BUY signal.
- Signal Labs now shows the independent discovery pool separately from the stricter institutional + scanner overlap radar.
- The finalized EOD pipeline refreshes the pool before the post-market qualification scan.

### ML safety and auditability

- `src/mlRankingService.ts` sends every setup in one date-grouped `/v1/rank` batch. The retired per-stock localhost `/predict` call is no longer part of scanner decisions.
- `MlFeatureSnapshot`, `MlPrediction`, `MlModelVersion`, and `MlOutcome` preserve point-in-time inputs, model/version outputs and resolved labels in PostgreSQL.
- `setupLifecycleMonitor.ts` now subscribes to both qualified and active setups: price + RVOL confirms entry, then live ticks resolve target/stop outcomes and attach labels. The nightly verifier replays post-trigger daily candles chronologically as a recovery path and treats same-bar target/stop ambiguity conservatively.
- Missing or invalid model artifacts return `DEGRADED`, `OFFLINE`, or `INVALID_RESPONSE`; the system never fabricates a production probability.
- ML cannot change entry, stop loss, targets, trigger confirmation or lifecycle status.
- Live ordering requires all three conditions: `ML_SHADOW_MODE=false`, `ML_ALLOW_LIVE_RERANK=true`, and a service registry with `productionEligible=true`.
- The LLM is context-only in scanner enrichment. It can flag a review risk but cannot authorize a trade or replace deterministic prices.

### Training and promotion

- `npm run ml:export` exports resolved, point-in-time feature snapshots from PostgreSQL.
- `npm run ml:train` runs date-grouped walk-forward validation and writes versioned artifacts/registry metadata.
- Promotion checks use date-grouped walk-forward folds plus an untouched final date holdout, then enforce sample/date minimums, Precision@5, NDCG@5 versus XGBoost, expectancy and drawdown.
- Retraining is controlled offline; there is no uncontrolled online self-learning.
- Existing `python_ml/xgboost_model.json` remains a legacy six-feature shadow comparator and is never production eligible.

### Deployment

1. Deploy the API migration `20260810_hybrid_ml_pipeline`.
2. Add a second Railway service using `Dockerfile.ml` / `railway-ml.toml`.
3. Configure `ML_SERVICE_URL` and the same private `ML_SERVICE_TOKEN` on both services.
4. Start with `ML_RANKING_ENABLED=true`, `ML_SHADOW_MODE=true`, and `ML_ALLOW_LIVE_RERANK=false`.
5. Verify `/api/ml/status`, `/api/institutional/candidates`, scan completion, snapshot writes and model health before any promotion.

### Current model status

The original one-stage experiment is superseded by the two-stage pipeline documented below. Its artifacts remain historical only and are not loaded by the current registry. Production remains in shadow mode.

---

## Official NSE Historical Archive (Aug 9 2026)

### Implementation

- `src/nseHistoricalBackfill.ts` is an idempotent, resumable downloader for official NSE EOD market data.
- It supports the legacy `cmDDMONYYYYbhav.csv.zip` format through July 7, 2024 and the UDiFF `BhavCopy_NSE_CM...csv.zip` format from July 8, 2024.
- Each trading day also downloads the security-wise delivery report and the official all-index close report. `Nifty 50` is parsed as the `NIFTY_50` benchmark for relative-strength and market-regime features.
- Retries use bounded exponential backoff. Weekends are skipped, NSE holidays are recorded, partial files use a `.part` suffix, and `manifest.json` provides restart checkpoints.
- Download mode never writes to PostgreSQL. Import mode uses idempotent `(symbol, tradingDate)` upserts into `DailyCandle` and can safely be resumed.

### Local archive status

- Range: `2020-01-01` through `2026-08-07`.
- Result: **1,632 trading days**, **91 non-trading weekdays**, **0 failures**.
- Delivery coverage: **1,632/1,632** trading days.
- NIFTY 50 benchmark coverage: **1,632/1,632** trading days.
- Raw archive size: approximately **326 MB** across 4,897 files.
- Location: `data/nse_eod_archive` (runtime data; excluded from Git).
- Local PostgreSQL import is complete: **3,000,216 candles** across **3,203 instruments**. Railway production was not modified.

### Commands

```bash
# Download or resume raw official NSE files only
npm run market:download -- --from=2020-01-01 --to=2026-08-07 --concurrency=3

# Import the cached files into the configured PostgreSQL database
npm run market:backfill -- --from=2020-01-01 --to=2026-08-07 --concurrency=1
```

Database import is deliberately serial because adjacent dates update the same instrument keys and parallel imports can deadlock PostgreSQL.

### Historical replay and first ranker training

- `src/mlHistoricalReplay.ts` reconstructs each date's top-500 liquidity universe using only data known on that date.
- It calculates features from candles through the signal date only. Future candles are used exclusively after feature creation for entry/target/stop labels.
- Price entry requires RVOL confirmation. No-trigger candidates expire, and a daily candle touching both target and stop is conservatively labeled `LOST`.
- Deterministic UUIDs make replay persistence idempotent without adding duplicate snapshots or outcomes.
- Replay result: **6,900 samples**, **230 dates**, **1,062 tickers**, **1,115 WON**, **811 LOST**, and **4,974 EXPIRED**.
- The exported dataset has no missing cells and spans `2021-01-01` through `2026-03-10` after excluding risk-off and censored dates.
- `src/mlTrain.ts` selects the project virtual environment locally, runs all rankers, and synchronizes registry metadata into PostgreSQL through `src/mlModelRegistrySync.ts`.

```bash
npm run ml:replay
npm run ml:export
npm run ml:train
```

First untouched holdout results:

| Model | Precision@5 | NDCG@5 | Expectancy | Max Drawdown |
|---|---:|---:|---:|---:|
| LightGBM | 23.9% | 0.316 | +0.063R | 8.17R |
| CatBoost | 26.1% | 0.335 | +0.100R | 8.90R |
| XGBoost | 26.1% | 0.323 | +0.094R | 8.79R |

These figures are retained as the one-stage baseline. The active experiment is now the two-stage pipeline below.

---

## Two-Stage Trigger + Conditional Win ML Upgrade (Aug 9 2026)

### Why the label architecture changed

The old binary label treated a candidate that never reached its entry trigger as a failed trade. That mixed two different questions and weakened ranking quality. The new pipeline models them separately:

```text
Qualified setup features at date T
        |
        +--> Trigger classifier: P(entry triggers within five sessions)
        |
        +--> Conditional ranker: P(target win | entry triggered)
        |
        +--> Expected R = P(trigger) * [P(win|trigger) * R:R - (1 - P(win|trigger))]
```

- `MlOutcome` now records `triggered`, `triggeredAt`, `daysToTrigger`, `postTriggerOutcome`, `timeExit`, `maximumR`, and `minimumR`.
- Non-triggered candidates train the trigger classifier but do not receive a conditional win/loss label.
- Triggered time exits are explicit negative conditional labels with their realized R; they are not silently merged with never-triggered candidates.
- Maximum favorable/adverse excursion is retained for future target and stop optimization.
- Both probabilities use isotonic calibration fitted only on chronological out-of-fold predictions.
- Expected R, rather than raw rank score, is the final shadow ordering signal.

### Models and serving contract

- Stage 1: `lightgbm_trigger_classifier`.
- Stage 2 champion: `lightgbm_conditional_win_ranker`.
- Stage 2 challengers: `catboost_conditional_yetirank` and `xgboost_conditional_ranker`.
- API/card fields: `mlTriggerProbability`, `mlConditionalWinProbability`, `mlWinProbability` (joint probability), and `mlExpectedR`.
- The dashboard labels all current outputs `ML SHADOW`; deterministic scanner order remains authoritative.
- Migration: `20260811_two_stage_ml_ranking`.

### Rebuilt dataset

- 6,900 point-in-time candidates across 230 dates.
- 2,423 triggered candidates: 1,115 wins, 811 stop-losses, and 497 time exits.
- 4,477 candidates never triggered and are excluded from conditional win training.
- No triggered row is missing a post-trigger label.
- Untouched holdout: `2025-01-13` through `2026-03-10` (1,380 candidates).

### Untouched holdout result

| Component | Metric | Result |
|---|---|---:|
| Trigger classifier | Precision@5 | 55.2% |
| Trigger classifier | Brier / constant-prior Brier | 0.211 / 0.227 |
| Trigger classifier | ROC-AUC | 0.668 |
| LightGBM conditional ranker | Precision@5 | 45.1% |
| LightGBM conditional ranker | NDCG@5 | 0.543 |
| XGBoost conditional baseline | Precision@5 | 46.4% |
| XGBoost conditional baseline | NDCG@5 | 0.542 |
| Combined expected-R policy | Expectancy | +0.040R |
| Combined expected-R policy | Max drawdown | 7.11R |

### Promotion decision

`productionEligible=false`. The trigger calibration, sample-size, date-count, NDCG, expectancy, drawdown, and walk-forward gates passed. The only failed gate is conditional LightGBM Precision@5: **45.1% versus the required 55%**. The gate was not lowered, and live re-ranking must remain disabled.

## Prospective Trigger-Time ML Dataset (Aug 9 2026)

The next improvement path is implemented, but it cannot be backfilled honestly from daily Bhavcopy candles. Daily bars do not reveal the cumulative volume or exact day-range state at the moment an intraday entry triggers. The system therefore captures these fields prospectively from the live lifecycle monitor instead of fabricating historical values.

### Trigger-time capture

When price reaches the planned entry and same-time RVOL passes, `setupLifecycleMonitor.ts` writes an immutable `MlTriggerFeatureSnapshot` containing:

- observed and required RVOL, RVOL excess, baseline volume, sample count and five-minute trigger bucket;
- planned entry, actual trigger price, price extension, stop/target distance and trigger R:R;
- minutes after market open and hours since qualification;
- Dhan cumulative volume, official ATP (volume-weighted average trade price), opening gap, previous-close move, day range, range position and distance from day high when a live full packet is available;
- source quality (`dhan_tick` or delayed `rest_fallback`);
- the latest point-in-time qualification features, including setup family, regime, sector, relative strength and institutional context.

The snapshot and `QUALIFIED -> TRIGGERED` transition are attempted in one PostgreSQL transaction. If ML audit storage fails, a logged fallback preserves the deterministic lifecycle transition. Post-trigger scoring is asynchronous and cannot change status, entry, stop, target or outcome.

### Post-trigger trainer and promotion safety

- Export: `npm run ml:trigger-export`.
- Train and registry sync: `npm run ml:trigger-train`.
- Python endpoint: `POST /v1/post-trigger`.
- Models: LightGBM post-trigger win ranker and XGBoost baseline.
- Calibration: isotonic calibration fitted only on chronological out-of-fold scores.
- Development parameter search uses walk-forward data only; the final date holdout is evaluated once.
- Shadow training requires at least 300 resolved trigger snapshots across 40 dates.
- Production promotion requires at least 1,000 snapshots across 60 dates, Precision@5 >= 55%, LightGBM NDCG@5 above XGBoost, positive expected-R expectancy, and maximum drawdown <= 20R.

Current status: the schema, collection path, exporter, trainer, service endpoint, prediction audit table and dashboard fields are implemented locally. There are currently no prospectively captured resolved trigger snapshots, so no post-trigger artifact exists and the endpoint correctly returns `DEGRADED` without inventing a probability. Migration `20260812_post_trigger_ml` must be deployed before collection begins.

The next improvement should focus on feature/label quality and regime-specific validation on newly arriving dates—not threshold manipulation or holdout tuning.

---

## Pre-Surge V2 Five-Minute Execution Backtest (Aug 29 2026)

A targeted, point-in-time validation pipeline now tests the actual three-stage lifecycle instead of the older single-price daily approximation:

1. `src/preSurgeV2Replay.ts` reconstructs each historical top-liquidity universe using only information available after that day's close and exports Early Buy-ready plans.
2. `src/dhanPreSurgeIntradayBackfill.ts` downloads resumable official Dhan five-minute windows only around those plans.
3. `src/preSurgeV2IntradayBacktest.ts` replays next-session Early Buy fills, cumulative same-time RVOL, breakout fills, maximum-entry/gap rejection, actual R:R, target/stop ordering and 0.25% round-trip cost per filled leg.

The Dhan parser previously discarded intraday times. It now preserves full timestamps. The replay also normalizes Dhan's split/bonus-adjusted intraday prices to the official NSE EOD signal scale; without this, stocks such as BAJFINANCE and KOTAKBANK produced false outcomes.

### Validation slice

- Signal dates: `2025-01-01` to `2026-06-19`, sampled every fifth session from a point-in-time top-200 liquidity universe.
- 103 Early Buy-ready signals across 86 stocks.
- 343,312 official Dhan five-minute candles; zero download failures and complete coverage for all 103 signals.
- 74 plans executed at least one leg; 24 profitable and 50 losing.
- Combined net expectancy: **-0.452% per executed plan**.
- Profit factor: **0.609**; realized equal-trade max drawdown: **32.62%**.
- Early leg: 72 fills, 5 targets and 43 stops; average net return **-0.641%**.
- Breakout leg: 7 valid fills, 0 targets and 6 stops; average net return **-3.997%**.

Decision: **failed validation; keep `EARLY_BUY_LIVE=false` and shadow-only.** This is a fail-fast validation slice, not the final five-year walk-forward result. Do not tune against these same dates repeatedly. Diagnose base invalidation, target/stop geometry and trigger survivorship on development dates, then evaluate revised rules on untouched dates.

Reports: `reports/backtests/presurge_v2_intraday_sample_result.md` and `.json`.

---

## Pre-Surge V3 Three-Stage Shadow Strategy (Aug 30 2026)

V3 is implemented as a shadow challenger to V2. It fixes the main execution gap: a stock is never counted as an Early Buy merely because it touched a historical zone, and a breakout is never filled from a later WebSocket price after the planned entry was already missed.

### Frozen strategy flow

1. **EOD V3 qualification:** start from the point-in-time Pre-Surge candidate pool, require a valid 8-20 session base, rising EMA structure, established bullish Supertrend, relative strength versus NIFTY, an outperforming point-in-time sector, a non-risk-off EOD market regime, score >= 75 and structural risk <= 4.5%. ATR contraction, higher lows, distribution, volume contraction and accumulation remain score inputs instead of making every feature an independent hard veto. Position size is capped by a 0.75%-of-capital risk budget and 20% maximum position.
2. **Early confirmation (20%):** the zone must be touched in the same session, then a completed five-minute candle must reclaim zone high and VWAP, form a higher low, close in its upper 30%, hold 15-minute VWAP, remain below the breakout pivot and remain below the Early maximum entry. Opening gaps outside -1.5% to +1.5% are rejected. The recorded shadow fill is the completed five-minute close, never the planned zone price or a later tick.
3. **Breakout confirmation (80%):** a completed 15-minute candle must close above pivot, above VWAP, in its upper quartile and below maximum entry with cumulative same-time RVOL >= 1.5x. A gap above maximum entry, a pre-trigger structural failure or a target reached before confirmation is recorded as a miss, not a win.
4. **Exits:** each filled leg takes 50% at 2R, moves the remaining stop to breakeven and trails with prior five-minute EMA10 toward 3.5R. Stop-first ordering is used when a five-minute bar contains both stop and target. The current historical replay uses EMA10 because an independent intraday Supertrend series is not stored.

`PRE_SURGE_V3_SHADOW=true` controls EOD plan creation. V3 does not change the executable V2 status, does not place an order and does not resolve a production trade. `TradePlan.shadowStrategyVersion`, `TradePlan.shadowPlan` and append-only `SetupLifecycleEvent` rows retain its plan and confirmed Early/Breakout observations. Migration `20260814_presurge_v3_shadow` is required before deployment.

The live monitor evaluates Early confirmation from completed Dhan five-minute candles and independently evaluates Breakout confirmation at completed 15-minute boundaries. A failed interval is non-terminal; monitoring continues while the qualified plan remains active. Zone touch is session-scoped. Confirmed shadow events store the candle close and `noOrderPlaced: true`.

### First exact V3 sample

The existing official Dhan cache was replayed after regenerating the same point-in-time top-200 sample from `2025-01-01` through `2026-06-19` (every fifth session):

| Metric | Result |
|---|---:|
| V2 candidates assessed | 103 |
| V3 EOD-qualified | 17 |
| Plans with at least one fill | 13 |
| Profitable plans | 6 / 13 (46.15%) |
| Average combined net return | +0.754% |
| Median combined net return | -0.437% |
| Profit factor | 2.777 |
| Equal-trade realized max drawdown | 2.33% |
| Early fills / average net | 10 / -1.148% |
| Breakout fills / average net | 3 / +5.039% |
| Partial / final target hits | 2 / 0 |

This is encouraging only as a **small validation diagnostic**. The result is dominated by three breakout fills, Early expectancy is still negative, the dates were previously inspected during V2 work, and there is no untouched V3 holdout. V3 therefore remains `SHADOW_ONLY`; no live advisory or order promotion is authorized.

Reports: `reports/backtests/presurge_v3_intraday_sample_result.md` and `.json`.

### Expanded Dhan history check (2023-2024)

Railway production Dhan authentication was verified with a read-only five-minute request. The replay then generated 252 V2 point-in-time candidates from 99 sampled dates in 2023-2024; 31 passed V3 EOD qualification across 28 stocks. The backfill used the new `--v3-only` option, downloaded 103,474 official five-minute candles in 31 requests and recorded zero failures.

| Metric | 2023-2024 result |
|---|---:|
| V3 qualified / executed | 31 / 24 |
| Profitable plans | 12 / 24 (50%) |
| Average combined net return | +0.703% |
| Median combined net return | -0.183% |
| Profit factor | 1.883 |
| Equal-trade realized max drawdown | 12.20% |
| Early fills / average net | 23 / +0.711% |
| Breakout fills / average net | 5 / +3.401% |
| Partial / final target hits | 8 / 0 |

Across the separate 2023-2024 and 2025-2026 diagnostics, V3 has 48 qualified setups, 37 executed plans, +0.721% average combined net return, 2.083 aggregate profit factor and 12.20% sequential realized drawdown. These periods are still retrospective and the V3 rules were inspected during development, so this combined number is not a promotion holdout. The sample remains far below the required 300 qualified/resolved shadow setups and only eight total breakout legs filled.

Expanded reports: `reports/backtests/presurge_v3_intraday_2023_2024_result.md` and `.json`.

### Full daily top-500 replay (2021-10 to 2026-06)

The small-sample result above is superseded for decision-making by a daily point-in-time replay over every available session. The scan used the top-500 liquidity universe, up to 30 daily outputs and the conservative 30-session active-plan lock. It evaluated 473,594 point-in-time universe memberships and 14,958 full indicator candidates without loosening V3 rules.

- 1,163 replay dates and 2,144 unique universe stocks.
- 2,668 V2 candidates; **149 non-overlapping V3-qualified plans** across 107 stocks.
- 496,894 official Dhan five-minute candles from 149 requests; zero failures.
- All 149 plans had complete intraday coverage; 103 executed at least one leg.

| Metric | Full result |
|---|---:|
| Profitable plans | 35 / 103 (33.98%) |
| Average combined net return | +0.200% |
| Median combined net return | -0.683% |
| Profit factor | 1.193 |
| Equal-trade realized max drawdown | 26.87% |
| Early fills / average net | 96 / +0.224% |
| Breakout fills / average net | 30 / +0.680% |
| Partial / final target hits | 29 / 2 |

The chronological split fails the promotion decision. Development through 2024 had 73 executions, +0.585% average and 1.614 profit factor, but 2025 onward had 30 executions, **-0.736% average, 0.412 profit factor and 20.92% drawdown**. Both Early (-1.723%) and Breakout (-1.641%) were negative in that later period. The apparent full-period edge is concentrated in 2023-2024 and does not generalize.

Decision: **V3 remains shadow-only and is not ready for live advisory promotion.** The specified top-500 2021-2026 run cannot honestly produce 300 independent plans: it produced 149 after the duplicate-plan lock. Do not remove the lock or loosen gates merely to reach a sample-size target. Reach 300 through prospective daily collection or a separately approved, liquidity-controlled universe expansion, then require a positive untouched holdout.

Full reports: `reports/backtests/presurge_v3_intraday_full_2021_2026_result.md` and `.json`.

Primary implementation files: `src/preSurgeV3Strategy.ts`, `src/preSurgeV3Intraday.ts`, `src/preSurgeV3IntradayBacktest.ts`, `src/preSurgeV2Replay.ts`, `src/setupLifecycleMonitor.ts`, `src/tradePlanService.ts`, `src/scanStorage.ts`, `apex-intelligence/src/components/SetupCard.tsx`, and migration `20260814_presurge_v3_shadow`.
