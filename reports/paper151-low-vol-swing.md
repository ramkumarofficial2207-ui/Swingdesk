# 151 Strategies §3.4 Low-volatility anomaly — 5% swing rule

Generated: 2026-11-21T11:02:10.923Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Lowest 10% by 252-session volatility; rebalance every 6 months (June and December).

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 66,888; trades taken: 3,053; exits delayed by suspension or a locked price: 0. Studies logged in the trial registry so far: 28 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1479 | ✅ |
| Average net return above 0 | -0.46% | ❌ |
| Lower end of 95% range above 0 | -0.64% | ❌ |
| Day-clustered average above 0 | -0.39% | ❌ |
| Still positive without the 5 best signal days | -0.50% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -15.29% | ❌ |
| Portfolio: max drawdown ≤ 20% | 43.4% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -15.29% vs +6.23%; DD 43.4% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.07% | ✅ |
| Day-clustered excess vs control above 0 | +0.17% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,574 | 664 | 40.2% | -0.08% ± 0.17 | -0.05% | -0.10% |
| **Test** | 1,479 | 631 | 35.0% | -0.46% ± 0.18 | -0.39% | -0.50% |

Control group (all universe stocks, same day and exit): excess per trade, discovery +0.23% (day-clustered +0.26%); test +0.07% (day-clustered +0.17%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-06 → 2024-01-18 | -3.26% | 25.1% | +14.73% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -15.29% | 43.4% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 571 | 229 | 39.8% | -0.01% ± 0.29 | -0.04% | -0.10% |
| 2022 | 580 | 233 | 35.3% | -0.41% ± 0.28 | -0.43% | -0.51% |
| 2023 | 423 | 202 | 47.3% | +0.28% ± 0.33 | +0.37% | +0.21% |
| 2024 (test) | 509 | 218 | 37.1% | -0.30% ± 0.30 | -0.17% | -0.40% |
| 2025 (test) | 480 | 212 | 37.7% | -0.33% ± 0.31 | -0.23% | -0.45% |
| 2026 (test) | 490 | 201 | 30.2% | -0.76% ± 0.30 | -0.79% | -0.86% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 990 | 432 | 39.3% | -0.15% ± 0.22 | -0.16% | -0.20% |
| Discovery, market down | 584 | 232 | 41.6% | +0.05% ± 0.29 | +0.15% | -0.04% |
| Test, market up | 775 | 357 | 37.2% | -0.38% ± 0.24 | -0.23% | -0.46% |
| Test, market down | 704 | 274 | 32.7% | -0.55% ± 0.26 | -0.60% | -0.64% |

Research output, not investment advice.
