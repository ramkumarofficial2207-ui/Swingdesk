# Sector momentum S1 (no market filter)

Generated: 2026-11-19T14:58:27.227Z · evaluation harness v3 · pre-registered

Plan: [`sector-momentum-plan.md`](sector-momentum-plan.md). Thesis: Stocks in an industry that is moving together keep drifting for days as funds rotate in; buy its most liquid names.

Trader rules: top 5 candidates per day by score, at most 2 per industry, at most 5 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 5 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 67,090; trades taken: 1,092; exits delayed by suspension or a locked price: 2. Studies logged in the trial registry so far: 9 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 574 | ✅ |
| Average net return above 0 | -0.30% | ❌ |
| Lower end of 95% range above 0 | -0.71% | ❌ |
| Day-clustered average above 0 | -0.12% | ❌ |
| Still positive without the 5 best signal days | -0.52% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -12.82% | ❌ |
| Portfolio: max drawdown ≤ 20% | 41.8% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -12.82% vs +5.81%; DD 41.8% vs 15.8% | ❌ |
| Average excess vs control (all labelled universe stocks, same day and exit) above 0 | -0.02% | ❌ |
| Day-clustered excess vs control above 0 | +0.12% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 518 | 283 | 50.8% | +0.10% ± 0.41 | +0.09% | -0.12% |
| **Test** | 574 | 314 | 43.2% | -0.30% ± 0.41 | -0.12% | -0.52% |

Control group (all labelled universe stocks, same day and exit): excess per trade, discovery +0.03% (day-clustered -0.02%); test -0.02% (day-clustered +0.12%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-13 → 2024-01-04 | +1.98% | 30.9% | +14.33% | 17.2% |
| **Test** | 2024-01-03 → 2026-11-17 | -12.82% | 41.8% | +5.81% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 161 | 89 | 48.4% | -0.10% ± 0.71 | -0.21% | -0.66% |
| 2022 | 175 | 98 | 50.3% | -0.17% ± 0.69 | -0.21% | -0.55% |
| 2023 | 182 | 96 | 53.3% | +0.52% ± 0.72 | +0.68% | -0.12% |
| 2024 (test) | 200 | 116 | 46.0% | -0.21% ± 0.70 | +0.12% | -0.61% |
| 2025 (test) | 210 | 103 | 41.9% | -0.19% ± 0.71 | -0.22% | -0.77% |
| 2026 (test) | 164 | 95 | 41.5% | -0.53% ± 0.73 | -0.28% | -0.93% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 334 | 185 | 49.1% | +0.28% ± 0.50 | +0.35% | -0.05% |
| Discovery, market down | 184 | 98 | 53.8% | -0.23% ± 0.70 | -0.40% | -0.72% |
| Test, market up | 335 | 178 | 40.0% | -0.53% ± 0.51 | -0.41% | -0.82% |
| Test, market down | 239 | 136 | 47.7% | +0.04% ± 0.68 | +0.28% | -0.38% |

Research output, not investment advice.
