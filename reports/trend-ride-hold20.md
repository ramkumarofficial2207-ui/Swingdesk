# Trend ride picks, +5% target, 20-session hold (exploration)

Generated: 2026-11-20T17:51:26.486Z · evaluation harness v3 · exploration

Plan: [`trend-ride-plan.md`](trend-ride-plan.md). Thesis: Same picks as trend ride; give trades 20 sessions to reach +5% instead of a trailing exit that sold after about 5.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 8 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 8 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 2,015; trades taken: 430; exits delayed by suspension or a locked price: 0. Studies logged in the trial registry so far: 18 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 190 | ✅ |
| Average net return above 0 | -0.39% | ❌ |
| Lower end of 95% range above 0 | -1.11% | ❌ |
| Day-clustered average above 0 | -0.29% | ❌ |
| Still positive without the 5 best signal days | -0.57% | ❌ |
| Positive in at least 2 of 3 test years | 1 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -3.66% | ❌ |
| Portfolio: max drawdown ≤ 20% | 15.2% | ✅ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -3.66% vs +3.14%; DD 15.2% vs 15.8% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 240 | 177 | 57.1% | +0.14% ± 0.66 | +0.12% | -0.00% |
| **Test** | 190 | 138 | 51.1% | -0.39% ± 0.72 | -0.29% | -0.57% |

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-14 → 2024-01-12 | +1.13% | 13.0% | +14.89% | 17.2% |
| **Test** | 2024-01-04 → 2026-09-09 | -3.66% | 15.2% | +3.14% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 77 | 59 | 51.9% | -0.43% ± 1.17 | -0.33% | -0.79% |
| 2022 | 62 | 44 | 50.0% | -0.64% ± 1.34 | -0.97% | -1.56% |
| 2023 | 101 | 74 | 65.3% | +1.06% ± 0.96 | +1.14% | +0.84% |
| 2024 (test) | 75 | 60 | 58.7% | +0.37% ± 1.13 | +0.46% | +0.04% |
| 2025 (test) | 94 | 62 | 44.7% | -1.01% ± 1.03 | -0.90% | -1.41% |
| 2026 (test) | 21 | 16 | 52.4% | -0.33% ± 2.27 | -0.79% | -2.30% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 240 | 177 | 57.1% | +0.14% ± 0.66 | +0.12% | -0.00% |
| Discovery, market down | 0 | — | — | — | — | — |
| Test, market up | 190 | 138 | 51.1% | -0.39% ± 0.72 | -0.29% | -0.57% |
| Test, market down | 0 | — | — | — | — | — |

Note: Not pre-registered: the test years were already seen in trend-ride. Treat as a hint for paper trading, not proof.

Research output, not investment advice.
