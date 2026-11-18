# SwingDesk

[![CI](https://github.com/ramkumarofficial2207-ui/Swingdesk/actions/workflows/ci.yml/badge.svg)](https://github.com/ramkumarofficial2207-ui/Swingdesk/actions/workflows/ci.yml)

SwingDesk is a swing-trading research workspace for Indian equities (NSE, Nifty 500). It scans for setups after each session, tracks every setup from qualification to outcome, and measures whether each strategy actually makes money after costs before any of it is trusted with real capital.

> **Status: research stage.** No strategy has yet passed forward validation. SwingDesk runs in paper mode only and places no broker orders. Nothing here is investment advice.

## What it does

- **End-of-day scanning** of the Nifty 500 using finalized NSE market data
- **Setup lifecycle tracking**: qualified → confirmed → triggered → stopped, targeted or expired, with an append-only event log
- **Point-in-time replay and backtests** that only use information available on each historical date
- **Performance reporting**: net expectancy in R, drawdown, losing streaks and per-setup breakdowns, with insufficient-evidence warnings
- **Research workspace**: charts, financials, news, institutional activity, watchlists and paper trades

## How we validate strategies

Each strategy version is frozen, evaluated on dates it was not designed on, and then forward-tested on new sessions against criteria written down in advance. Rules for changing a strategy are in [CONTRIBUTING.md](CONTRIBUTING.md#strategy-rules-non-negotiable).

## Stack

TypeScript, Express and Prisma (PostgreSQL) on the backend; React and Vite in `apex-intelligence/`; Python (LightGBM, XGBoost, CatBoost) for research models in `python_ml/`, kept in shadow mode.

## Run locally

Requires Node 20+ and PostgreSQL.

```bash
npm ci
npm --prefix apex-intelligence ci
cp .env.example .env        # set DATABASE_URL and a strong JWT_SECRET
npx prisma migrate deploy
npm run dev:personal         # API + UI at http://127.0.0.1:5173
```

Paper-mode defaults in `.env.example`:

```env
PAPER_TRADING_MODE=true
ENABLE_LIVE_TRADING=false
ENABLE_AUTOMATION=false
```

See [SWINGDESK.md](SWINGDESK.md) for the personal workspace, data sources and EOD pipeline.

## Checks

```bash
npm test
npx tsc --noEmit
npm --prefix apex-intelligence run build
```

CI runs these on every pull request.

## Contributing

Work happens on short-lived branches merged through reviewed pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

Copyright © 2026 Ramkumar Ravichandran. All rights reserved. The source is visible for reference; see [LICENSE](LICENSE).
