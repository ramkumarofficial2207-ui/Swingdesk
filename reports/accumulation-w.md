# Accumulation W: every watchlist stock-day (measurement)

Generated: 2026-11-20T18:53:19.377Z · evaluation harness v3 · exploration

Plan: [`accumulation-breakout-plan.md`](accumulation-breakout-plan.md). Thesis: Stocks that climb quietly for 20–25 sessions while big buyers add (rising delivery, slowly rising futures OI) tend to break out; buy before or at the start of the surge, not after it.

Trader rules: top 1000000 candidates per day by score, at most 1000000 per industry, at most 1000000 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 1000000 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 1,771; trades taken: 876; exits delayed by suspension or a locked price: 0. Studies logged in the trial registry so far: 20 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 349 | ✅ |
| Average net return above 0 | -0.67% | ❌ |
| Lower end of 95% range above 0 | -1.05% | ❌ |
| Day-clustered average above 0 | -0.37% | ❌ |
| Still positive without the 5 best signal days | -0.79% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -0.00% | ❌ |
| Portfolio: max drawdown ≤ 20% | 0.0% | ✅ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -0.00% vs +6.39%; DD 0.0% vs 15.8% | ✅ |
| Average excess vs control (every universe stock, same day and exit) above 0 | +0.13% | ✅ |
| Day-clustered excess vs control above 0 | +0.27% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 527 | 306 | 35.9% | -0.23% ± 0.31 | -0.31% | -0.29% |
| **Test** | 349 | 221 | 31.2% | -0.67% ± 0.38 | -0.37% | -0.79% |

Control group (every universe stock, same day and exit): excess per trade, discovery -0.11% (day-clustered -0.15%); test +0.13% (day-clustered +0.27%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-06 → 2024-01-12 | -0.00% | 0.0% | +15.59% | 17.2% |
| **Test** | 2024-01-03 → 2026-11-20 | -0.00% | 0.0% | +6.39% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 132 | 95 | 35.6% | -0.25% ± 0.61 | -0.14% | -0.47% |
| 2022 | 179 | 91 | 35.2% | -0.30% ± 0.52 | -0.56% | -0.50% |
| 2023 | 216 | 120 | 36.6% | -0.15% ± 0.48 | -0.25% | -0.28% |
| 2024 (test) | 141 | 84 | 34.0% | -0.36% ± 0.59 | +0.13% | -0.58% |
| 2025 (test) | 144 | 87 | 28.5% | -1.00% ± 0.60 | -0.76% | -1.29% |
| 2026 (test) | 64 | 50 | 31.3% | -0.60% ± 0.85 | -0.54% | -1.04% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 487 | 269 | 36.6% | -0.18% ± 0.32 | -0.22% | -0.26% |
| Discovery, market down | 40 | 37 | 27.5% | -0.74% ± 1.04 | -0.97% | -1.50% |
| Test, market up | 273 | 164 | 29.7% | -0.80% ± 0.43 | -0.51% | -0.92% |
| Test, market down | 76 | 57 | 36.8% | -0.19% ± 0.81 | +0.04% | -0.68% |

Note: Measurement for the accumulation study, not a tradeable candidate; its verdict is ignored.

Research output, not investment advice.
