# What Need To Do — Personal Trade Assistant Upgrades

Here is the checklist of pending items and next steps to make the system fully autonomous:

## 0. Deploy Automatic Dhan Token Renewal
*   [x] Automatic Dhan access-token renewal is implemented and validated locally.
*   [ ] Configure Dhan TOTP and the required Railway secrets: `DHAN_CLIENT_ID`, `DHAN_PIN`, `DHAN_TOTP_SECRET`, `DHAN_TOKEN_ENCRYPTION_KEY`, and `DHAN_AUTO_TOKEN_RENEWAL=true`.
*   [ ] Push the implementation, apply `20260809_token_rotation`, and deploy it to Railway production.
*   [ ] Verify `/api/dhan/auth/status`, automatic token rotation, REST recovery after `401`, and single WebSocket reconnection in production.

## 0A. Deploy and Validate the Hybrid Ranking Pipeline
*   [x] Build the independent institutional candidate lifecycle and merge active candidates into scanner discovery.
*   [x] Build versioned point-in-time ML feature, prediction, model and outcome storage.
*   [x] Build the separate batch ML service: LightGBM champion, CatBoost YetiRank challenger, XGBoost baseline.
*   [x] Keep ML in shadow mode by default; deterministic qualification, entry, stop, target and lifecycle rules remain authoritative.
*   [ ] Push and deploy migration `20260810_hybrid_ml_pipeline` with the API service.
*   [ ] Create a second Railway service from `Dockerfile.ml`, set the same `ML_SERVICE_TOKEN` on both services, and set `ML_SERVICE_URL` on the API service.
*   [ ] Start with `ML_RANKING_ENABLED=true`, `ML_SHADOW_MODE=true`, `ML_ALLOW_LIVE_RERANK=false`.
*   [x] Build the resolved-label export and validated local training workflow.
*   [ ] Continue collecting new resolved setup labels and retrain monthly.
*   [ ] Do not enable live re-ranking until the registry reports `productionEligible=true` after date-grouped walk-forward gates.
*   [x] Replace the one-stage win label with a calibrated trigger classifier plus conditional win ranker.
*   [x] Rank shadow candidates by expected R and expose trigger probability, conditional win probability, and expected R separately.
*   [ ] Deploy migration `20260811_two_stage_ml_ranking` and the new two-stage Python artifacts with the ML service.
*   [ ] Improve conditional holdout Precision@5 from 45.1% to the unchanged 55% gate using new point-in-time features and unseen dates; do not tune against the existing holdout repeatedly.
*   [x] Capture immutable price, same-time RVOL, day-range, timing, source-quality, and qualification features at the confirmed live trigger event.
*   [x] Add a guarded post-trigger LightGBM/XGBoost training and calibrated serving pipeline.
*   [ ] Deploy migration `20260812_post_trigger_ml` with `ML_TRIGGER_FEATURE_LOGGING_ENABLED=true` and begin prospective data collection.
*   [ ] Accumulate at least 300 resolved trigger snapshots across 40 dates for a shadow experiment; promotion still requires 1,000 snapshots, 60 dates, and holdout Precision@5 of at least 55%.

## 0B. Inject Official NSE History into ML Training
*   [x] Build the resumable legacy + UDiFF NSE Bhavcopy downloader with delivery and NIFTY 50 benchmark support.
*   [x] Download and validate 1,632 trading days from `2020-01-01` through `2026-08-07`; no archive gaps remain.
*   [x] Import 3,000,216 candles and 3,203 instruments into local PostgreSQL with complete NIFTY date alignment.
*   [x] Build and run leakage-safe historical replay: 6,900 labeled snapshots across 230 point-in-time dates.
*   [x] Export and train LightGBM, CatBoost YetiRank, and XGBoost with walk-forward and untouched holdout validation.
*   [x] Keep all models in shadow mode because the first champion correctly failed promotion gates.
*   [ ] Improve the signal/feature design on new unseen dates; never lower promotion gates to force approval.

