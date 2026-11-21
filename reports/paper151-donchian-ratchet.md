# 151 Strategies §3.15 Donchian channel — ratcheting-stop swing rule

Generated: 2026-11-21T11:28:17.375Z · evaluation harness v3 · pre-registered

Plan: [`paper151-ratchet-plan.md`](paper151-ratchet-plan.md). Thesis: Close at or below the 20-session low of closes (floor); sell at a close at or above the 20-session high (max 60).

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 66,743; trades taken: 2,758; exits delayed by suspension or a locked price: 5. Studies logged in the trial registry so far: 66 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1326 | ✅ |
| Average net return above 0 | -0.54% | ❌ |
| Lower end of 95% range above 0 | -0.82% | ❌ |
| Day-clustered average above 0 | -0.81% | ❌ |
| Still positive without the 5 best signal days | -0.61% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -16.29% | ❌ |
| Portfolio: max drawdown ≤ 20% | 43.1% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -16.29% vs +6.23%; DD 43.1% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -0.04% | ❌ |
| Day-clustered excess vs control above 0 | -0.16% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,432 | 641 | 48.3% | -0.32% ± 0.27 | -0.35% | -0.37% |
| **Test** | 1,326 | 611 | 45.5% | -0.54% ± 0.28 | -0.81% | -0.61% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.21% (day-clustered -0.25%); test -0.04% (day-clustered -0.16%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-16 | -10.75% | 42.3% | +16.12% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -16.29% | 43.1% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 502 | 216 | 49.8% | -0.16% ± 0.43 | -0.25% | -0.26% |
| 2022 | 540 | 226 | 43.5% | -0.83% ± 0.47 | -0.91% | -1.00% |
| 2023 | 390 | 199 | 52.8% | +0.17% ± 0.50 | +0.19% | +0.05% |
| 2024 (test) | 450 | 209 | 44.9% | -0.50% ± 0.46 | -0.81% | -0.60% |
| 2025 (test) | 464 | 215 | 45.9% | -0.55% ± 0.51 | -0.98% | -0.72% |
| 2026 (test) | 412 | 187 | 45.6% | -0.56% ± 0.50 | -0.62% | -0.75% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 885 | 414 | 47.2% | -0.36% ± 0.35 | -0.37% | -0.43% |
| Discovery, market down | 547 | 227 | 49.9% | -0.26% ± 0.42 | -0.30% | -0.40% |
| Test, market up | 723 | 356 | 42.0% | -0.97% ± 0.36 | -1.17% | -1.04% |
| Test, market down | 603 | 255 | 49.6% | -0.01% ± 0.45 | -0.30% | -0.19% |

Research output, not investment advice.
