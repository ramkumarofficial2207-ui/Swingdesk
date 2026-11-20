# Accumulation A: early dip while on the watchlist

Generated: 2026-11-20T18:56:34.323Z · evaluation harness v3 · pre-registered

Plan: [`accumulation-breakout-plan.md`](accumulation-breakout-plan.md). Thesis: Stocks that climb quietly for 20–25 sessions while big buyers add (rising delivery, slowly rising futures OI) tend to break out; buy before or at the start of the surge, not after it.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 8 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 8 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 386; trades taken: 260; exits delayed by suspension or a locked price: 0. Studies logged in the trial registry so far: 21 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 107 | ✅ |
| Average net return above 0 | -0.76% | ❌ |
| Lower end of 95% range above 0 | -1.45% | ❌ |
| Day-clustered average above 0 | -0.59% | ❌ |
| Still positive without the 5 best signal days | -1.02% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -3.76% | ❌ |
| Portfolio: max drawdown ≤ 20% | 10.8% | ✅ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -3.76% vs +1.29%; DD 10.8% vs 15.8% | ✅ |
| Average excess vs control (every universe stock, same day and exit) above 0 | -0.11% | ❌ |
| Day-clustered excess vs control above 0 | -0.02% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 153 | 124 | 32.0% | -0.49% ± 0.55 | -0.46% | -0.71% |
| **Test** | 107 | 94 | 30.8% | -0.76% ± 0.69 | -0.59% | -1.02% |

Control group (every universe stock, same day and exit): excess per trade, discovery -0.19% (day-clustered -0.19%); test -0.11% (day-clustered -0.02%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-06 → 2023-12-21 | -3.24% | 11.8% | +14.76% | 17.2% |
| **Test** | 2024-01-03 → 2026-10-01 | -3.76% | 10.8% | +1.29% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 40 | 32 | 20.0% | -1.33% ± 0.94 | -1.37% | -2.18% |
| 2022 | 51 | 41 | 39.2% | -0.00% ± 1.00 | +0.16% | -0.51% |
| 2023 | 62 | 51 | 33.9% | -0.35% ± 0.89 | -0.37% | -0.91% |
| 2024 (test) | 43 | 34 | 27.9% | -0.83% ± 1.03 | -0.48% | -1.55% |
| 2025 (test) | 44 | 42 | 31.8% | -0.85% ± 1.18 | -0.84% | -1.55% |
| 2026 (test) | 20 | 18 | 35.0% | -0.40% ± 1.52 | -0.23% | -2.06% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 140 | 111 | 33.6% | -0.39% ± 0.58 | -0.33% | -0.63% |
| Discovery, market down | 13 | 13 | 15.4% | -1.57% ± 1.53 | -1.57% | -2.92% |
| Test, market up | 83 | 72 | 27.7% | -1.05% ± 0.77 | -0.95% | -1.42% |
| Test, market down | 24 | 22 | 41.7% | +0.27% ± 1.50 | +0.56% | -0.87% |

Research output, not investment advice.
