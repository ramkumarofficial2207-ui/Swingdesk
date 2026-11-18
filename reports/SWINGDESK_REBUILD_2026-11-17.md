# SwingDesk rebuild verification — 17 November 2026

Implemented the chosen light interface with two views: Workspace and Research Assistant. The workspace combines discovery/search, watchlist, holdings, charts, trade plans, financials, news/flows, and portfolio history. It opens without login, registration, or billing in explicit local personal mode.

Validation:

- Backend production build passed after stopping the running API to release the Prisma Windows DLL.
- Backend suite: 28 files, 113 tests passed, including new local-session boundaries, long-history retrieval/aggregation, and serializable paper-budget checks.
- Frontend TypeScript and Vite production build passed. Main JS bundle approximately 365 KB uncompressed, versus the earlier approximately 930 KB bundle.
- Automated Edge checks exercise desktop rendering, mobile width, five-year/all chart requests, research tabs, watchlist add/remove, symbol selection, paper-budget validation, entry, stop update, exit, capital settings, scan polling, chart retry, chat context/retry/persistence, and session retry. These actions use isolated fixture APIs; screenshots are explicitly illustrative test data.
- Live local API checks: health/readiness, personal session, capital, watchlist, portfolio, symbol search, research history, deep dive, five-year and all-history chart requests returned HTTP 200. Eight saved research setups loaded. Reliance five-year weekly history returned 261 bars; all-history monthly data returned 371 bars covering 1996-01-01 through 2026-11-16.

Database: reviewed the additive schema difference, then applied `prisma db push --skip-generate` to the existing localhost PostgreSQL database. This added three missing lifecycle tables, their indexes, and foreign keys. No existing tables or records were deleted. Historical migration baselining remains a separate maintenance task.

Limits: browser trade actions and AI replies were tested against fixtures; no real broker order or live model request was issued. These checks establish application behavior, not strategy profitability or model quality. Chart coverage depends on the provider and does not guarantee listing-date coverage. Paper P&L excludes fees and slippage. Existing strategy modules remain unchanged.

Run: `npm run dev:personal`, then open http://127.0.0.1:5173. See `SWINGDESK.md` for startup and verification details.
