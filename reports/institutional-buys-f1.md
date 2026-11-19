# Institutional bulk buys F1 (all institutions)

Generated: 2026-11-19T15:18:27.930Z · evaluation harness v3 · pre-registered

Plan: [`institutional-buys-plan.md`](institutional-buys-plan.md). Thesis: A long-only institution buying ≥ 0.5% of a company in a day keeps buying for weeks, lifting the price after the deal is public.

Trader rules: top 5 candidates per day by score, at most 2 per industry, at most 5 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 5 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 477; trades taken: 294; exits delayed by suspension or a locked price: 2. Studies logged in the trial registry so far: 13 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 157 | ✅ |
| Average net return above 0 | -1.43% | ❌ |
| Lower end of 95% range above 0 | -3.22% | ❌ |
| Day-clustered average above 0 | -1.29% | ❌ |
| Still positive without the 5 best signal days | -2.25% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -16.28% | ❌ |
| Portfolio: max drawdown ≤ 20% | 43.3% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -16.28% vs +3.68%; DD 43.3% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -1.29% | ❌ |
| Day-clustered excess vs control above 0 | -1.36% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 137 | 109 | 40.9% | -0.98% ± 1.40 | -1.11% | -1.82% |
| **Test** | 157 | 136 | 38.2% | -1.43% ± 1.80 | -1.29% | -2.25% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -1.60% (day-clustered -1.57%); test -1.29% (day-clustered -1.36%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-18 → 2024-01-16 | -9.53% | 30.5% | +15.39% | 17.2% |
| **Test** | 2024-01-11 → 2026-11-04 | -16.28% | 43.3% | +3.68% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 41 | 34 | 36.6% | -1.66% ± 3.48 | -2.36% | -4.98% |
| 2022 | 37 | 28 | 37.8% | -1.22% ± 2.24 | -1.06% | -3.08% |
| 2023 | 59 | 47 | 45.8% | -0.36% ± 1.71 | -0.24% | -1.33% |
| 2024 (test) | 67 | 54 | 35.8% | -1.09% ± 2.05 | -1.27% | -2.48% |
| 2025 (test) | 57 | 49 | 36.8% | -1.27% ± 1.80 | -0.58% | -2.64% |
| 2026 (test) | 33 | 33 | 45.5% | -2.38% ± 6.89 | -2.38% | -6.48% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 98 | 79 | 42.9% | -0.66% ± 1.83 | -0.74% | -1.84% |
| Discovery, market down | 39 | 30 | 35.9% | -1.78% ± 1.78 | -2.10% | -3.22% |
| Test, market up | 113 | 95 | 38.1% | -1.15% ± 1.54 | -0.92% | -2.15% |
| Test, market down | 44 | 41 | 38.6% | -2.14% ± 5.09 | -2.14% | -4.76% |

Research output, not investment advice.
