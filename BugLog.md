# ApexScan AI - Bug Log

## 1. Scanner Button Not Connecting (ECONNREFUSED)

**Status**: ✅ Fixed

**Description**: 
When clicking the "Run Scanner" button in the Dashboard, it showed an error banner saying "Error: Could not connect to backend server. Make sure it is running." The button attempts to hit the `/api/scan` endpoint.

**Root Cause**: 
The frontend development server (Vite) was started in isolation (using `npm run dev` from inside the `/frontend` directory). This meant only the frontend UI was running on port 5173, but the Express backend server (which is supposed to run on port 3000) was completely offline. Therefore, Vite's API proxy was refusing the connection.

**Resolution**: 
Terminated the isolated frontend-only server. Started the full-stack development environment by running `npm run dev` from the **root** project directory. This utilizes `concurrently` to boot up both the Express backend server (`dev:server`) and the Vite frontend server (`dev:client`) simultaneously. The frontend proxy now successfully forwards `/api/scan` requests to the running backend.

---

## 2. "Run Scanner" Button Getting Stuck on Loading

**Status**: ✅ Fixed

**Description**: 
When clicking the "Run Scanner" button, the UI would change to "Scanning Market (1-2 mins)..." and get stuck in that state indefinitely, without showing any results or error messages, even if the backend failed.

**Root Cause**: 
The `fetch` request in the frontend lacked a timeout and did not check for `!res.ok` (non-200 HTTP responses). In the backend, the AI models (Gemini, Claude, Groq) were returning rate-limit (429) or model not found (404) errors. The backend got stuck in an extended retry loop and eventually returned an error status, but since the frontend `fetch` didn't catch the timeout or HTTP error properly, the button's `loading` state remained `true` forever.

**Resolution**: 
Updated the `runScanner` function in `DashboardPage.tsx` to include an `AbortController` with a 3-minute timeout. Also added explicit `res.ok` checks. Now, if the backend hangs for over 3 minutes or returns an HTTP error code, the frontend will correctly abort the request, stop the loading animation, and display a helpful error message to the user.

---

## 3. Registration MPIN Field Allowed Only Four Digits

**Status**: Fixed  
**Environment**: Production  
**Discovered**: 2026-08-02  
**Severity**: Medium

**Description**:  
The registration screen instructed users to create a 6-digit quick MPIN, but the input stopped accepting characters after four digits. Submitting the form then displayed `Please set a valid 6-digit quick MPIN.`

**Root Cause**:  
The registration MPIN input had `maxLength={4}`, while the frontend submit validation and backend API correctly required exactly six digits.

**Resolution**:  
Changed the input to use a shared `MPIN_LENGTH` value of 6 for its label, placeholder, minimum length, maximum length, numeric pattern, change handler, and submit validation. Added `inputMode="numeric"` to provide a numeric keypad on supported mobile devices.

**Verification**:  
The production UI build passed, Railway deployment succeeded, and the live JavaScript bundle was verified to enforce an exact 6-digit numeric MPIN. The production readiness endpoint returned HTTP 200.

**Fixed In**: Commit `eeae160` (`Fix registration credential constraints`)

---

## 4. Registration Password Requirement Displayed Conflicting Lengths

**Status**: Fixed  
**Environment**: Production  
**Discovered**: 2026-08-02  
**Severity**: Low

**Description**:  
The password placeholder stated that a minimum of 10 characters was required, but the hint beside the Password label incorrectly displayed `(Min 6 chars)`.

**Root Cause**:  
The hint contained a stale hard-coded value even though frontend submit validation and backend API validation already required a minimum of 10 characters.

**Resolution**:  
Introduced a shared `MIN_PASSWORD_LENGTH` value of 10 and used it for the hint, registration placeholder, browser `minLength` constraint, and frontend submit validation. Login mode retains its existing minimum-length behavior.

**Verification**:  
All 9 automated backend tests passed, both backend and production UI builds passed, Railway deployment succeeded, and the live production bundle was verified to display and enforce the 10-character registration minimum.

**Fixed In**: Commit `eeae160` (`Fix registration credential constraints`)

---

## 5. MPIN Login Mobile Field Reused the Password Login Identifier

**Status**: Fixed  
**Environment**: Production  
**Discovered**: 2026-08-02  
**Severity**: Medium

**Description**:  
After entering or autofilling a username/full name in Password Login and switching to Quick 6-Digit MPIN, the same text appeared in the Mobile Number field. Submitting the form then failed with `Provide a valid mobile number.`

**Root Cause**:  
Password Login and MPIN Login shared one `emailOrMobile` state value. Switching modes therefore reused the password-login identifier as the MPIN mobile number. The MPIN input also lacked mobile-specific normalization and autocomplete metadata.

