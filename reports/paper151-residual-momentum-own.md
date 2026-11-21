# 151 Strategies §3.7 Residual momentum — paper's own holding rule

Generated: 2026-11-21T11:02:11.489Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Top 10% by mean ÷ volatility of 12 monthly residuals vs NIFTY 50 (beta from 24 months); monthly rebalance.

Trader rules: top 50 candidates per day by score, at most 50 per industry, at most 50 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 50 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 2,390; trades taken: 2,389; exits delayed by suspension or a locked price: 13. Studies logged in the trial registry so far: 29 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1399 | ✅ |
| Average net return above 0 | +0.07% | ✅ |
| Lower end of 95% range above 0 | -0.57% | ❌ |
| Day-clustered average above 0 | +0.07% | ✅ |
| Still positive without the 5 best signal days | -1.37% | ❌ |
| Positive in at least 2 of 3 test years | 1 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -0.57% | ❌ |
| Portfolio: max drawdown ≤ 20% | 27.5% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -0.57% vs +2.13%; DD 27.5% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -0.02% | ❌ |
| Day-clustered excess vs control above 0 | -0.02% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 990 | 23 | 55.5% | +2.32% ± 0.78 | +2.37% | +0.42% |
| **Test** | 1,399 | 33 | 48.4% | +0.07% ± 0.64 | +0.07% | -1.37% |

Control group (all universe stocks, same day and exit): excess per trade, discovery +0.36% (day-clustered +0.37%); test -0.02% (day-clustered -0.02%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2022-03-02 → 2024-01-31 | +25.32% | 22.0% | +15.41% | 15.3% |
| **Test** | 2024-02-01 → 2026-10-30 | -0.57% | 27.5% | +2.13% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2022 | 470 | 11 | 46.8% | +0.28% ± 1.15 | +0.38% | -4.26% |
| 2023 | 520 | 12 | 63.3% | +4.16% ± 1.05 | +4.19% | +1.06% |
| 2024 (test) | 527 | 12 | 47.8% | -0.38% ± 1.02 | -0.40% | -3.36% |
| 2025 (test) | 496 | 12 | 47.4% | -0.27% ± 1.08 | -0.26% | -3.81% |
| 2026 (test) | 376 | 9 | 50.5% | +1.17% ± 1.29 | +1.13% | -3.38% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 516 | 12 | 58.7% | +3.70% ± 1.08 | +3.71% | +0.75% |
| Discovery, market down | 474 | 11 | 51.9% | +0.80% ± 1.12 | +0.91% | -4.46% |
| Test, market up | 768 | 18 | 51.8% | +1.08% ± 0.81 | +1.10% | -0.72% |
| Test, market down | 631 | 15 | 44.2% | -1.16% ± 1.03 | -1.17% | -4.76% |

Research output, not investment advice.
