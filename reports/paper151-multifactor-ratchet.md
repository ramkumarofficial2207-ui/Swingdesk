# 151 Strategies §3.6 Multifactor (rank average) — ratcheting-stop swing rule

Generated: 2026-11-21T11:28:01.214Z · evaluation harness v3 · pre-registered

Plan: [`paper151-ratchet-plan.md`](paper151-ratchet-plan.md). Thesis: Top 10% by the average demeaned rank of momentum, low volatility and residual momentum; monthly rebalance.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 50,405; trades taken: 2,265; exits delayed by suspension or a locked price: 1. Studies logged in the trial registry so far: 59 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1372 | ✅ |
| Average net return above 0 | -0.19% | ❌ |
| Lower end of 95% range above 0 | -0.46% | ❌ |
| Day-clustered average above 0 | -0.23% | ❌ |
| Still positive without the 5 best signal days | -0.24% | ❌ |
| Positive in at least 2 of 3 test years | 1 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -6.95% | ❌ |
| Portfolio: max drawdown ≤ 20% | 38.1% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -6.95% vs +6.23%; DD 38.1% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.27% | ✅ |
| Day-clustered excess vs control above 0 | +0.31% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 893 | 396 | 51.8% | +0.15% ± 0.33 | +0.22% | +0.05% |
| **Test** | 1,372 | 628 | 48.3% | -0.19% ± 0.27 | -0.23% | -0.24% |

Control group (all universe stocks, same day and exit): excess per trade, discovery +0.26% (day-clustered +0.30%); test +0.27% (day-clustered +0.31%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2022-02-11 → 2024-01-17 | +3.87% | 18.8% | +11.82% | 15.3% |
| **Test** | 2024-01-02 → 2026-11-20 | -6.95% | 38.1% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2022 | 482 | 203 | 48.5% | -0.30% ± 0.46 | -0.22% | -0.50% |
| 2023 | 411 | 193 | 55.7% | +0.67% ± 0.46 | +0.68% | +0.56% |
| 2024 (test) | 512 | 230 | 52.3% | +0.11% ± 0.49 | +0.24% | +0.01% |
| 2025 (test) | 472 | 213 | 43.4% | -0.55% ± 0.44 | -0.70% | -0.70% |
| 2026 (test) | 388 | 185 | 48.7% | -0.15% ± 0.47 | -0.27% | -0.31% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 482 | 230 | 53.9% | +0.41% ± 0.44 | +0.53% | +0.29% |
| Discovery, market down | 411 | 166 | 49.4% | -0.15% ± 0.49 | -0.21% | -0.34% |
| Test, market up | 771 | 368 | 48.4% | -0.00% ± 0.34 | -0.01% | -0.07% |
| Test, market down | 601 | 260 | 48.1% | -0.43% ± 0.44 | -0.54% | -0.58% |

Research output, not investment advice.
