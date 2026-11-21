# 151 Strategies §3.7 Residual momentum — 5% swing rule

Generated: 2026-11-21T11:02:13.067Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Top 10% by mean ÷ volatility of 12 monthly residuals vs NIFTY 50 (beta from 24 months); monthly rebalance.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 50,402; trades taken: 3,510; exits delayed by suspension or a locked price: 2. Studies logged in the trial registry so far: 30 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 2119 | ✅ |
| Average net return above 0 | -0.46% | ❌ |
| Lower end of 95% range above 0 | -0.63% | ❌ |
| Day-clustered average above 0 | -0.46% | ❌ |
| Still positive without the 5 best signal days | -0.50% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -21.03% | ❌ |
| Portfolio: max drawdown ≤ 20% | 49.8% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -21.03% vs +6.23%; DD 49.8% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.11% | ✅ |
| Day-clustered excess vs control above 0 | +0.11% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,391 | 466 | 35.8% | -0.21% ± 0.20 | -0.22% | -0.29% |
| **Test** | 2,119 | 710 | 33.3% | -0.46% ± 0.17 | -0.46% | -0.50% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.01% (day-clustered -0.01%); test +0.11% (day-clustered +0.11%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2022-02-11 → 2024-01-05 | -10.64% | 31.6% | +12.42% | 15.3% |
| **Test** | 2024-01-02 → 2026-11-20 | -21.03% | 49.8% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2022 | 661 | 221 | 31.5% | -0.53% ± 0.28 | -0.54% | -0.71% |
| 2023 | 730 | 245 | 39.7% | +0.07% ± 0.27 | +0.07% | -0.03% |
| 2024 (test) | 738 | 246 | 33.1% | -0.40% ± 0.26 | -0.40% | -0.51% |
| 2025 (test) | 734 | 247 | 32.8% | -0.59% ± 0.32 | -0.59% | -0.71% |
| 2026 (test) | 647 | 217 | 34.0% | -0.38% ± 0.29 | -0.39% | -0.51% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 815 | 274 | 36.9% | -0.13% ± 0.26 | -0.14% | -0.23% |
| Discovery, market down | 576 | 192 | 34.2% | -0.34% ± 0.31 | -0.34% | -0.51% |
| Test, market up | 1,251 | 420 | 33.0% | -0.52% ± 0.23 | -0.52% | -0.58% |
| Test, market down | 868 | 290 | 33.6% | -0.38% ± 0.25 | -0.38% | -0.48% |

Research output, not investment advice.
