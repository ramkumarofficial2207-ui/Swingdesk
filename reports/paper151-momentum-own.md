# 151 Strategies §3.1 Price momentum (12-1) — paper's own holding rule

Generated: 2026-11-21T11:02:06.581Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Top 10% by return from 252 to 21 sessions ago; monthly rebalance.

Trader rules: top 50 candidates per day by score, at most 50 per industry, at most 50 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 50 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 3,182; trades taken: 3,171; exits delayed by suspension or a locked price: 80. Studies logged in the trial registry so far: 25 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1511 | ✅ |
| Average net return above 0 | +0.33% | ✅ |
| Lower end of 95% range above 0 | -0.41% | ❌ |
| Day-clustered average above 0 | +0.31% | ✅ |
| Still positive without the 5 best signal days | -1.64% | ❌ |
| Positive in at least 2 of 3 test years | 1 of 3 | ❌ |
| Portfolio: net CAGR above 0 | +1.41% | ✅ |
| Portfolio: max drawdown ≤ 20% | 32.6% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | +1.41% vs +2.13%; DD 32.6% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.22% | ✅ |
| Day-clustered excess vs control above 0 | +0.23% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,660 | 36 | 54.3% | +3.14% ± 0.76 | +3.15% | +1.56% |
| **Test** | 1,511 | 33 | 46.5% | +0.33% ± 0.74 | +0.31% | -1.64% |

Control group (all universe stocks, same day and exit): excess per trade, discovery +1.15% (day-clustered +1.16%); test +0.22% (day-clustered +0.23%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-02-01 → 2024-01-31 | +38.13% | 26.7% | +16.78% | 17.2% |
| **Test** | 2024-02-01 → 2026-10-30 | +1.41% | 32.6% | +2.13% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 549 | 12 | 54.5% | +4.04% ± 1.36 | +4.04% | +0.84% |
| 2022 | 550 | 12 | 44.0% | -0.50% ± 1.19 | -0.41% | -5.66% |
| 2023 | 561 | 12 | 64.2% | +5.82% ± 1.32 | +5.82% | +1.61% |
| 2024 (test) | 559 | 12 | 42.6% | -1.24% ± 1.17 | -1.26% | -4.89% |
| 2025 (test) | 538 | 12 | 46.5% | -0.15% ± 1.16 | -0.13% | -3.92% |
| 2026 (test) | 414 | 9 | 51.9% | +3.07% ± 1.55 | +3.00% | -2.98% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 876 | 19 | 54.6% | +3.80% ± 1.05 | +3.78% | +1.22% |
| Discovery, market down | 784 | 17 | 54.0% | +2.39% ± 1.08 | +2.44% | -1.10% |
| Test, market up | 825 | 18 | 48.0% | +0.64% ± 0.92 | +0.64% | -1.74% |
| Test, market down | 686 | 15 | 44.8% | -0.03% ± 1.19 | -0.08% | -4.60% |

Research output, not investment advice.
