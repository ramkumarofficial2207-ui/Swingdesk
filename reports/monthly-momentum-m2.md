# Monthly momentum M2 (only when NIFTY is above its 200-day average)

Generated: 2026-11-19T15:28:52.803Z · evaluation harness v3 · pre-registered

Plan: [`monthly-momentum-plan.md`](monthly-momentum-plan.md). Thesis: Past-year winners (excluding the last month) keep beating other stocks for months; held as a monthly-rebalanced basket of 15.

Trader rules: top 15 candidates per day by score, at most 4 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 23,901; trades taken: 734; exits delayed by suspension or a locked price: 23. Studies logged in the trial registry so far: 16 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 304 | ✅ |
| Average net return above 0 | +1.11% | ✅ |
| Lower end of 95% range above 0 | -0.40% | ❌ |
| Day-clustered average above 0 | +1.43% | ✅ |
| Still positive without the 5 best signal days | -1.08% | ❌ |
| Positive in at least 2 of 3 test years | 2 of 3 | ✅ |
| Portfolio: net CAGR above 0 | +9.79% | ✅ |
| Portfolio: max drawdown ≤ 20% | 17.2% | ✅ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | +9.79% vs +7.37%; DD 17.2% vs 15.8% | ✅ |
| Average excess vs control (all universe stocks, same rebalance day and exit) above 0 | +0.69% | ✅ |
| Day-clustered excess vs control above 0 | +1.14% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 430 | 43 | 54.4% | +3.18% ± 1.50 | +1.30% | +1.24% |
| **Test** | 304 | 27 | 50.3% | +1.11% ± 1.51 | +1.43% | -1.08% |

Control group (all universe stocks, same rebalance day and exit): excess per trade, discovery +0.97% (day-clustered -0.42%); test +0.69% (day-clustered +1.14%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-02-01 → 2024-03-28 | +29.47% | 37.8% | +16.91% | 17.2% |
| **Test** | 2024-02-01 → 2026-02-27 | +9.79% | 17.2% | +7.37% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 170 | 18 | 58.2% | +4.48% ± 2.23 | +1.62% | +0.07% |
| 2022 | 114 | 12 | 35.1% | -2.10% ± 2.71 | -2.88% | -8.21% |
| 2023 | 146 | 13 | 65.1% | +5.78% ± 2.74 | +4.71% | +0.80% |
| 2024 (test) | 154 | 16 | 50.6% | +1.48% ± 2.24 | +2.54% | -1.91% |
| 2025 (test) | 135 | 10 | 45.9% | -0.25% ± 2.11 | -1.17% | -5.41% |
| 2026 (test) | 15 | 1 | 86.7% | +9.61% ± 5.78 | +9.61% | +0.00% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 272 | 30 | 55.1% | +3.35% ± 1.69 | +0.54% | +0.09% |
| Discovery, market down | 158 | 13 | 53.2% | +2.88% ± 2.87 | +3.05% | -3.20% |
| Test, market up | 217 | 21 | 51.6% | +1.60% ± 1.78 | +1.89% | -1.29% |
| Test, market down | 87 | 6 | 47.1% | -0.10% ± 2.87 | -0.17% | -5.42% |

Research output, not investment advice.
