# 151 Strategies §3.4 Low-volatility anomaly — paper's own holding rule

Generated: 2026-11-21T11:02:09.508Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Lowest 10% by 252-session volatility; rebalance every 6 months (June and December).

Trader rules: top 50 candidates per day by score, at most 50 per industry, at most 50 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 50 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 461; trades taken: 461; exits delayed by suspension or a locked price: 0. Studies logged in the trial registry so far: 27 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 183 | ✅ |
| Average net return above 0 | +0.74% | ✅ |
| Lower end of 95% range above 0 | -1.46% | ❌ |
| Day-clustered average above 0 | +0.72% | ✅ |
| Still positive without the 5 best signal days | +0.00% | ❌ |
| Positive in at least 2 of 3 test years | 1 of 3 | ❌ |
| Portfolio: net CAGR above 0 | +1.22% | ✅ |
| Portfolio: max drawdown ≤ 20% | 16.7% | ✅ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | +1.22% vs -0.27%; DD 16.7% vs 15.8% | ✅ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.92% | ✅ |
| Day-clustered excess vs control above 0 | +0.89% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 278 | 6 | 65.1% | +8.86% ± 2.26 | +8.83% | -10.18% |
| **Test** | 183 | 4 | 52.5% | +0.74% ± 2.20 | +0.72% | +0.00% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -5.23% (day-clustered -5.22%); test +0.92% (day-clustered +0.89%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-07-01 → 2024-06-28 | +16.72% | 16.3% | +15.45% | 17.2% |
| **Test** | 2024-07-01 → 2026-06-30 | +1.22% | 16.7% | -0.27% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 92 | 2 | 35.9% | -2.15% ± 3.48 | -2.15% | +0.00% |
| 2022 | 93 | 2 | 81.7% | +12.65% ± 2.88 | +12.66% | +0.00% |
| 2023 | 93 | 2 | 77.4% | +15.95% ± 4.26 | +15.97% | +0.00% |
| 2024 (test) | 93 | 2 | 53.8% | +3.63% ± 3.07 | +3.68% | +0.00% |
| 2025 (test) | 90 | 2 | 51.1% | -2.24% ± 3.06 | -2.24% | +0.00% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 139 | 3 | 71.2% | +12.62% ± 3.36 | +12.61% | +0.00% |
| Discovery, market down | 139 | 3 | 59.0% | +5.10% ± 2.90 | +5.05% | +0.00% |
| Test, market up | 137 | 3 | 47.4% | -1.66% ± 2.42 | -1.67% | +0.00% |
| Test, market down | 46 | 1 | 67.4% | +7.89% ± 4.43 | +7.89% | +0.00% |

Research output, not investment advice.
