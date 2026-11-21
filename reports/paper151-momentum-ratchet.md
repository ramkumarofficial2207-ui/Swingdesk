# 151 Strategies §3.1 Price momentum (12-1) — ratcheting-stop swing rule

Generated: 2026-11-21T11:27:55.720Z · evaluation harness v3 · pre-registered

Plan: [`paper151-ratchet-plan.md`](paper151-ratchet-plan.md). Thesis: Top 10% by return from 252 to 21 sessions ago; monthly rebalance.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 66,884; trades taken: 4,260; exits delayed by suspension or a locked price: 29. Studies logged in the trial registry so far: 56 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 2085 | ✅ |
| Average net return above 0 | -0.43% | ❌ |
| Lower end of 95% range above 0 | -0.67% | ❌ |
| Day-clustered average above 0 | -0.40% | ❌ |
| Still positive without the 5 best signal days | -0.48% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -20.13% | ❌ |
| Portfolio: max drawdown ≤ 20% | 51.0% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -20.13% vs +6.23%; DD 51.0% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.14% | ✅ |
| Day-clustered excess vs control above 0 | +0.17% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 2,175 | 738 | 45.0% | -0.22% ± 0.25 | -0.20% | -0.29% |
| **Test** | 2,085 | 709 | 45.5% | -0.43% ± 0.24 | -0.40% | -0.48% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.14% (day-clustered -0.13%); test +0.14% (day-clustered +0.17%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-06 → 2024-01-16 | -11.43% | 47.8% | +15.79% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -20.13% | 51.0% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 727 | 245 | 43.7% | -0.26% ± 0.44 | -0.30% | -0.45% |
| 2022 | 736 | 248 | 42.1% | -0.54% ± 0.42 | -0.53% | -0.76% |
| 2023 | 712 | 245 | 49.2% | +0.16% ± 0.42 | +0.24% | -0.02% |
| 2024 (test) | 721 | 245 | 44.9% | -0.53% ± 0.44 | -0.48% | -0.65% |
| 2025 (test) | 718 | 247 | 44.7% | -0.41% ± 0.41 | -0.39% | -0.60% |
| 2026 (test) | 646 | 217 | 46.9% | -0.33% ± 0.42 | -0.33% | -0.50% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 1,409 | 480 | 45.4% | -0.25% ± 0.30 | -0.23% | -0.35% |
| Discovery, market down | 766 | 258 | 44.3% | -0.16% ± 0.42 | -0.14% | -0.36% |
| Test, market up | 1,219 | 419 | 44.8% | -0.50% ± 0.31 | -0.46% | -0.56% |
| Test, market down | 866 | 290 | 46.4% | -0.33% ± 0.39 | -0.31% | -0.49% |

Research output, not investment advice.
