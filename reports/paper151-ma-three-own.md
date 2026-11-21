# 151 Strategies §3.13 Three moving averages — paper's own holding rule

Generated: 2026-11-21T11:02:33.480Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: 3 > 10 > 21-day averages newly lined up; sell when 3 ≤ 10 (max 60).

Trader rules: top 5 candidates per day by score, at most 20 per industry, at most 20 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 20 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 30,354; trades taken: 3,101; exits delayed by suspension or a locked price: 5. Studies logged in the trial registry so far: 41 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1571 | ✅ |
| Average net return above 0 | -0.40% | ❌ |
| Lower end of 95% range above 0 | -0.76% | ❌ |
| Day-clustered average above 0 | -0.51% | ❌ |
| Still positive without the 5 best signal days | -0.53% | ❌ |
| Positive in at least 2 of 3 test years | 1 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -11.94% | ❌ |
| Portfolio: max drawdown ≤ 20% | 44.0% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -11.94% vs +6.23%; DD 44.0% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -0.64% | ❌ |
| Day-clustered excess vs control above 0 | -0.67% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,530 | 594 | 35.9% | +0.41% ± 0.43 | +0.24% | +0.28% |
| **Test** | 1,571 | 584 | 32.0% | -0.40% ± 0.36 | -0.51% | -0.53% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.96% (day-clustered -1.26%); test -0.64% (day-clustered -0.67%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-29 | +8.93% | 31.2% | +15.44% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -11.94% | 44.0% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 520 | 199 | 36.3% | +1.13% ± 0.85 | +0.70% | +0.61% |
| 2022 | 531 | 199 | 31.8% | -0.73% ± 0.70 | -0.75% | -1.13% |
| 2023 | 479 | 196 | 40.1% | +0.90% ± 0.63 | +0.77% | +0.48% |
| 2024 (test) | 500 | 196 | 35.8% | +0.52% ± 0.73 | +0.24% | +0.16% |
| 2025 (test) | 570 | 203 | 31.6% | -0.61% ± 0.53 | -0.61% | -0.76% |
| 2026 (test) | 501 | 185 | 28.7% | -1.07% ± 0.61 | -1.19% | -1.54% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 870 | 372 | 37.6% | +0.38% ± 0.54 | +0.11% | +0.22% |
| Discovery, market down | 660 | 222 | 33.8% | +0.46% ± 0.69 | +0.45% | -0.05% |
| Test, market up | 779 | 326 | 31.3% | -0.34% ± 0.55 | -0.52% | -0.63% |
| Test, market down | 792 | 258 | 32.7% | -0.45% ± 0.47 | -0.49% | -0.73% |

Research output, not investment advice.
