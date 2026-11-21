# 151 Strategies §4.1.2 Dual-momentum sector rotation — 5% swing rule

Generated: 2026-11-21T11:02:55.584Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Stocks of the top 10% industries by 6-month return (industry above its 100-day average), only when NIFTY 50 is above its 200-day average; monthly rebalance.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 44,529; trades taken: 1,619; exits delayed by suspension or a locked price: 2. Studies logged in the trial registry so far: 50 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 635 | ✅ |
| Average net return above 0 | -0.67% | ❌ |
| Lower end of 95% range above 0 | -0.95% | ❌ |
| Day-clustered average above 0 | -0.68% | ❌ |
| Still positive without the 5 best signal days | -0.76% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -9.71% | ❌ |
| Portfolio: max drawdown ≤ 20% | 25.0% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -9.71% vs +6.50%; DD 25.0% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks with an industry label, same day and exit) above 0 | -0.19% | ❌ |
| Day-clustered excess vs control above 0 | -0.15% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 984 | 514 | 35.7% | -0.23% ± 0.23 | -0.28% | -0.29% |
| **Test** | 635 | 352 | 30.2% | -0.67% ± 0.28 | -0.68% | -0.76% |

Control group (all universe stocks with an industry label, same day and exit): excess per trade, discovery +0.01% (day-clustered -0.05%); test -0.19% (day-clustered -0.15%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-04 | -5.19% | 18.9% | +15.64% | 17.2% |
| **Test** | 2024-01-04 → 2026-11-20 | -9.71% | 25.0% | +6.50% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 430 | 210 | 33.5% | -0.41% ± 0.35 | -0.50% | -0.56% |
| 2022 | 247 | 134 | 36.4% | -0.19% ± 0.47 | -0.10% | -0.35% |
| 2023 | 307 | 170 | 38.1% | -0.01% ± 0.42 | -0.17% | -0.20% |
| 2024 (test) | 356 | 181 | 31.5% | -0.55% ± 0.37 | -0.54% | -0.67% |
| 2025 (test) | 205 | 129 | 30.2% | -0.70% ± 0.50 | -0.62% | -0.92% |
| 2026 (test) | 74 | 42 | 24.3% | -1.16% ± 0.75 | -1.45% | -1.83% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 714 | 381 | 34.6% | -0.31% ± 0.27 | -0.35% | -0.39% |
| Discovery, market down | 270 | 133 | 38.5% | -0.03% ± 0.44 | -0.10% | -0.17% |
| Test, market up | 469 | 261 | 29.9% | -0.69% ± 0.33 | -0.73% | -0.81% |
| Test, market down | 166 | 91 | 31.3% | -0.60% ± 0.53 | -0.51% | -0.90% |

Research output, not investment advice.
