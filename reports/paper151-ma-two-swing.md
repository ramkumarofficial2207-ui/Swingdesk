# 151 Strategies §3.12 Two moving averages — 5% swing rule

Generated: 2026-11-21T11:02:31.152Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: 10-day average crosses above 30-day; sell when it crosses back or the close falls > 2% in a day (max 60).

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 12,654; trades taken: 3,612; exits delayed by suspension or a locked price: 0. Studies logged in the trial registry so far: 40 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1763 | ✅ |
| Average net return above 0 | -0.58% | ❌ |
| Lower end of 95% range above 0 | -0.75% | ❌ |
| Day-clustered average above 0 | -0.55% | ❌ |
| Still positive without the 5 best signal days | -0.63% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -21.87% | ❌ |
| Portfolio: max drawdown ≤ 20% | 51.4% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -21.87% vs +6.23%; DD 51.4% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.02% | ✅ |
| Day-clustered excess vs control above 0 | +0.03% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,849 | 705 | 37.6% | -0.14% ± 0.17 | -0.15% | -0.18% |
| **Test** | 1,763 | 678 | 32.0% | -0.58% ± 0.16 | -0.55% | -0.63% |

Control group (all universe stocks, same day and exit): excess per trade, discovery +0.12% (day-clustered +0.10%); test +0.02% (day-clustered +0.03%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-18 | -6.27% | 28.2% | +15.06% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -21.87% | 51.4% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 663 | 241 | 38.6% | -0.05% ± 0.28 | -0.13% | -0.16% |
| 2022 | 587 | 231 | 34.6% | -0.35% ± 0.29 | -0.38% | -0.44% |
| 2023 | 599 | 233 | 39.6% | -0.05% ± 0.29 | +0.05% | -0.15% |
| 2024 (test) | 615 | 235 | 29.8% | -0.72% ± 0.27 | -0.64% | -0.79% |
| 2025 (test) | 598 | 234 | 37.0% | -0.30% ± 0.29 | -0.28% | -0.40% |
| 2026 (test) | 550 | 209 | 29.1% | -0.74% ± 0.29 | -0.74% | -0.91% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 1,208 | 458 | 38.3% | -0.11% ± 0.21 | -0.08% | -0.16% |
| Discovery, market down | 641 | 247 | 36.3% | -0.20% ± 0.28 | -0.28% | -0.31% |
| Test, market up | 1,058 | 408 | 31.8% | -0.64% ± 0.21 | -0.60% | -0.70% |
| Test, market down | 705 | 270 | 32.3% | -0.49% ± 0.26 | -0.46% | -0.61% |

Research output, not investment advice.
