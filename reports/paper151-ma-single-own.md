# 151 Strategies §3.11 Single moving average — paper's own holding rule

Generated: 2026-11-21T11:02:24.741Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Close crosses above its 50-day average; sell after a close below it (max 60 sessions).

Trader rules: top 5 candidates per day by score, at most 20 per industry, at most 20 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 20 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 22,637; trades taken: 2,287; exits delayed by suspension or a locked price: 3. Studies logged in the trial registry so far: 37 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1179 | ✅ |
| Average net return above 0 | -0.30% | ❌ |
| Lower end of 95% range above 0 | -0.86% | ❌ |
| Day-clustered average above 0 | -0.38% | ❌ |
| Still positive without the 5 best signal days | -0.48% | ❌ |
| Positive in at least 2 of 3 test years | 2 of 3 | ✅ |
| Portfolio: net CAGR above 0 | -7.90% | ❌ |
| Portfolio: max drawdown ≤ 20% | 35.8% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -7.90% vs +6.44%; DD 35.8% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -0.20% | ❌ |
| Day-clustered excess vs control above 0 | -0.20% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,108 | 464 | 23.0% | +0.61% ± 0.61 | +0.57% | +0.36% |
| **Test** | 1,179 | 491 | 19.1% | -0.30% ± 0.56 | -0.38% | -0.48% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.70% (day-clustered -0.84%); test -0.20% (day-clustered -0.20%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-02-23 | +9.57% | 38.8% | +15.85% | 17.2% |
| **Test** | 2024-01-09 → 2026-11-20 | -7.90% | 35.8% | +6.44% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 391 | 165 | 22.5% | +0.86% ± 1.10 | +0.65% | +0.17% |
| 2022 | 408 | 155 | 19.6% | -0.97% ± 0.65 | -0.99% | -1.44% |
| 2023 | 309 | 144 | 28.2% | +2.38% ± 1.42 | +2.15% | +1.65% |
| 2024 (test) | 342 | 152 | 24.0% | +0.58% ± 1.12 | +0.09% | -0.42% |
| 2025 (test) | 398 | 174 | 19.3% | +0.28% ± 1.00 | +0.51% | -0.31% |
| 2026 (test) | 439 | 165 | 15.0% | -1.51% ± 0.81 | -1.75% | -2.32% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 494 | 255 | 20.9% | +0.84% ± 0.93 | +0.58% | +0.32% |
| Discovery, market down | 614 | 209 | 24.8% | +0.43% ± 0.80 | +0.55% | -0.11% |
| Test, market up | 498 | 261 | 20.3% | -0.14% ± 0.83 | -0.26% | -0.78% |
| Test, market down | 681 | 230 | 18.2% | -0.41% ± 0.76 | -0.52% | -0.90% |

Research output, not investment advice.
