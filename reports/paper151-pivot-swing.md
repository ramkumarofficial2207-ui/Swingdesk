# 151 Strategies §3.14 Pivot support/resistance — 5% swing rule

Generated: 2026-11-21T11:02:42.841Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Close crosses above the pivot (H+L+C)/3 of the day before; sell at a close ≥ resistance 2C − L (max 20).

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 1,48,878; trades taken: 3,814; exits delayed by suspension or a locked price: 0. Studies logged in the trial registry so far: 44 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1927 | ✅ |
| Average net return above 0 | -0.61% | ❌ |
| Lower end of 95% range above 0 | -0.76% | ❌ |
| Day-clustered average above 0 | -0.66% | ❌ |
| Still positive without the 5 best signal days | -0.65% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -24.45% | ❌ |
| Portfolio: max drawdown ≤ 20% | 56.1% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -24.45% vs +6.23%; DD 56.1% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -0.06% | ❌ |
| Day-clustered excess vs control above 0 | -0.10% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,887 | 712 | 36.2% | -0.29% ± 0.16 | -0.26% | -0.32% |
| **Test** | 1,927 | 689 | 32.0% | -0.61% ± 0.16 | -0.66% | -0.65% |

Control group (all universe stocks, same day and exit): excess per trade, discovery +0.00% (day-clustered +0.00%); test -0.06% (day-clustered -0.10%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-18 | -11.96% | 42.5% | +15.06% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -24.45% | 56.1% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 701 | 246 | 32.7% | -0.51% ± 0.26 | -0.50% | -0.60% |
| 2022 | 645 | 239 | 34.1% | -0.44% ± 0.27 | -0.51% | -0.57% |
| 2023 | 541 | 227 | 43.3% | +0.18% ± 0.31 | +0.28% | +0.12% |
| 2024 (test) | 668 | 239 | 32.9% | -0.49% ± 0.26 | -0.51% | -0.61% |
| 2025 (test) | 636 | 235 | 33.5% | -0.59% ± 0.28 | -0.69% | -0.71% |
| 2026 (test) | 623 | 215 | 29.4% | -0.74% ± 0.28 | -0.79% | -0.88% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 1,221 | 467 | 36.1% | -0.28% ± 0.20 | -0.25% | -0.32% |
| Discovery, market down | 666 | 245 | 36.3% | -0.30% ± 0.27 | -0.27% | -0.39% |
| Test, market up | 1,083 | 402 | 30.7% | -0.75% ± 0.21 | -0.81% | -0.81% |
| Test, market down | 844 | 287 | 33.6% | -0.42% ± 0.24 | -0.46% | -0.53% |

Research output, not investment advice.
