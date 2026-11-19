# Monthly momentum M1 (always invested)

Generated: 2026-11-19T15:27:42.046Z · evaluation harness v3 · pre-registered

Plan: [`monthly-momentum-plan.md`](monthly-momentum-plan.md). Thesis: Past-year winners (excluding the last month) keep beating other stocks for months; held as a monthly-rebalanced basket of 15.

Trader rules: top 15 candidates per day by score, at most 4 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 32,241; trades taken: 987; exits delayed by suspension or a locked price: 31. Studies logged in the trial registry so far: 15 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 473 | ✅ |
| Average net return above 0 | +1.08% | ✅ |
| Lower end of 95% range above 0 | -0.17% | ❌ |
| Day-clustered average above 0 | +1.31% | ✅ |
| Still positive without the 5 best signal days | -0.20% | ❌ |
| Positive in at least 2 of 3 test years | 2 of 3 | ✅ |
| Portfolio: net CAGR above 0 | +10.39% | ✅ |
| Portfolio: max drawdown ≤ 20% | 30.1% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | +10.39% vs +2.13%; DD 30.1% vs 15.8% | ✅ |
| Average excess vs control (all universe stocks, same rebalance day and exit) above 0 | +1.04% | ✅ |
| Day-clustered excess vs control above 0 | +1.57% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 514 | 49 | 54.3% | +2.84% ± 1.37 | +2.62% | +1.46% |
| **Test** | 473 | 44 | 50.7% | +1.08% ± 1.25 | +1.31% | -0.20% |

Control group (all universe stocks, same rebalance day and exit): excess per trade, discovery +0.80% (day-clustered +0.78%); test +1.04% (day-clustered +1.57%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-02-01 → 2024-03-28 | +31.37% | 39.4% | +16.91% | 17.2% |
| **Test** | 2024-02-01 → 2026-10-30 | +10.39% | 30.1% | +2.13% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 170 | 18 | 58.2% | +4.48% ± 2.23 | +1.62% | +0.07% |
| 2022 | 171 | 15 | 39.2% | -1.78% ± 2.25 | -2.34% | -7.78% |
| 2023 | 173 | 16 | 65.3% | +5.80% ± 2.46 | +8.38% | +2.31% |
| 2024 (test) | 169 | 18 | 47.3% | +0.22% ± 2.21 | +2.30% | -3.27% |
| 2025 (test) | 176 | 15 | 46.0% | -0.37% ± 1.92 | -1.39% | -4.14% |
| 2026 (test) | 128 | 11 | 61.7% | +4.21% ± 2.33 | +3.39% | -0.56% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 271 | 29 | 55.0% | +3.33% ± 1.70 | +0.64% | +0.07% |
| Discovery, market down | 243 | 20 | 53.5% | +2.30% ± 2.18 | +5.48% | -0.61% |
| Test, market up | 254 | 25 | 51.2% | +1.59% ± 1.67 | +1.73% | -0.84% |
| Test, market down | 219 | 19 | 50.2% | +0.49% ± 1.87 | +0.77% | -3.06% |

Research output, not investment advice.
