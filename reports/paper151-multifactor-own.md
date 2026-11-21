# 151 Strategies §3.6 Multifactor (rank average) — paper's own holding rule

Generated: 2026-11-21T11:02:13.567Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Top 10% by the average demeaned rank of momentum, low volatility and residual momentum; monthly rebalance.

Trader rules: top 50 candidates per day by score, at most 50 per industry, at most 50 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 50 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 2,398; trades taken: 2,398; exits delayed by suspension or a locked price: 1. Studies logged in the trial registry so far: 31 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1403 | ✅ |
| Average net return above 0 | -0.18% | ❌ |
| Lower end of 95% range above 0 | -0.68% | ❌ |
| Day-clustered average above 0 | -0.20% | ❌ |
| Still positive without the 5 best signal days | -1.33% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -2.75% | ❌ |
| Portfolio: max drawdown ≤ 20% | 23.6% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -2.75% vs +2.13%; DD 23.6% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -0.29% | ❌ |
| Day-clustered excess vs control above 0 | -0.28% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 995 | 23 | 55.3% | +1.80% ± 0.61 | +1.82% | -0.01% |
| **Test** | 1,403 | 33 | 48.7% | -0.18% ± 0.50 | -0.20% | -1.33% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.18% (day-clustered -0.17%); test -0.29% (day-clustered -0.28%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2022-03-02 → 2024-01-31 | +19.46% | 19.1% | +15.41% | 15.3% |
| **Test** | 2024-02-01 → 2026-10-30 | -2.75% | 23.6% | +2.13% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2022 | 473 | 11 | 46.9% | +0.30% ± 0.90 | +0.34% | -4.00% |
| 2023 | 522 | 12 | 62.8% | +3.16% ± 0.82 | +3.18% | +0.39% |
| 2024 (test) | 527 | 12 | 48.8% | -0.06% ± 0.87 | -0.08% | -2.58% |
| 2025 (test) | 500 | 12 | 48.6% | -0.09% ± 0.82 | -0.10% | -2.78% |
| 2026 (test) | 376 | 9 | 48.7% | -0.47% ± 0.92 | -0.50% | -4.82% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 518 | 12 | 55.6% | +2.20% ± 0.81 | +2.20% | -0.71% |
| Discovery, market down | 477 | 11 | 54.9% | +1.37% ± 0.93 | +1.42% | -3.17% |
| Test, market up | 770 | 18 | 54.0% | +0.94% ± 0.64 | +0.93% | -0.29% |
| Test, market down | 633 | 15 | 42.2% | -1.54% ± 0.78 | -1.55% | -4.58% |

Research output, not investment advice.