**Resolution**:  
Separated the password identifier and MPIN mobile number into independent state values. The MPIN field now removes non-numeric characters while preserving an optional leading `+`, validates 10 to 15 digits before calling the API, and uses mobile-specific name, input mode, pattern, length, and autocomplete attributes. Password Login retains its existing email-or-mobile behavior.

**Verification**:  
Added regression tests covering saved full-name rejection, formatted-number normalization, and valid 10-to-15-digit numbers. All 12 automated tests passed, and both backend and production UI builds passed.

**Fixed In**: Commit `372c296` (`Fix MPIN login mobile identifier isolation`)

---

## 6. Navigating to Portfolio Crashed the Entire Application

**Status**: Fixed
**Environment**: Production
**Discovered**: 2026-08-02
**Severity**: High

**Description**:
Selecting Portfolio from the sidebar caused the React application to crash instead of rendering the portfolio dashboard.

**Root Cause**:
The current `/api/portfolio/intelligence` response uses `openHoldings`, `maxDamageTodayRs`, `maxDamageTodayPct`, and `suggestions`. `PortfolioPage` replaced its initialized state with that payload but still rendered the older fields `totalOpenPositions`, `totalCapitalRiskRs`, `capitalRiskPct`, and `warnings`. Calling `.toLocaleString()` on the missing `totalCapitalRiskRs` value threw a runtime exception.

**Resolution**:
Added a portfolio risk compatibility mapper that translates the current API fields to the view model, continues to support the legacy response shape, filters warning text, and converts missing, malformed, or non-finite numeric values to safe zero defaults. Existing portfolio trade, trailing-stop, close-position, and API behavior remain unchanged.

**Verification**:
Added regression tests for the current API response, the legacy response, and malformed data including the previously crashing `.toLocaleString()` call. All 15 automated tests passed, and both backend and production UI builds passed.

**Fixed In**: Commit `f1f8844` (`Fix Portfolio intelligence response crash`)

## 7. Scanner Remained at 20% for More Than 20 Minutes and Lost State After Refresh

**Status**: Fixed  
**Environment**: Production  
**Discovered**: 2026-08-02  
**Severity**: Critical

**Description**:  
Running the market scanner could remain at the synthetic 20% stage for more than 20 minutes. Refreshing the page reset the button but provided no indication whether the background scan was still running, failed, timed out, or completed with zero setups. The advertised 30-minute auto-scan was not active.

**Root Cause**:  
The API launched an in-memory background task and the UI estimated progress from coarse SSE messages. Failures did not produce a durable terminal state. The existing scheduler was never initialized, used server-local cron timing, and called the authenticated scan endpoint without a token. Scanning 1,300+ symbols with concurrency eight and running expensive validation across every qualified symbol made completion time unbounded for practical UI use.

**Resolution**:  
Added a PostgreSQL-backed `ScanJob` lifecycle with queued, running, completed, failed, and timed-out states. Manual and scheduled scans now share an internal coordinator with a ten-minute deadline, heartbeat, real processed/total progress, overlap prevention, and last-successful-result preservation. The liquidity-ranked universe defaults to 500 stocks with concurrency 12, while deep news and earnings validation is limited to the strongest 30 candidates. Added a separately controlled IST scheduler, closing scan, configurable NSE holidays, paper-only trade handoff, and dashboard polling that restores active scans after refresh and automatically publishes scheduled results.

**Verification**:  
Prisma schema validation passed, the backend TypeScript build passed, the production UI build passed, and all 21 automated tests passed, including scheduler timezone/flag coverage and paper-trading safety checks.

---

## 8. Signal Labs Displayed Corrupted Random Characters

**Status**: Fixed  
**Environment**: Production  
**Discovered**: 2026-08-02  
**Severity**: High

**Description**:  
Signal Labs rendered corrupted byte sequences in place of rupee symbols, section icons, the position multiplier, and action labels. Examples included text resembling `Ã`, `â`, and `ðŸ` throughout the page.

**Root Cause**:  
The source file already contained UTF-8 text that had been decoded and encoded more than once. The browser correctly rendered those corrupted source literals, so changing the HTML charset could not repair them.

**Resolution**:  
Removed all corrupted literals from the Signal Labs source. Currency now uses a stable Unicode escape and section decorations use the existing Lucide icon components. The page source was scanned to ensure no known mojibake sequences remain.

**Verification**:  
The UI TypeScript check and production Vite build passed. A source scan found no remaining corrupted character sequences in the UI TypeScript/TSX files.

---

## 9. Signal Labs Mixed Live, Historical, Placeholder, and Unqualified Data

**Status**: Fixed  
**Environment**: Production  
**Discovered**: 2026-08-02  
**Severity**: Critical

