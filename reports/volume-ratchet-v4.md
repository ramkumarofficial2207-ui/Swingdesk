# Rising volume before the move V4 + ratcheting stop

Generated: 2026-11-21T11:16:22.641Z · evaluation harness v3 · pre-registered

Plan: [`volume-rise-ratchet-plan.md`](volume-rise-ratchet-plan.md). Thesis: V2 + close above the 50-day average. Top 3 per day by today's volume ratio.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 24,327; trades taken: 4,055; exits delayed by suspension or a locked price: 1. Studies logged in the trial registry so far: 54 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1982 | ✅ |
| Average net return above 0 | -0.76% | ❌ |
| Lower end of 95% range above 0 | -0.99% | ❌ |
| Day-clustered average above 0 | -0.76% | ❌ |
| Still positive without the 5 best signal days | -0.81% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -30.56% | ❌ |
| Portfolio: max drawdown ≤ 20% | 66.3% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -30.56% vs +6.23%; DD 66.3% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -0.19% | ❌ |
| Day-clustered excess vs control above 0 | -0.19% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 2,073 | 733 | 45.7% | -0.36% ± 0.23 | -0.34% | -0.42% |
| **Test** | 1,982 | 700 | 42.2% | -0.76% ± 0.23 | -0.76% | -0.81% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.28% (day-clustered -0.29%); test -0.19% (day-clustered -0.19%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-15 | -16.09% | 52.3% | +16.26% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -30.56% | 66.3% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 727 | 247 | 45.3% | -0.26% ± 0.43 | -0.23% | -0.44% |
| 2022 | 674 | 242 | 42.3% | -0.81% ± 0.38 | -0.80% | -0.96% |
| 2023 | 672 | 244 | 49.7% | -0.00% ± 0.40 | -0.01% | -0.10% |
| 2024 (test) | 710 | 244 | 45.1% | -0.51% ± 0.40 | -0.50% | -0.66% |
| 2025 (test) | 645 | 242 | 42.3% | -0.80% ± 0.40 | -0.82% | -0.91% |
| 2026 (test) | 627 | 214 | 38.9% | -1.00% ± 0.41 | -1.00% | -1.18% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 1,372 | 480 | 47.6% | -0.18% ± 0.29 | -0.11% | -0.27% |
| Discovery, market down | 701 | 253 | 42.1% | -0.70% ± 0.39 | -0.79% | -0.83% |
| Test, market up | 1,171 | 415 | 41.4% | -0.85% ± 0.31 | -0.86% | -0.92% |
| Test, market down | 811 | 285 | 43.4% | -0.63% ± 0.35 | -0.63% | -0.75% |

Research output, not investment advice.
