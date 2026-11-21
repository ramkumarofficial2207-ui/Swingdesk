# 151 Strategies §4.4 Internal bar strength — ratcheting-stop swing rule

Generated: 2026-11-21T11:28:05.398Z · evaluation harness v3 · pre-registered

Plan: [`paper151-ratchet-plan.md`](paper151-ratchet-plan.md). Thesis: Bottom 10% by (close − low) ÷ (high − low); hold 1 session.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 71,034; trades taken: 3,635; exits delayed by suspension or a locked price: 54. Studies logged in the trial registry so far: 61 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1747 | ✅ |
| Average net return above 0 | -0.65% | ❌ |
| Lower end of 95% range above 0 | -0.91% | ❌ |
| Day-clustered average above 0 | -0.71% | ❌ |
| Still positive without the 5 best signal days | -0.72% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -24.51% | ❌ |
| Portfolio: max drawdown ≤ 20% | 56.7% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -24.51% vs +6.23%; DD 56.7% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -0.13% | ❌ |
| Day-clustered excess vs control above 0 | -0.15% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,888 | 713 | 45.4% | -0.37% ± 0.26 | -0.48% | -0.44% |
| **Test** | 1,747 | 667 | 42.8% | -0.65% ± 0.26 | -0.71% | -0.72% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.29% (day-clustered -0.40%); test -0.13% (day-clustered -0.15%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-17 | -15.50% | 49.8% | +15.28% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -24.51% | 56.7% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 683 | 244 | 46.6% | -0.18% ± 0.42 | -0.27% | -0.34% |
| 2022 | 643 | 245 | 40.3% | -0.82% ± 0.42 | -0.92% | -1.00% |
| 2023 | 562 | 224 | 49.8% | -0.10% ± 0.51 | -0.24% | -0.32% |
| 2024 (test) | 643 | 239 | 44.8% | -0.63% ± 0.44 | -0.63% | -0.79% |
| 2025 (test) | 588 | 228 | 42.7% | -0.63% ± 0.45 | -0.71% | -0.81% |
| 2026 (test) | 516 | 200 | 40.5% | -0.70% ± 0.46 | -0.80% | -0.89% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 1,197 | 461 | 46.5% | -0.26% ± 0.33 | -0.42% | -0.35% |
| Discovery, market down | 691 | 252 | 43.4% | -0.57% ± 0.43 | -0.60% | -0.76% |
| Test, market up | 984 | 391 | 41.6% | -0.88% ± 0.34 | -0.96% | -0.97% |
| Test, market down | 763 | 276 | 44.4% | -0.35% ± 0.41 | -0.35% | -0.54% |

Research output, not investment advice.
