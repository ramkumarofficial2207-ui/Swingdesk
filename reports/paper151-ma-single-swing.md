# 151 Strategies §3.11 Single moving average — 5% swing rule

Generated: 2026-11-21T11:02:26.926Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Close crosses above its 50-day average; sell after a close below it (max 60 sessions).

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 22,637; trades taken: 3,830; exits delayed by suspension or a locked price: 1. Studies logged in the trial registry so far: 38 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1893 | ✅ |
| Average net return above 0 | -0.66% | ❌ |
| Lower end of 95% range above 0 | -0.82% | ❌ |
| Day-clustered average above 0 | -0.69% | ❌ |
| Still positive without the 5 best signal days | -0.70% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -25.84% | ❌ |
| Portfolio: max drawdown ≤ 20% | 58.3% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -25.84% vs +6.23%; DD 58.3% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -0.10% | ❌ |
| Day-clustered excess vs control above 0 | -0.11% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,937 | 718 | 35.7% | -0.29% ± 0.16 | -0.27% | -0.33% |
| **Test** | 1,893 | 692 | 31.3% | -0.66% ± 0.16 | -0.69% | -0.70% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.00% (day-clustered -0.01%); test -0.10% (day-clustered -0.11%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-15 | -12.44% | 38.3% | +16.26% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -25.84% | 58.3% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 679 | 244 | 36.1% | -0.22% ± 0.27 | -0.27% | -0.34% |
| 2022 | 662 | 241 | 33.7% | -0.44% ± 0.27 | -0.47% | -0.52% |
| 2023 | 596 | 233 | 37.4% | -0.19% ± 0.29 | -0.06% | -0.28% |
| 2024 (test) | 666 | 240 | 32.9% | -0.54% ± 0.27 | -0.57% | -0.63% |
| 2025 (test) | 634 | 239 | 32.6% | -0.59% ± 0.28 | -0.60% | -0.70% |
| 2026 (test) | 593 | 213 | 28.0% | -0.86% ± 0.28 | -0.91% | -1.01% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 1,241 | 467 | 36.9% | -0.19% ± 0.20 | -0.16% | -0.24% |
| Discovery, market down | 696 | 251 | 33.5% | -0.47% ± 0.27 | -0.48% | -0.58% |
| Test, market up | 1,093 | 408 | 32.4% | -0.63% ± 0.21 | -0.68% | -0.69% |
| Test, market down | 800 | 284 | 29.8% | -0.70% ± 0.24 | -0.70% | -0.78% |

Research output, not investment advice.
