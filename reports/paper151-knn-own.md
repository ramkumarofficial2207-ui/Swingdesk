# 151 Strategies §3.17 Single-stock k-nearest neighbours — paper's own holding rule

Generated: 2026-11-21T11:02:50.197Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Predicted 10-session return from the 22 most similar past days (price and volume average ratios) > 0.4%; hold 10 sessions.

Trader rules: top 5 candidates per day by score, at most 20 per industry, at most 20 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 20 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 4,06,827; trades taken: 2,872; exits delayed by suspension or a locked price: 62. Studies logged in the trial registry so far: 47 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1407 | ✅ |
| Average net return above 0 | +0.21% | ✅ |
| Lower end of 95% range above 0 | -0.39% | ❌ |
| Day-clustered average above 0 | +0.33% | ✅ |
| Still positive without the 5 best signal days | +0.06% | ✅ |
| Positive in at least 2 of 3 test years | 2 of 3 | ✅ |
| Portfolio: net CAGR above 0 | +1.09% | ✅ |
| Portfolio: max drawdown ≤ 20% | 40.9% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | +1.09% vs +6.23%; DD 40.9% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.42% | ✅ |
| Day-clustered excess vs control above 0 | +0.53% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,465 | 411 | 49.5% | +0.83% ± 0.64 | +0.86% | +0.69% |
| **Test** | 1,407 | 492 | 43.9% | +0.21% ± 0.60 | +0.33% | +0.06% |

Control group (all universe stocks, same day and exit): excess per trade, discovery +0.33% (day-clustered +0.30%); test +0.42% (day-clustered +0.53%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-15 → 2024-01-12 | +17.76% | 38.6% | +14.79% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | +1.09% | 40.9% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 480 | 113 | 49.8% | +1.65% ± 1.18 | +2.10% | +1.08% |
| 2022 | 500 | 136 | 47.8% | -0.51% ± 1.03 | -0.58% | -1.12% |
| 2023 | 485 | 162 | 50.9% | +1.39% ± 1.10 | +1.19% | +0.97% |
| 2024 (test) | 494 | 172 | 44.7% | +0.59% ± 1.04 | +1.01% | +0.16% |
| 2025 (test) | 500 | 175 | 41.8% | -0.65% ± 0.95 | -0.52% | -1.34% |
| 2026 (test) | 413 | 145 | 45.3% | +0.79% ± 1.16 | +0.53% | +0.22% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 949 | 268 | 47.9% | +0.93% ± 0.81 | +0.93% | +0.66% |
| Discovery, market down | 516 | 143 | 52.3% | +0.63% ± 1.04 | +0.72% | +0.14% |
| Test, market up | 818 | 287 | 41.1% | -0.08% ± 0.77 | +0.26% | -0.35% |
| Test, market down | 589 | 205 | 47.7% | +0.61% ± 0.96 | +0.42% | +0.19% |

Research output, not investment advice.
