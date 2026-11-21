# 151 Strategies §3.15 Donchian channel — 5% swing rule

Generated: 2026-11-21T11:02:47.683Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Close at or below the 20-session low of closes (floor); sell at a close at or above the 20-session high (max 60).

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 66,743; trades taken: 3,779; exits delayed by suspension or a locked price: 5. Studies logged in the trial registry so far: 46 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1866 | ✅ |
| Average net return above 0 | -0.69% | ❌ |
| Lower end of 95% range above 0 | -0.86% | ❌ |
| Day-clustered average above 0 | -0.69% | ❌ |
| Still positive without the 5 best signal days | -0.72% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -26.63% | ❌ |
| Portfolio: max drawdown ≤ 20% | 59.1% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -26.63% vs +6.23%; DD 59.1% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -0.13% | ❌ |
| Day-clustered excess vs control above 0 | -0.11% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,913 | 714 | 34.7% | -0.41% ± 0.16 | -0.43% | -0.45% |
| **Test** | 1,866 | 681 | 30.8% | -0.69% ± 0.17 | -0.69% | -0.72% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.13% (day-clustered -0.16%); test -0.13% (day-clustered -0.11%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-12 | -16.77% | 48.1% | +15.92% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -26.63% | 59.1% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 682 | 244 | 34.9% | -0.30% ± 0.27 | -0.32% | -0.41% |
| 2022 | 668 | 241 | 30.4% | -0.72% ± 0.26 | -0.73% | -0.86% |
| 2023 | 563 | 229 | 39.4% | -0.18% ± 0.32 | -0.25% | -0.30% |
| 2024 (test) | 637 | 232 | 32.2% | -0.55% ± 0.27 | -0.54% | -0.66% |
| 2025 (test) | 624 | 237 | 30.3% | -0.83% ± 0.31 | -0.79% | -0.93% |
| 2026 (test) | 605 | 212 | 29.8% | -0.69% ± 0.28 | -0.76% | -0.81% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 1,223 | 466 | 35.2% | -0.35% ± 0.20 | -0.34% | -0.40% |
| Discovery, market down | 690 | 248 | 33.8% | -0.54% ± 0.28 | -0.60% | -0.64% |
| Test, market up | 1,042 | 397 | 29.9% | -0.79% ± 0.23 | -0.79% | -0.84% |
| Test, market down | 824 | 284 | 31.8% | -0.56% ± 0.24 | -0.57% | -0.66% |

Research output, not investment advice.
