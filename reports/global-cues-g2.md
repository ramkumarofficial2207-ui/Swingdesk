# Global and commodity cues G2 (|z| ≥ 2.0)

Generated: 2026-11-19T15:09:00.965Z · evaluation harness v3 · pre-registered

Plan: [`global-cues-plan.md`](global-cues-plan.md). Thesis: A sharp overnight move in a cost input or export driver keeps re-pricing the sectors it helps for about a week.

Trader rules: top 5 candidates per day by score, at most 2 per industry, at most 5 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 5 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 6,263; trades taken: 430; exits delayed by suspension or a locked price: 0. Studies logged in the trial registry so far: 12 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 223 | ✅ |
| Average net return above 0 | -0.07% | ❌ |
| Lower end of 95% range above 0 | -0.73% | ❌ |
| Day-clustered average above 0 | -0.27% | ❌ |
| Still positive without the 5 best signal days | -0.76% | ❌ |
| Positive in at least 2 of 3 test years | 1 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -1.97% | ❌ |
| Portfolio: max drawdown ≤ 20% | 24.6% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -1.97% vs +5.65%; DD 24.6% vs 15.8% | ❌ |
| Average excess vs control (all labelled universe stocks, same day and exit) above 0 | -0.15% | ❌ |
| Day-clustered excess vs control above 0 | -0.31% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 207 | 63 | 54.1% | -0.19% ± 0.52 | -0.22% | -0.51% |
| **Test** | 223 | 74 | 45.3% | -0.07% ± 0.66 | -0.27% | -0.76% |

Control group (all labelled universe stocks, same day and exit): excess per trade, discovery -0.08% (day-clustered -0.16%); test -0.15% (day-clustered -0.31%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-08 → 2023-12-08 | -3.25% | 25.4% | +14.41% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-17 | -1.97% | 24.6% | +5.65% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 74 | 25 | 45.9% | -1.16% ± 1.03 | -1.07% | -2.15% |
| 2022 | 72 | 21 | 59.7% | +0.22% ± 0.87 | +0.16% | -0.60% |
| 2023 | 61 | 17 | 57.4% | +0.49% ± 0.67 | +0.56% | -0.28% |
| 2024 (test) | 80 | 25 | 42.5% | -0.02% ± 0.95 | +0.12% | -0.92% |
| 2025 (test) | 70 | 25 | 41.4% | -0.73% ± 1.38 | -1.28% | -2.36% |
| 2026 (test) | 73 | 24 | 52.1% | +0.51% ± 1.11 | +0.36% | -1.25% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 115 | 37 | 55.7% | -0.10% ± 0.68 | -0.39% | -0.74% |
| Discovery, market down | 92 | 26 | 52.2% | -0.31% ± 0.82 | +0.02% | -1.06% |
| Test, market up | 117 | 38 | 47.9% | +0.45% ± 0.82 | +0.57% | -0.37% |
| Test, market down | 106 | 36 | 42.5% | -0.64% ± 1.04 | -1.17% | -1.92% |

Research output, not investment advice.
