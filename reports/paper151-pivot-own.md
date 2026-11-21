# 151 Strategies §3.14 Pivot support/resistance — paper's own holding rule

Generated: 2026-11-21T11:02:39.925Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Close crosses above the pivot (H+L+C)/3 of the day before; sell at a close ≥ resistance 2C − L (max 20).

Trader rules: top 5 candidates per day by score, at most 20 per industry, at most 20 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 20 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 1,48,878; trades taken: 5,026; exits delayed by suspension or a locked price: 5. Studies logged in the trial registry so far: 43 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 2426 | ✅ |
| Average net return above 0 | -0.30% | ❌ |
| Lower end of 95% range above 0 | -0.49% | ❌ |
| Day-clustered average above 0 | -0.29% | ❌ |
| Still positive without the 5 best signal days | -0.33% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -12.62% | ❌ |
| Portfolio: max drawdown ≤ 20% | 39.4% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -12.62% vs +6.23%; DD 39.4% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.02% | ✅ |
| Day-clustered excess vs control above 0 | -0.02% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 2,600 | 684 | 60.0% | -0.11% ± 0.17 | -0.14% | -0.14% |
| **Test** | 2,426 | 657 | 57.3% | -0.30% ± 0.20 | -0.29% | -0.33% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.51% (day-clustered -0.58%); test +0.02% (day-clustered -0.02%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-18 | -5.35% | 36.3% | +15.06% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -12.62% | 39.4% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 869 | 229 | 59.1% | +0.04% ± 0.32 | -0.01% | -0.09% |
| 2022 | 852 | 224 | 58.8% | -0.39% ± 0.29 | -0.38% | -0.49% |
| 2023 | 879 | 231 | 62.1% | +0.03% ± 0.29 | -0.02% | -0.11% |
| 2024 (test) | 822 | 221 | 59.6% | -0.35% ± 0.34 | -0.32% | -0.48% |
| 2025 (test) | 835 | 233 | 55.8% | -0.35% ± 0.32 | -0.17% | -0.42% |
| 2026 (test) | 769 | 203 | 56.6% | -0.18% ± 0.35 | -0.41% | -0.34% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 1,816 | 460 | 59.8% | +0.00% ± 0.20 | -0.07% | -0.06% |
| Discovery, market down | 784 | 224 | 60.6% | -0.35% ± 0.34 | -0.28% | -0.52% |
| Test, market up | 1,541 | 395 | 56.4% | -0.41% ± 0.24 | -0.32% | -0.47% |
| Test, market down | 885 | 262 | 59.0% | -0.09% ± 0.34 | -0.25% | -0.20% |

Research output, not investment advice.
