# Early-session study: pre-registered plan

Committed 2026-11-20, **before** any 5-minute history beyond the 50-stock pilot was looked at. Nothing below may change after the test period is run; a change means a new, separately logged study.

## Data

- Dhan 5-minute candles (`IntradayCandle`), 2023-11-20 → 2026-11-20, for every stock in the point-in-time top-500 universe on any day in that window (`npm run data:intraday-backfill`).
- Universe each day: top 500 by 20-session average turnover as of the **previous** session, EQ series only (same as the app).
- Sector labels: today's Nifty 500 industry list (known bias A11; stocks without a label are "Unknown" and never form a cluster).
- Known limit: Dhan has no history for stocks that stopped trading, so absolute returns are optimistic. Control groups use the same data.
- Excluded: weekend special sessions (Budget Sunday, Muhurat) and days with fewer than the six 09:15–09:40 bars.

## Periods

| Period | Dates | Use |
|---|---|---|
| Discovery | 2023-12-20 → 2024-12-31 (first month only builds the volume baseline) | Exploration allowed |
| **Test** | **2025-01-01 → 2026-11-20** | Run once per frozen candidate; decides pass or fail |

## Candidates

**Track A: v1 rules exactly as in the app** (`src/earlySession.ts`, `EARLY_RULES`, version `early-session-v1`): 2× opening volume vs the 20-session same-window median; sector with 4+ of the top 30 gainers at 3× its share; 09:45 price above the 09:15–09:30 high; stop at the 09:15–09:30 low, skipped if over 1.25%; target 1.5R; exit by 15:10. No tuning.

**Track B: open search, discovery period only.** Any intraday pattern (volume, range, gap, sector, time-of-day, ML ranking) may be explored on 2023-12 → 2024-12. Every pattern tried is logged in `reports/trial-registry.json`. **At most 2** candidates are frozen and committed, with exact rules, before the test period is run for them. Then each is run once on the test period.

## Execution (same for every candidate and control)

- Signal from completed bars up to 09:45. Entry at the **open of the 09:50 bar** if it is no more than 0.3% above the 09:45 price; otherwise no trade.
- Stop and target checked on 5-minute bars from the 09:50 bar on. If one bar touches both, it counts as the stop. A bar that opens beyond a level exits at its open.
- Time exit at the **open of the 15:10 bar** (F&O stocks have no continuous bars after 15:10 since 2026-08-03).
- Costs: **0.20% round trip** (intraday brokerage, STT on the sell, exchange fees, GST, stamp duty and slippage).
- Portfolio: at most 5 trades a day, at most 2 per sector, each sized at 0.5% of capital at risk and capped at 20% of capital.

## Controls (same days, same execution)

1. **Volume only:** stocks with 2× opening volume and an opening-range breakout, any sector.
2. **Sector only:** stocks in a clustered sector with an opening-range breakout, any volume.
3. **All breakouts:** every universe stock above its 09:15–09:30 high at 09:45.

## Pass rules (test period, all must hold)

1. At least 100 trades.
2. Average net return per trade above 0.
3. Lower end of the 95% range above 0.
4. Day-clustered average above 0.
5. Still positive without the 5 best days.
6. Positive in both test years (2025 and 2026).
7. Beats each of the three controls (average excess above 0).
8. Portfolio maximum drawdown no more than 15% (intraday, no overnight risk).

**If it passes:** the Morning tab label moves from Research only to **On trial**, with live paper tracking for 30 trades before Trusted.
**If it fails:** the result is reported plainly. The tab stays Research only, and the rules are not re-tuned on the test period.
