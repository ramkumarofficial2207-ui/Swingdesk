# 151 Strategies §3.9 Industry-neutral mean-reversion — paper's own holding rule

Generated: 2026-11-21T11:02:15.883Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Bottom 10% by 5-session return minus own industry average; hold 5 sessions.

Trader rules: top 5 candidates per day by score, at most 25 per industry, at most 25 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 25 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 47,630; trades taken: 7,227; exits delayed by suspension or a locked price: 26. Studies logged in the trial registry so far: 33 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 3534 | ✅ |
| Average net return above 0 | -0.14% | ❌ |
| Lower end of 95% range above 0 | -0.35% | ❌ |
| Day-clustered average above 0 | -0.14% | ❌ |
| Still positive without the 5 best signal days | -0.24% | ❌ |
| Positive in at least 2 of 3 test years | 1 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -9.48% | ❌ |
| Portfolio: max drawdown ≤ 20% | 45.4% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -9.48% vs +6.23%; DD 45.4% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks with an industry label, same day and exit) above 0 | +0.14% | ✅ |
| Day-clustered excess vs control above 0 | +0.14% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 3,693 | 741 | 49.4% | +0.33% ± 0.21 | +0.33% | +0.23% |
| **Test** | 3,534 | 707 | 44.5% | -0.14% ± 0.21 | -0.14% | -0.24% |

Control group (all universe stocks with an industry label, same day and exit): excess per trade, discovery +0.32% (day-clustered +0.32%); test +0.14% (day-clustered +0.14%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-05 | +15.17% | 30.3% | +15.71% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -9.48% | 45.4% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 1,237 | 248 | 49.3% | +0.55% ± 0.34 | +0.54% | +0.35% |
| 2022 | 1,239 | 248 | 45.8% | -0.14% ± 0.36 | -0.14% | -0.36% |
| 2023 | 1,217 | 245 | 53.1% | +0.59% ± 0.38 | +0.60% | +0.33% |
| 2024 (test) | 1,229 | 246 | 46.9% | +0.21% ± 0.36 | +0.21% | -0.06% |
| 2025 (test) | 1,240 | 248 | 42.7% | -0.42% ± 0.35 | -0.42% | -0.64% |
| 2026 (test) | 1,065 | 213 | 43.8% | -0.22% ± 0.36 | -0.22% | -0.50% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 2,411 | 483 | 49.1% | +0.33% ± 0.23 | +0.32% | +0.22% |
| Discovery, market down | 1,282 | 258 | 49.9% | +0.34% ± 0.41 | +0.34% | +0.06% |
| Test, market up | 2,084 | 417 | 43.0% | -0.30% ± 0.24 | -0.30% | -0.45% |
| Test, market down | 1,450 | 290 | 46.6% | +0.09% ± 0.37 | +0.09% | -0.14% |

Research output, not investment advice.
