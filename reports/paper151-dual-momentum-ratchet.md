# 151 Strategies §4.1.2 Dual-momentum sector rotation — ratcheting-stop swing rule

Generated: 2026-11-21T11:28:20.427Z · evaluation harness v3 · pre-registered

Plan: [`paper151-ratchet-plan.md`](paper151-ratchet-plan.md). Thesis: Stocks of the top 10% industries by 6-month return (industry above its 100-day average), only when NIFTY 50 is above its 200-day average; monthly rebalance.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 44,529; trades taken: 1,043; exits delayed by suspension or a locked price: 1. Studies logged in the trial registry so far: 68 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 409 | ✅ |
| Average net return above 0 | -0.77% | ❌ |
| Lower end of 95% range above 0 | -1.28% | ❌ |
| Day-clustered average above 0 | -0.93% | ❌ |
| Still positive without the 5 best signal days | -0.90% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -7.35% | ❌ |
| Portfolio: max drawdown ≤ 20% | 22.1% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -7.35% vs +6.50%; DD 22.1% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks with an industry label, same day and exit) above 0 | -0.45% | ❌ |
| Day-clustered excess vs control above 0 | -0.51% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 634 | 401 | 51.7% | +0.39% ± 0.44 | +0.39% | +0.31% |
| **Test** | 409 | 256 | 40.8% | -0.77% ± 0.51 | -0.93% | -0.90% |

Control group (all universe stocks with an industry label, same day and exit): excess per trade, discovery +0.40% (day-clustered +0.43%); test -0.45% (day-clustered -0.51%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-08 | +5.46% | 8.4% | +15.33% | 17.2% |
| **Test** | 2024-01-04 → 2026-11-20 | -7.35% | 22.1% | +6.50% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 278 | 168 | 47.5% | -0.01% ± 0.67 | +0.15% | -0.17% |
| 2022 | 171 | 111 | 52.6% | +0.40% ± 0.87 | +0.09% | +0.06% |
| 2023 | 185 | 122 | 57.3% | +0.99% ± 0.76 | +1.00% | +0.74% |
| 2024 (test) | 228 | 140 | 43.9% | -0.38% ± 0.74 | -0.38% | -0.61% |
| 2025 (test) | 135 | 88 | 37.8% | -1.15% ± 0.82 | -1.35% | -1.57% |
| 2026 (test) | 46 | 28 | 34.8% | -1.56% ± 1.21 | -2.38% | -2.70% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 469 | 296 | 49.5% | +0.24% ± 0.52 | +0.26% | +0.12% |
| Discovery, market down | 165 | 105 | 58.2% | +0.83% ± 0.81 | +0.75% | +0.46% |
| Test, market up | 301 | 186 | 40.9% | -0.80% ± 0.60 | -0.99% | -1.04% |
| Test, market down | 108 | 70 | 40.7% | -0.67% ± 1.00 | -0.79% | -1.21% |

Research output, not investment advice.
