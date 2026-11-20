# Accumulation R: every universe stock-day (random baseline)

Generated: 2026-11-20T18:50:57.883Z · evaluation harness v3 · exploration

Plan: [`accumulation-breakout-plan.md`](accumulation-breakout-plan.md). Thesis: Stocks that climb quietly for 20–25 sessions while big buyers add (rising delivery, slowly rising futures OI) tend to break out; buy before or at the start of the surge, not after it.

Trader rules: top 1000000 candidates per day by score, at most 1000000 per industry, at most 1000000 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 1000000 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 7,15,892; trades taken: 2,54,576; exits delayed by suspension or a locked price: 133. Studies logged in the trial registry so far: 19 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 123565 | ✅ |
| Average net return above 0 | -0.53% | ❌ |
| Lower end of 95% range above 0 | -0.55% | ❌ |
| Day-clustered average above 0 | -0.62% | ❌ |
| Still positive without the 5 best signal days | -0.58% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -0.02% | ❌ |
| Portfolio: max drawdown ≤ 20% | 0.1% | ✅ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -0.02% vs +6.23%; DD 0.1% vs 15.8% | ✅ |
| Average excess vs control (every universe stock, same day and exit) above 0 | -0.04% | ❌ |
| Day-clustered excess vs control above 0 | -0.05% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,31,011 | 739 | 33.6% | -0.41% ± 0.02 | -0.43% | -0.45% |
| **Test** | 1,23,565 | 711 | 32.1% | -0.53% ± 0.02 | -0.62% | -0.58% |

Control group (every universe stock, same day and exit): excess per trade, discovery -0.14% (day-clustered -0.17%); test -0.04% (day-clustered -0.05%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-06 → 2024-01-19 | -0.02% | 0.1% | +15.00% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -0.02% | 0.1% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 48,246 | 246 | 32.9% | -0.44% ± 0.03 | -0.49% | -0.54% |
| 2022 | 46,276 | 248 | 31.9% | -0.55% ± 0.03 | -0.56% | -0.65% |
| 2023 | 36,489 | 245 | 36.7% | -0.19% ± 0.04 | -0.23% | -0.29% |
| 2024 (test) | 45,420 | 246 | 32.4% | -0.49% ± 0.03 | -0.58% | -0.59% |
| 2025 (test) | 40,042 | 248 | 33.0% | -0.48% ± 0.04 | -0.59% | -0.61% |
| 2026 (test) | 38,103 | 217 | 30.7% | -0.62% ± 0.04 | -0.71% | -0.72% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 79,876 | 481 | 33.7% | -0.40% ± 0.03 | -0.41% | -0.46% |
| Discovery, market down | 51,135 | 258 | 33.5% | -0.42% ± 0.03 | -0.46% | -0.53% |
| Test, market up | 67,141 | 421 | 31.6% | -0.57% ± 0.03 | -0.67% | -0.65% |
| Test, market down | 56,424 | 290 | 32.6% | -0.47% ± 0.03 | -0.55% | -0.55% |

Note: Measurement for the accumulation study, not a tradeable candidate; its verdict is ignored.

Research output, not investment advice.
