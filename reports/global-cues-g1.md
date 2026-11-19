# Global and commodity cues G1 (|z| ≥ 1.5)

Generated: 2026-11-19T15:08:00.660Z · evaluation harness v3 · pre-registered

Plan: [`global-cues-plan.md`](global-cues-plan.md). Thesis: A sharp overnight move in a cost input or export driver keeps re-pricing the sectors it helps for about a week.

Trader rules: top 5 candidates per day by score, at most 2 per industry, at most 5 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 5 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 11,725; trades taken: 657; exits delayed by suspension or a locked price: 0. Studies logged in the trial registry so far: 11 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 326 | ✅ |
| Average net return above 0 | -0.11% | ❌ |
| Lower end of 95% range above 0 | -0.65% | ❌ |
| Day-clustered average above 0 | -0.38% | ❌ |
| Still positive without the 5 best signal days | -0.65% | ❌ |
| Positive in at least 2 of 3 test years | 1 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -3.64% | ❌ |
| Portfolio: max drawdown ≤ 20% | 32.6% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -3.64% vs +5.65%; DD 32.6% vs 15.8% | ❌ |
| Average excess vs control (all labelled universe stocks, same day and exit) above 0 | +0.13% | ✅ |
| Day-clustered excess vs control above 0 | -0.14% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 331 | 119 | 48.0% | -0.18% ± 0.38 | -0.20% | -0.48% |
| **Test** | 326 | 110 | 47.2% | -0.11% ± 0.54 | -0.38% | -0.65% |

Control group (all labelled universe stocks, same day and exit): excess per trade, discovery -0.29% (day-clustered -0.29%); test +0.13% (day-clustered -0.14%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-08 → 2023-12-19 | -4.72% | 26.9% | +15.17% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-17 | -3.64% | 32.6% | +5.65% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 104 | 40 | 38.5% | -1.05% ± 0.69 | -0.74% | -1.61% |
| 2022 | 120 | 41 | 55.0% | +0.26% ± 0.69 | +0.04% | -0.49% |
| 2023 | 107 | 38 | 49.5% | +0.17% ± 0.56 | +0.12% | -0.26% |
| 2024 (test) | 117 | 37 | 48.7% | +0.27% ± 0.90 | +0.02% | -0.64% |
| 2025 (test) | 110 | 40 | 43.6% | -0.42% ± 0.96 | -0.83% | -1.18% |
| 2026 (test) | 99 | 33 | 49.5% | -0.20% ± 0.97 | -0.28% | -1.55% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 205 | 79 | 46.3% | -0.34% ± 0.47 | -0.43% | -0.57% |
| Discovery, market down | 126 | 40 | 50.8% | +0.08% ± 0.64 | +0.27% | -0.74% |
| Test, market up | 169 | 56 | 50.3% | +0.55% ± 0.70 | +0.24% | -0.21% |
| Test, market down | 157 | 54 | 43.9% | -0.81% ± 0.83 | -1.02% | -1.58% |

Research output, not investment advice.
