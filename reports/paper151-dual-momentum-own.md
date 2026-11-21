# 151 Strategies §4.1.2 Dual-momentum sector rotation — paper's own holding rule

Generated: 2026-11-21T11:02:54.845Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Stocks of the top 10% industries by 6-month return (industry above its 100-day average), only when NIFTY 50 is above its 200-day average; monthly rebalance.

Trader rules: top 50 candidates per day by score, at most 50 per industry, at most 50 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 50 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 2,103; trades taken: 1,892; exits delayed by suspension or a locked price: 13. Studies logged in the trial registry so far: 49 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 835 | ✅ |
| Average net return above 0 | -0.27% | ❌ |
| Lower end of 95% range above 0 | -0.91% | ❌ |
| Day-clustered average above 0 | +0.09% | ✅ |
| Still positive without the 5 best signal days | -1.42% | ❌ |
| Positive in at least 2 of 3 test years | 1 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -2.71% | ❌ |
| Portfolio: max drawdown ≤ 20% | 18.5% | ✅ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -2.71% vs +7.37%; DD 18.5% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks with an industry label, same day and exit) above 0 | -0.57% | ❌ |
| Day-clustered excess vs control above 0 | -0.72% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,057 | 30 | 60.1% | +4.47% ± 0.82 | +4.39% | +2.92% |
| **Test** | 835 | 21 | 44.9% | -0.27% ± 0.64 | +0.09% | -1.42% |

Control group (all universe stocks with an industry label, same day and exit): excess per trade, discovery +2.01% (day-clustered +1.93%); test -0.57% (day-clustered -0.72%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-02-01 → 2024-01-31 | +35.72% | 12.8% | +16.78% | 17.2% |
| **Test** | 2024-02-01 → 2026-02-27 | -2.71% | 18.5% | +7.37% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 281 | 12 | 55.2% | +3.55% ± 1.83 | +3.49% | -1.27% |
| 2022 | 337 | 8 | 52.5% | +2.43% ± 1.20 | +1.85% | -2.89% |
| 2023 | 439 | 10 | 69.0% | +6.62% ± 1.27 | +7.49% | +2.61% |
| 2024 (test) | 402 | 11 | 42.3% | -0.54% ± 0.97 | -0.21% | -3.90% |
| 2025 (test) | 418 | 9 | 46.2% | -0.21% ± 0.87 | -0.14% | -3.71% |
| 2026 (test) | 15 | 1 | 80.0% | +5.55% ± 3.16 | +5.55% | +0.00% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 683 | 19 | 61.2% | +4.82% ± 0.96 | +4.63% | +2.13% |
| Discovery, market down | 374 | 11 | 58.0% | +3.82% ± 1.51 | +3.97% | -1.32% |
| Test, market up | 579 | 15 | 41.1% | -0.97% ± 0.81 | -0.60% | -3.08% |
| Test, market down | 256 | 6 | 53.5% | +1.33% ± 1.02 | +1.82% | -5.08% |

Research output, not investment advice.