**Description**:  
The page labeled latest index closes as live, did not show source/session dates, left historical FII/DII and deal sections blank without an explanation, and described stock-level institutional accumulation as a technical confluence even when no current scanner setup matched it. The regime widget also read nonexistent `regimeScore` and `positionSizeMultiplier` properties.

**Root Cause**:  
The UI combined four independent API calls with `Promise.all`, so one failure cleared otherwise valid sections. Frontend regime property names did not match the scanner contract. The stock radar reused an institutional magnitude score without joining it to the current scanner result. FII/DII snapshots and NSE bulk deals were not refreshed together after each market close, and the bulk-deal importer split CSV rows on commas without respecting quoted names.

**Resolution**:  
Made each dataset independently resilient and added explicit source, as-of, stale, loading, error, and empty states. Market cards now distinguish an open session from the latest close. The regime uses the actual scanner fields (`positionSizeMult`, `dmaCrossPct`, detail, VIX, and scan timestamp). A stock candidate now requires recent positive classified bulk-deal accumulation plus a recent BUY/LIGHT BUY scanner setup with confidence of at least 7/10. Added a 4:10 PM IST daily institutional-data sync, startup warming for empty/stale datasets, and standards-compliant quoted CSV parsing.

**Verification**:  
Added regression coverage for candidate qualification, rejection of stale/unmatched/non-BUY data, quoted CSV fields, and malformed rows. All 25 automated tests passed, and both backend and production UI builds passed.

---

## 10. Active Trade Resolution Skipping Legacy/Manual Setups (Target Hit Not Closing)

**Status**: Fixed  
**Environment**: Production / Staging  
**Discovered**: 2026-08-30  
**Severity**: High

**Description**:  
When price reached the target or stop loss on an active trade card, the setup remained open in the database and on the dashboard UI instead of resolving to `WON` or `LOST`.

**Root Cause**:  
1. `resolveActiveSetup` in `setupLifecycleMonitor.ts` required `TradeAttempt.actualFillPrice` to be non-null and > 0. For legacy, manually seeded, or paper-traded setups where fill price was stored only as `triggeredPrice` on `HistoricalSetup`, `actualFillPrice` returned null/0, causing the function to silently abort resolution.
2. Active trade cache TTL was set to 10 seconds (`QUALIFIED_CACHE_TTL_MS`), causing a delay between price ticks and target checks.
3. Live price WebSocket subscriptions for newly triggered setup cards were not refreshed immediately upon `BUY_TRIGGERED`, delaying tick streaming for up to 60 seconds.

**Resolution**:  
1. Added fallback to `setup.triggeredPrice` when `actualFillPrice` is null or 0 (`rawFill = execution?.attempt.actualFillPrice ?? setup.triggeredPrice ?? 0`).
2. Reduced active trade cache TTL to 3 seconds (`ACTIVE_CACHE_TTL_MS = 3_000`).
3. Added an immediate call to `refreshQualifiedSetupSubscriptions()` inside the `BUY_TRIGGERED` lifecycle transition.

**Verification**:  
TypeScript compilation passed without errors. In live production monitoring, target/stop resolution runs cleanly on every live tick within 3 seconds.

---

## 11. Railway Docker Build Failure (Missing Prisma Migrations & Helper Modules)

**Status**: Fixed  
**Environment**: Production (Railway)  
**Discovered**: 2026-08-30  
**Severity**: High

**Description**:  
Railway production deployment failed during Docker build (`npm run build` stage) with `TS2307: Cannot find module` errors and Prisma client missing schema tables.

**Root Cause**:  
1. Schema modifications in `prisma/schema.prisma` and generated SQL migrations (`20260813_execution_integrity_v2` and `20260814_presurge_v3_shadow`) were uncommitted locally and untracked in Git.
2. Helper strategy and integrity modules (`src/executionIntegrity.ts`, `src/preSurgeV2Replay.ts`, `src/tradePlanService.ts`, `src/preSurgeV3Intraday.ts`, `src/earlyBuyStrategy.ts`) and updated types in `src/types.ts` were untracked or unstaged in Git.

**Resolution**:  
1. Staged and committed `prisma/schema.prisma` and all SQL migrations under `prisma/migrations/`.
2. Staged and committed all strategy, integrity, and test helper modules in `src/`, `apex-intelligence/src/`, and `tests/`.
3. Pushed commit `d731b95` to GitHub `origin/main`.

**Verification**:  
Railway Docker build succeeded cleanly (`0 TS errors`), 16 PostgreSQL migrations were applied on production DB, and Railway deployment `2faf3b9f-bdf5-4842-b4d1-befc3095c006` transitioned to `SUCCESS`.

*Keep this file updated as new bugs are discovered and resolved.*
