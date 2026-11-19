# Sector momentum S2 (NIFTY above 50-day average)

Generated: 2026-11-19T15:00:18.586Z · evaluation harness v3 · pre-registered

Plan: [`sector-momentum-plan.md`](sector-momentum-plan.md). Thesis: Stocks in an industry that is moving together keep drifting for days as funds rotate in; buy its most liquid names.

Trader rules: top 5 candidates per day by score, at most 2 per industry, at most 5 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 5 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 41,466; trades taken: 724; exits delayed by suspension or a locked price: 2. Studies logged in the trial registry so far: 10 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 379 | ✅ |
| Average net return above 0 | -0.57% | ❌ |
| Lower end of 95% range above 0 | -1.03% | ❌ |
| Day-clustered average above 0 | -0.54% | ❌ |
| Still positive without the 5 best signal days | -0.81% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -14.95% | ❌ |
| Portfolio: max drawdown ≤ 20% | 44.1% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -14.95% vs +5.98%; DD 44.1% vs 15.8% | ❌ |
| Average excess vs control (all labelled universe stocks, same day and exit) above 0 | -0.19% | ❌ |
| Day-clustered excess vs control above 0 | -0.12% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 345 | 191 | 49.3% | +0.28% ± 0.49 | +0.31% | -0.04% |
| **Test** | 379 | 189 | 39.6% | -0.57% ± 0.46 | -0.54% | -0.81% |

Control group (all labelled universe stocks, same day and exit): excess per trade, discovery +0.14% (day-clustered +0.18%); test -0.19% (day-clustered -0.12%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-13 → 2024-01-04 | +5.90% | 15.8% | +14.33% | 17.2% |
| **Test** | 2024-01-03 → 2026-11-19 | -14.95% | 44.1% | +5.98% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 123 | 67 | 47.2% | -0.01% ± 0.83 | -0.16% | -0.76% |
| 2022 | 101 | 56 | 46.5% | +0.04% ± 0.88 | +0.21% | -0.62% |
| 2023 | 121 | 68 | 53.7% | +0.78% ± 0.84 | +0.86% | -0.00% |
| 2024 (test) | 157 | 80 | 41.4% | -0.29% ± 0.76 | -0.23% | -0.77% |
| 2025 (test) | 147 | 69 | 40.1% | -0.56% ± 0.66 | -0.65% | -1.22% |
| 2026 (test) | 75 | 40 | 34.7% | -1.18% ± 1.07 | -0.97% | -2.08% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 345 | 191 | 49.3% | +0.28% ± 0.49 | +0.31% | -0.04% |
| Discovery, market down | 0 | — | — | — | — | — |
| Test, market up | 379 | 189 | 39.6% | -0.57% ± 0.46 | -0.54% | -0.81% |
| Test, market down | 0 | — | — | — | — | — |

Research output, not investment advice.
