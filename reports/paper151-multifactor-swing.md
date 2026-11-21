# 151 Strategies §3.6 Multifactor (rank average) — 5% swing rule

Generated: 2026-11-21T11:02:14.999Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Top 10% by the average demeaned rank of momentum, low volatility and residual momentum; monthly rebalance.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 50,405; trades taken: 3,172; exits delayed by suspension or a locked price: 1. Studies logged in the trial registry so far: 32 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1927 | ✅ |
| Average net return above 0 | -0.46% | ❌ |
| Lower end of 95% range above 0 | -0.63% | ❌ |
| Day-clustered average above 0 | -0.49% | ❌ |
| Still positive without the 5 best signal days | -0.50% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -19.11% | ❌ |
| Portfolio: max drawdown ≤ 20% | 48.5% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -19.11% vs +6.23%; DD 48.5% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.08% | ✅ |
| Day-clustered excess vs control above 0 | +0.08% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,245 | 456 | 37.5% | -0.16% ± 0.20 | -0.17% | -0.22% |
| **Test** | 1,927 | 698 | 33.7% | -0.46% ± 0.17 | -0.49% | -0.50% |

Control group (all universe stocks, same day and exit): excess per trade, discovery +0.06% (day-clustered +0.05%); test +0.08% (day-clustered +0.08%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2022-02-11 → 2024-01-16 | -7.56% | 23.4% | +13.11% | 15.3% |
| **Test** | 2024-01-02 → 2026-11-20 | -19.11% | 48.5% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2022 | 633 | 220 | 34.9% | -0.34% ± 0.28 | -0.33% | -0.46% |
| 2023 | 612 | 236 | 40.2% | +0.02% ± 0.30 | -0.01% | -0.08% |
| 2024 (test) | 699 | 246 | 35.8% | -0.19% ± 0.28 | -0.21% | -0.31% |
| 2025 (test) | 666 | 241 | 32.7% | -0.64% ± 0.30 | -0.66% | -0.76% |
| 2026 (test) | 562 | 211 | 32.4% | -0.58% ± 0.29 | -0.62% | -0.72% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 711 | 265 | 39.8% | -0.04% ± 0.27 | -0.04% | -0.14% |
| Discovery, market down | 534 | 191 | 34.5% | -0.33% ± 0.31 | -0.34% | -0.47% |
| Test, market up | 1,088 | 409 | 35.0% | -0.38% ± 0.23 | -0.42% | -0.45% |
| Test, market down | 839 | 289 | 32.1% | -0.57% ± 0.24 | -0.59% | -0.67% |

Research output, not investment advice.
