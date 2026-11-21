# 151 Strategies §3.12 Two moving averages — ratcheting-stop swing rule

Generated: 2026-11-21T11:28:09.275Z · evaluation harness v3 · pre-registered

Plan: [`paper151-ratchet-plan.md`](paper151-ratchet-plan.md). Thesis: 10-day average crosses above 30-day; sell when it crosses back or the close falls > 2% in a day (max 60).

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 12,654; trades taken: 2,881; exits delayed by suspension or a locked price: 0. Studies logged in the trial registry so far: 63 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1433 | ✅ |
| Average net return above 0 | -0.58% | ❌ |
| Lower end of 95% range above 0 | -0.84% | ❌ |
| Day-clustered average above 0 | -0.52% | ❌ |
| Still positive without the 5 best signal days | -0.62% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -18.43% | ❌ |
| Portfolio: max drawdown ≤ 20% | 46.8% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -18.43% vs +6.23%; DD 46.8% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.02% | ✅ |
| Day-clustered excess vs control above 0 | +0.07% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,448 | 648 | 49.3% | -0.00% ± 0.26 | +0.05% | -0.04% |
| **Test** | 1,433 | 627 | 44.0% | -0.58% ± 0.27 | -0.52% | -0.62% |

Control group (all universe stocks, same day and exit): excess per trade, discovery +0.06% (day-clustered +0.07%); test +0.02% (day-clustered +0.07%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-10 | -1.15% | 25.6% | +15.47% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -18.43% | 46.8% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 564 | 228 | 50.4% | +0.06% ± 0.43 | +0.04% | -0.04% |
| 2022 | 459 | 213 | 45.8% | -0.43% ± 0.46 | -0.43% | -0.54% |
| 2023 | 425 | 207 | 51.8% | +0.38% ± 0.47 | +0.54% | +0.25% |
| 2024 (test) | 504 | 218 | 43.3% | -0.80% ± 0.44 | -0.65% | -0.91% |
| 2025 (test) | 478 | 214 | 47.5% | -0.24% ± 0.46 | -0.01% | -0.37% |
| 2026 (test) | 451 | 195 | 41.0% | -0.68% ± 0.48 | -0.95% | -0.82% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 927 | 413 | 48.3% | -0.09% ± 0.33 | +0.06% | -0.14% |
| Discovery, market down | 521 | 235 | 51.1% | +0.17% ± 0.44 | +0.02% | +0.06% |
| Test, market up | 818 | 368 | 44.9% | -0.58% ± 0.35 | -0.47% | -0.64% |
| Test, market down | 615 | 259 | 42.8% | -0.58% ± 0.41 | -0.60% | -0.67% |

Research output, not investment advice.
