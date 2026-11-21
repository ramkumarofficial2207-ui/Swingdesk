# 151 Strategies §3.1 Price momentum (12-1) — 5% swing rule

Generated: 2026-11-21T11:02:09.012Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Top 10% by return from 252 to 21 sessions ago; monthly rebalance.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 66,884; trades taken: 4,350; exits delayed by suspension or a locked price: 20. Studies logged in the trial registry so far: 26 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 2133 | ✅ |
| Average net return above 0 | -0.46% | ❌ |
| Lower end of 95% range above 0 | -0.61% | ❌ |
| Day-clustered average above 0 | -0.46% | ❌ |
| Still positive without the 5 best signal days | -0.50% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -20.83% | ❌ |
| Portfolio: max drawdown ≤ 20% | 49.5% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -20.83% vs +6.23%; DD 49.5% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.12% | ✅ |
| Day-clustered excess vs control above 0 | +0.12% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 2,217 | 739 | 31.3% | -0.52% ± 0.16 | -0.52% | -0.58% |
| **Test** | 2,133 | 711 | 32.7% | -0.46% ± 0.16 | -0.46% | -0.50% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.26% (day-clustered -0.26%); test +0.12% (day-clustered +0.12%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-06 → 2024-01-17 | -23.14% | 55.0% | +14.95% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -20.83% | 49.5% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 738 | 246 | 30.4% | -0.55% ± 0.29 | -0.55% | -0.70% |
| 2022 | 744 | 248 | 29.8% | -0.67% ± 0.29 | -0.67% | -0.81% |
| 2023 | 735 | 245 | 33.9% | -0.35% ± 0.26 | -0.35% | -0.46% |
| 2024 (test) | 738 | 246 | 30.9% | -0.58% ± 0.28 | -0.58% | -0.71% |
| 2025 (test) | 744 | 248 | 33.2% | -0.43% ± 0.26 | -0.43% | -0.55% |
| 2026 (test) | 651 | 217 | 34.1% | -0.35% ± 0.28 | -0.35% | -0.46% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 1,443 | 481 | 30.9% | -0.56% ± 0.20 | -0.56% | -0.63% |
| Discovery, market down | 774 | 258 | 32.2% | -0.45% ± 0.28 | -0.45% | -0.60% |
| Test, market up | 1,263 | 421 | 31.8% | -0.54% ± 0.21 | -0.54% | -0.62% |
| Test, market down | 870 | 290 | 33.9% | -0.33% ± 0.25 | -0.33% | -0.43% |

Research output, not investment advice.
