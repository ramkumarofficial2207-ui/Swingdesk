# Accumulation B: first volume surge after the watchlist

Generated: 2026-11-20T18:59:12.936Z · evaluation harness v3 · pre-registered

Plan: [`accumulation-breakout-plan.md`](accumulation-breakout-plan.md). Thesis: Stocks that climb quietly for 20–25 sessions while big buyers add (rising delivery, slowly rising futures OI) tend to break out; buy before or at the start of the surge, not after it.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 8 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 8 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 116; trades taken: 105; exits delayed by suspension or a locked price: 0. Studies logged in the trial registry so far: 22 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 41 | ❌ |
| Average net return above 0 | -0.37% | ❌ |
| Lower end of 95% range above 0 | -1.49% | ❌ |
| Day-clustered average above 0 | -0.30% | ❌ |
| Still positive without the 5 best signal days | -1.17% | ❌ |
| Positive in at least 2 of 3 test years | 1 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -0.73% | ❌ |
| Portfolio: max drawdown ≤ 20% | 3.8% | ✅ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -0.73% vs +3.36%; DD 3.8% vs 15.8% | ✅ |
| Average excess vs control (every universe stock, same day and exit) above 0 | +0.32% | ✅ |
| Day-clustered excess vs control above 0 | +0.35% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 64 | 58 | 40.6% | -0.05% ± 0.89 | +0.16% | -0.44% |
| **Test** | 41 | 40 | 34.1% | -0.37% ± 1.13 | -0.30% | -1.17% |

Control group (every universe stock, same day and exit): excess per trade, discovery -0.14% (day-clustered +0.08%); test +0.32% (day-clustered +0.35%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-02-05 → 2024-01-04 | -0.15% | 5.1% | +13.83% | 17.2% |
| **Test** | 2024-01-11 → 2026-09-08 | -0.73% | 3.8% | +3.36% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 14 | 14 | 57.1% | +1.49% ± 1.96 | +1.49% | -0.25% |
| 2022 | 23 | 21 | 34.8% | -0.47% ± 1.43 | -0.35% | -1.88% |
| 2023 | 27 | 23 | 37.0% | -0.48% ± 1.36 | -0.18% | -1.64% |
| 2024 (test) | 13 | 12 | 23.1% | -1.17% ± 1.79 | -1.03% | -2.90% |
| 2025 (test) | 19 | 19 | 47.4% | +0.37% ± 1.63 | +0.37% | -1.14% |
| 2026 (test) | 9 | 9 | 22.2% | -0.76% ± 2.87 | -0.76% | -2.90% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 62 | 56 | 38.7% | -0.20% ± 0.89 | +0.00% | -0.62% |
| Discovery, market down | 2 | 2 | 100.0% | +4.60% ± 0.00 | +4.60% | +0.00% |
| Test, market up | 30 | 30 | 40.0% | -0.08% ± 1.28 | -0.08% | -1.02% |
| Test, market down | 11 | 10 | 18.2% | -1.15% ± 2.38 | -0.97% | -2.90% |

Research output, not investment advice.
