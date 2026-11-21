# "151 Trading Strategies" equity baselines: pre-registration

Committed **before** running. Rules, parameters and the decision rule below may not be changed after seeing results. Source: Kakushadze & Serur, *151 Trading Strategies* (SSRN 3247865, 2018), §3 Stocks and the equity parts of §4. Parameters come from the paper (or the literature it cites), not from SwingDesk data, so nothing here is tuned.

Code: `src/research/paper151/baselines.ts` (pure, point-in-time), `src/research/cards/paper151.ts` (cards and run), `npm run research:paper151`.

## Common setup

| Item | Rule |
|---|---|
| Universe | Daily top 500 company shares by 20-session turnover (ISIN `INE…`, series EQ), split/bonus adjusted, point-in-time |
| Signal time | Close of the signal session (data up to that close only) |
| Entry | Next session's open |
| Costs | 0.4% round trip on every trade |
| Periods | Discovery: signals from 2021-01-01 to 2023-12-31. **Test: 2024-01-01 → latest (2026-11).** |
| Long only | The paper's dollar-neutral versions need shorting; Indian cash equities allow only the long leg. Every strategy below is the paper's **long leg** |
| Evaluation | Harness v3 (`judge`): ≥ 100 test trades, average net > 0, lower end of 95% range > 0, per-day average > 0, positive without the 5 best signal days, positive in ≥ 2 of 3 test years, portfolio CAGR > 0, max drawdown ≤ 20%, beats NIFTY 50 CAGR or has a lower drawdown; plus a **control group** (average and per-day excess > 0) |

## The 13 strategies

| ID | § | Rule (long leg) | Own holding rule |
|---|---|---|---|
| MOMENTUM | 3.1 | Top 10% by return from 252 to 21 sessions ago (cumulative, skip 1 month) | Monthly: buy at month-end, hold to next month-end; 50 positions, equal weight |
| LOW_VOL | 3.4 | Lowest 10% by 252-session daily volatility | Every 6 months (June and December month-ends); 50 positions |
| RESIDUAL_MOMENTUM | 3.7 | Top 10% by mean ÷ sd of 12 monthly residuals (skip 1 month); residual = stock return − β × NIFTY 50 return, β from 24 months | Monthly, 50 positions |
| MULTIFACTOR | 3.6 | Top 10% by the average demeaned rank (formulas 276–277) of the three factors above | Monthly, 50 positions |
| INDUSTRY_REVERSION | 3.9 / 3.9.1 | 5-session log return minus own-industry average (industries with ≥ 5 universe members); buy the bottom 10% (below average only) | Hold 5 sessions; ≤ 5 new per day, ≤ 25 open |
| IBS | 4.4 | Bottom 10% by (close − low) ÷ (high − low) | Hold 1 session (next open → that close); 5 per day |
| MA_SINGLE | 3.11 | Close crosses above its 50-day SMA | Sell at next open after a close below the 50-day SMA; max 60 sessions; ≤ 5 new per day, ≤ 20 open |
| MA_TWO | 3.12 | 10-day SMA crosses above 30-day (the paper's example lengths) | Sell after the 10-day crosses back below or a close > 2% below the previous close (the paper's Δ = 2%); max 60 |
| MA_THREE | 3.13 | 3 > 10 > 21-day SMA newly true (the paper's example lengths) | Sell after 3-day ≤ 10-day; max 60 |
| PIVOT | 3.14 | Close crosses above the pivot C = (H + L + C)/3 of the previous day | Sell after a close ≥ R = 2C − L (levels from the previous day); max 20 |
| DONCHIAN | 3.15 | Close at or below the lowest close of the previous 20 sessions (channel floor; the paper's basic rule) | Sell after a close at or above the highest close of the previous 20; max 60 |
| KNN | 3.17 | Predicted 10-session return > 0.4% (cost), k = ⌊√T*⌋ nearest of up to 500 past days (targets known at signal time), features min-max scaled | Hold 10 sessions; ≤ 5 new per day, ≤ 20 open |
| DUAL_MOMENTUM | 4.1.1 + 4.1.2 | Industries (equal-weight index of universe members, ≥ 5 members) in the top 10% (at least 2) by 6-month return and above their own 100-day average; only when NIFTY 50 is above its 200-day average (else cash) | Monthly; all universe members of those industries, up to 50 |

Ranking on a day with more candidates than slots: by the strategy's score; for the single-stock rules (MA, pivot, Donchian) by 20-session turnover (most liquid first).

## Deviations from the paper (stated up front)

1. **Long only** (see above).
2. **Residual momentum uses the market factor only** and a 24-month beta window instead of 36 with Fama-French factors: there is no Indian size/value factor series in the database, and the data starts in 2020, so 36 months would leave almost no discovery period.
3. **KNN features** are moving-average *ratios* (volume 5/20, price 5/20, price 20/50) instead of raw moving-average levels, so that past days are comparable after a price trend. Horizon T = 10 sessions; the paper leaves both choices to the trader.
4. **Industry labels** come from today's Nifty 500 list; stocks without a label are left out of INDUSTRY_REVERSION and DUAL_MOMENTUM and out of their control groups (the Phase 1 lesson: industry-label bias must be checked against a control drawn from the same labelled group).
5. Monthly positions are closed and re-bought at every rebalance, so 0.4% is charged on every holding every month. This **overstates** costs for stocks that stay in the basket (known from the monthly-momentum audit). Accepted as a conservative bias.
6. Low volatility is rebalanced every 6 months (the paper: hold 6–12 months, about as long as the volatility window).

## Two runs per strategy (26 trials)

- **Own rule**: the holding rule in the table, entries only on rebalance days. Control: all universe stocks on the same signal days, held for MOMENTUM/RESIDUAL/MULTIFACTOR/DUAL 21 sessions, LOW_VOL 126, INDUSTRY_REVERSION 5, IBS 1, MA_SINGLE/MA_TWO/MA_THREE/DONCHIAN 20, PIVOT 10, KNN 10.
- **5% swing rule** (SwingDesk's own rule): same signals every day, top 3 per day by score, at most 2 per industry, at most 15 open; buy next open (skip if > 3% gap up), target +5%, stop −2.5%, exit at the close of session 15. Control: all universe stocks with the same exit on the same days.

## Decision rule

A strategy/rule pair is **kept** only if, on the test period, **every** harness check and both control checks pass, **and** its average excess over the control in the discovery period is also > 0.

- **Kept** → added to Auto Paper for forward paper tracking (the 5% rule ones as Auto Paper strategies; own-rule portfolios as a tracked basket). Never straight to Trusted: 26 trials means about one false pass is expected by chance.
- **Not kept** → not shown in the app as a signal. The code stays as a reusable baseline library (rankers and controls for future studies).
- Run once. No re-tuning on the test period. If the run crashes, it is fixed and re-run without changing the rules above.
