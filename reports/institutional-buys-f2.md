# Institutional bulk buys F2 (active funds only)

Generated: 2026-11-19T15:19:28.095Z · evaluation harness v3 · pre-registered

Plan: [`institutional-buys-plan.md`](institutional-buys-plan.md). Thesis: A long-only institution buying ≥ 0.5% of a company in a day keeps buying for weeks, lifting the price after the deal is public.

Trader rules: top 5 candidates per day by score, at most 2 per industry, at most 5 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 5 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 381; trades taken: 275; exits delayed by suspension or a locked price: 2. Studies logged in the trial registry so far: 14 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 152 | ✅ |
| Average net return above 0 | -0.90% | ❌ |
| Lower end of 95% range above 0 | -2.68% | ❌ |
| Day-clustered average above 0 | -1.07% | ❌ |
| Still positive without the 5 best signal days | -1.73% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -10.48% | ❌ |
| Portfolio: max drawdown ≤ 20% | 32.3% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -10.48% vs +3.68%; DD 32.3% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -0.95% | ❌ |
| Day-clustered excess vs control above 0 | -1.12% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 123 | 110 | 42.3% | -0.75% ± 1.47 | -0.95% | -1.69% |
| **Test** | 152 | 135 | 40.8% | -0.90% ± 1.79 | -1.07% | -1.73% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -1.56% (day-clustered -1.60%); test -0.95% (day-clustered -1.12%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-18 → 2024-01-16 | -6.92% | 25.7% | +15.39% | 17.2% |
| **Test** | 2024-01-11 → 2026-11-04 | -10.48% | 32.3% | +3.68% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 35 | 34 | 34.3% | -2.30% ± 3.95 | -2.47% | -5.73% |
| 2022 | 32 | 29 | 43.8% | -0.34% ± 2.06 | -0.60% | -2.46% |
| 2023 | 56 | 47 | 46.4% | -0.02% ± 1.73 | -0.07% | -1.02% |
| 2024 (test) | 64 | 53 | 37.5% | -0.64% ± 1.95 | -1.06% | -2.01% |
| 2025 (test) | 56 | 50 | 41.1% | -0.36% ± 1.56 | -0.26% | -1.66% |
| 2026 (test) | 32 | 32 | 46.9% | -2.35% ± 7.11 | -2.35% | -6.59% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 90 | 81 | 43.3% | -0.53% ± 1.89 | -0.71% | -1.82% |
| Discovery, market down | 33 | 29 | 39.4% | -1.35% ± 1.91 | -1.63% | -3.01% |
| Test, market up | 113 | 97 | 39.8% | -0.57% ± 1.39 | -0.76% | -1.55% |
| Test, market down | 39 | 38 | 43.6% | -1.84% ± 5.74 | -1.86% | -4.80% |

Research output, not investment advice.
