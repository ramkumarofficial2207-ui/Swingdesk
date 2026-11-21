# 151 Strategies §3.14 Pivot support/resistance — ratcheting-stop swing rule

Generated: 2026-11-21T11:28:15.292Z · evaluation harness v3 · pre-registered

Plan: [`paper151-ratchet-plan.md`](paper151-ratchet-plan.md). Thesis: Close crosses above the pivot (H+L+C)/3 of the day before; sell at a close ≥ resistance 2C − L (max 20).

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 1,48,878; trades taken: 2,833; exits delayed by suspension or a locked price: 1. Studies logged in the trial registry so far: 65 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1433 | ✅ |
| Average net return above 0 | -0.46% | ❌ |
| Lower end of 95% range above 0 | -0.73% | ❌ |
| Day-clustered average above 0 | -0.51% | ❌ |
| Still positive without the 5 best signal days | -0.53% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -15.34% | ❌ |
| Portfolio: max drawdown ≤ 20% | 43.7% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -15.34% vs +6.23%; DD 43.7% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.06% | ✅ |
| Day-clustered excess vs control above 0 | +0.05% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,400 | 636 | 48.3% | -0.18% ± 0.26 | -0.18% | -0.24% |
| **Test** | 1,433 | 638 | 44.5% | -0.46% ± 0.27 | -0.51% | -0.53% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.14% (day-clustered -0.13%); test +0.06% (day-clustered +0.05%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-18 | -6.55% | 39.4% | +15.06% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -15.34% | 43.7% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 517 | 223 | 48.0% | -0.25% ± 0.44 | -0.30% | -0.42% |
| 2022 | 489 | 215 | 44.0% | -0.65% ± 0.45 | -0.70% | -0.76% |
| 2023 | 394 | 198 | 54.1% | +0.51% ± 0.48 | +0.53% | +0.38% |
| 2024 (test) | 494 | 217 | 46.6% | -0.38% ± 0.45 | -0.38% | -0.54% |
| 2025 (test) | 450 | 217 | 45.3% | -0.37% ± 0.49 | -0.42% | -0.55% |
| 2026 (test) | 489 | 204 | 41.7% | -0.63% ± 0.47 | -0.73% | -0.78% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 848 | 406 | 49.3% | -0.05% ± 0.34 | -0.05% | -0.10% |
| Discovery, market down | 552 | 230 | 46.7% | -0.36% ± 0.42 | -0.41% | -0.55% |
| Test, market up | 774 | 371 | 42.8% | -0.77% ± 0.36 | -0.78% | -0.85% |
| Test, market down | 659 | 267 | 46.6% | -0.11% ± 0.40 | -0.13% | -0.25% |

Research output, not investment advice.
