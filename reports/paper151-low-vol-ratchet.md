# 151 Strategies §3.4 Low-volatility anomaly — ratcheting-stop swing rule

Generated: 2026-11-21T11:27:57.886Z · evaluation harness v3 · pre-registered

Plan: [`paper151-ratchet-plan.md`](paper151-ratchet-plan.md). Thesis: Lowest 10% by 252-session volatility; rebalance every 6 months (June and December).

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 66,888; trades taken: 2,067; exits delayed by suspension or a locked price: 0. Studies logged in the trial registry so far: 57 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 970 | ✅ |
| Average net return above 0 | -0.29% | ❌ |
| Lower end of 95% range above 0 | -0.58% | ❌ |
| Day-clustered average above 0 | -0.35% | ❌ |
| Still positive without the 5 best signal days | -0.34% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -7.19% | ❌ |
| Portfolio: max drawdown ≤ 20% | 32.0% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -7.19% vs +6.23%; DD 32.0% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.15% | ✅ |
| Day-clustered excess vs control above 0 | +0.14% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,097 | 582 | 51.0% | +0.18% ± 0.27 | +0.28% | +0.14% |
| **Test** | 970 | 530 | 47.5% | -0.29% ± 0.28 | -0.35% | -0.34% |

Control group (all universe stocks, same day and exit): excess per trade, discovery +0.28% (day-clustered +0.32%); test +0.15% (day-clustered +0.14%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-06 → 2024-01-18 | +3.55% | 18.7% | +14.73% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -7.19% | 32.0% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 396 | 201 | 50.8% | +0.19% ± 0.45 | +0.25% | +0.09% |
| 2022 | 405 | 202 | 46.7% | -0.19% ± 0.47 | -0.12% | -0.30% |
| 2023 | 296 | 179 | 57.1% | +0.66% ± 0.46 | +0.75% | +0.54% |
| 2024 (test) | 343 | 195 | 49.9% | -0.03% ± 0.48 | -0.18% | -0.15% |
| 2025 (test) | 316 | 176 | 50.0% | -0.04% ± 0.48 | -0.16% | -0.22% |
| 2026 (test) | 311 | 159 | 42.4% | -0.84% ± 0.50 | -0.77% | -1.02% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 693 | 376 | 48.9% | -0.08% ± 0.33 | +0.10% | -0.14% |
| Discovery, market down | 404 | 206 | 54.5% | +0.62% ± 0.45 | +0.60% | +0.50% |
| Test, market up | 543 | 308 | 47.1% | -0.24% ± 0.36 | -0.26% | -0.32% |
| Test, market down | 427 | 222 | 48.0% | -0.36% ± 0.45 | -0.48% | -0.50% |

Research output, not investment advice.
