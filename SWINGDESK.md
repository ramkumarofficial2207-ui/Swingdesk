# SwingDesk local workspace

Start both services from the repository root:

```sh
npm run dev:personal
```

Open http://127.0.0.1:5173. The existing local PostgreSQL database configured by `DATABASE_URL` must be available. No login, registration, or payment screen is used in personal mode.

The Workspace combines stock discovery, watchlists, holdings, long-term charts, financials, news, institutional activity, and paper trade records. Research Assistant uses the selected symbol with the existing grounded chat service. Its last 40 questions are saved in this browser; previous messages are not sent to the model as conversation context.

Personal mode binds the API to loopback, requires an ephemeral local session token, and uses a separate personal account with an initial ₹1,00,000 paper budget. It is disabled under `NODE_ENV=production`. The EOD ingestion and scheduled research scans run in this mode. Yahoo Finance supplies historical prices and delayed quotes without a broker token; NSE supplies finalized daily market files. Notifications, broker order placement, and autonomous paper execution are disabled. Manual research scans remain available. Paper entries use available cash and configured account risk limits; realized P&L is gross of costs.

Personal scans use the official Nifty 500 constituent snapshot in `data/nifty500-constituents.csv`. The EOD pipeline checks the official list once per day, validates its size, and retains the previous list if the download fails. A membership change rebuilds that day's EOD selection before scanning. Run `npm run universe:refresh` to refresh manually. Set `SCANNER_UNIVERSE=broad` and rerun the scanner to compare the previous liquidity-ranked NSE universe with the same indicators and setup rules.

Discover shows only buy triggers recorded by the live lifecycle monitor. The separate EOD research panel evaluates recent completed scan cohorts against later finalized NSE candles: a close above the saved entry with at least 1.5× the prior 20-session average volume is labeled `EOD_CONFIRMED`; a close at or below the stop invalidates it; no confirmation within five sessions expires it. These after-close signals are research observations for a later session, not intraday buy confirmations. No broker orders are placed in personal mode.

Chart ranges: 1M, 6M, 1Y, 5Y, All. Daily, weekly, and monthly candles are supported. All requests the complete history returned by Yahoo Finance; it does not guarantee coverage back to a stock's listing date. Provider and date coverage appear below the chart. The scanner's shorter historical-data fetcher is unchanged.

## Verification

```sh
npm test
npm run build
npm --prefix apex-intelligence run build
node scripts/check-swingdesk-ui.cjs
```

The browser script needs the local frontend running and Microsoft Edge installed. It intercepts API calls with isolated fixtures so trading actions never touch the database. Screenshots and the check report are written under `reports/swingdesk-ui`. Stop the API before `npm run build` on Windows if Prisma cannot replace its loaded DLL.

## Local database repair

On 17 November 2026 the existing local database was missing `TradePlan`, `TradeAttempt`, and `SetupLifecycleEvent`. The reviewed additive difference is recorded in `reports/swingdesk-schema-diff.sql`; `prisma db push --skip-generate` added only those tables, their indexes, and foreign keys. Existing records were preserved. The older database's migration history is not baselined; do not run the entire migration chain against it without separately reconciling that history.

The previous App source is saved at `scratch/swingdesk-backup/App.tsx`. Existing strategy modules and legacy page files remain available. Strategy validation, model quality, and live execution are separate from this interface rebuild.

## Split and bonus adjustment

NSE daily files are raw, so a 1:1 bonus appears as a 50% one-day fall. Raw `DailyCandle` rows are never modified. Split, bonus and consolidation events are stored in `CorporateAction` and applied on read by `loadAdjustedDailySeries()` in `src/adjustedCandles.ts`; research and backtest code should use it instead of querying candles directly.

```sh
npm run data:corporate-actions               # fetch events for symbols with >25% one-day jumps, write reports/data-quality.md
npm run data:corporate-actions -- --report-only
```

Jumps that remain unexplained are listed in `reports/data-quality.md`. Many are genuine moves (March 2020, single-stock crashes); others are demergers or combined split + bonus actions. Do not drop them blindly. Add a `MANUAL` `CorporateAction` row only for a confirmed event; a manual row overrides the provider row for the same date.