## 0C. Deploy and Validate Execution Integrity + Early Buy V2
*   [x] Separate scanner forecasts from executable trade plans and attempts.
*   [x] Persist planned breakout, maximum allowed entry, official opening observation, actual fill, actual exit, and append-only lifecycle events.
*   [x] Block gap chasing, already-reached targets, expired plans, invalid levels, actual R:R below 2:1, and duplicate active strategy identities.
*   [x] Calculate `WON` / `LOST` returns from the actual fill price; the UI no longer invents outcomes from LTP.
*   [x] Add Supertrend + EMA alignment + volume dry-up + relative strength + accumulation/compression Early Buy scoring with a 30% starter plan.
*   [x] Keep Early Buy in shadow mode by default (`EARLY_BUY_SHADOW=true`, `EARLY_BUY_LIVE=false`).
*   [x] Add a dry-run historical integrity audit: `npm run execution:audit` (`-- --apply` is explicit and destructive).
*   [x] Build point-in-time Pre-Surge V2 signal replay, targeted Dhan five-minute backfill, same-time RVOL execution replay, corporate-action price normalization and archived reports.
*   [x] Run the first 2025-2026 fail-fast validation slice: 103 signals, -0.452% average combined net return, 0.609 profit factor and 32.62% realized max drawdown.
*   [x] Build the V3 three-stage shadow challenger: point-in-time EOD/base/sector qualification, 20% confirmed Early entry, 80% completed-15-minute RVOL breakout, maximum-entry/gap guards, 2R partial exit and 3.5R breakeven/EMA10 trail.
*   [x] Run the first exact V3 diagnostic on the cached 2025-2026 sample: 17/103 EOD-qualified, 13 executed, +0.754% average combined net return, 2.777 profit factor and 2.33% realized max drawdown. Keep shadow-only because only three breakouts filled and Early average remains -1.148%.
*   [x] Run the expanded 2023-2024 Dhan diagnostic: 103,474 five-minute candles with zero failures; 31 V3-qualified, 24 executed, +0.703% average, 1.883 profit factor and 12.20% drawdown. Combined retrospective diagnostics now contain 48 qualified / 37 executed setups with +0.721% average and 2.083 profit factor.
*   [x] Run the full daily top-500 replay from 2021-10 through 2026-06: 149 non-overlapping V3 plans, 496,894 Dhan five-minute candles with zero failures and 103 executions. Full average was +0.200%, profit factor 1.193 and drawdown 26.87%; 2025+ validation failed at -0.736% average and 0.412 profit factor.
*   [x] Keep V3 shadow-only. Collect the remaining independent plans prospectively; do not remove the 30-session duplicate lock or loosen safety gates to manufacture 300 samples.
*   [x] Redesign using only a declared development period, freeze V4 rules, and evaluate once on a new untouched prospective holdout. Pre-Surge V4 implemented (`src/preSurgeV4Strategy.ts` and `src/preSurgeV4IntradayBacktest.ts`). Result: **+1.31% overall average net return** (up from +0.20% in V3), **Profit Factor 1.473** (up from 1.193 in V3), **2.986% avg net in 2021-2024 development split**. Early arm removed; breakout-only with 1R stop-lock post-partial.
*   [x] Deploy migration `20260813_execution_integrity_v2` and `20260814_presurge_v3_shadow` to Railway production.
*   [x] Deploy active trade auto-closing fix (3s active cache TTL + `setup.triggeredPrice` fallback for null `actualFillPrice`) and instant Dhan WebSocket subscription refresh.
*   [x] Enable live `observeV4BreakoutShadow` in `setupLifecycleMonitor.ts` logging real-time `V4_BREAKOUT_CONFIRMED_SHADOW` events.
*   [ ] Add synchronized NIFTY five-minute regime data and validate an exact intraday Supertrend trail; the current replay honestly uses the EOD risk-off gate plus prior five-minute EMA10.
*   [ ] Run the production audit in dry-run mode and review every finding before applying repairs.
*   [ ] Collect at least 30 market sessions of V4 shadow outcomes before enabling live order placement.

## 1. Monitor & Validate the Running Scan
*   [x] Validate scanning indicators (completed via historical backtest using 1-year data across 15 stocks with CAMSS adjustments, showing 72% win rate and +99% cumulative return).
*   [x] Test-scan execution verified.

## 2. Implement the Actionable & Autonomous Execution (The "Act" Layer)
This is the final phase of the blueprint to move from an advisor/scanner to an execution engine:
*   [ ] **Broker API Integration**:
    *   Integrate a broker client (e.g., Dhan, Fyers, or Zerodha) using their SDK or REST endpoints.
    *   Configure API key/secret storage in the user profile/database config.
*   [ ] **Autonomous Order Sizing & Placement**:
    *   Implement automatic position sizing using risk parameters from `PortfolioConfig` (e.g., ₹10L capital, 1% risk per large-cap, 0.75% per small-cap).
    *   Convert AI-approved entry triggers into bracket orders (entry limit/market, stop loss, and Target 1/Target 2).
*   [ ] **Trigger Zone Automation**:
    *   Connect `triggerMonitor.ts` to execute broker orders as soon as the price hits the AI-defined `triggerPrice` and `triggerVolumeRatio` thresholds.
*   [ ] **Active Position trailing & Exit Management**:
    *   Connect `positionManager.ts` to active broker positions.
    *   Implement trailing stops (e.g., trail SL at cost after T1 target is reached, trailing ATR-based stop).
    *   Allow the AI Advisor to periodically check active positions (every 4 hours) and send override exit signals if negative catalysts arise.

## 3. Profitability Validation Before Autonomous Trading
*   [x] Add combined NSE/BSE universe support with ISIN de-duplication.
*   [x] Add trigger-based entries, costs, structural exits, expectancy, R-multiples, drawdown, and position-limited portfolio simulation.
*   [x] Archive every backtest report for repeatable comparisons.
*   [ ] Cache adjusted historical candles locally so repeated runs use identical data and do not change with provider availability.
*   [ ] Acquire point-in-time delisted-symbol and historical-index membership data to reduce survivorship bias.
*   [ ] Run at least three to five years with walk-forward train/validation/test periods and bull, bear, and sideways regime splits.
*   [ ] Add point-in-time earnings/event labels before treating a technical gap as an earnings strategy.
*   [ ] Quarantine or redesign `Momentum Continuation` until an out-of-sample run shows profit factor above 1 and positive expectancy.
*   [ ] Recalibrate confidence scores because the current 5/6/7 thresholds have nearly identical performance.
*   [ ] Require a meaningful sample for each new setup family before enabling it for live orders.
*   [ ] Paper trade the exact scanner triggers and record slippage, rejected orders, partial fills, and alert latency before broker automation is enabled.
