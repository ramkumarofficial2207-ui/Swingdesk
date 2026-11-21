# 151 Strategies §3.17 Single-stock k-nearest neighbours — 5% swing rule

Generated: 2026-11-21T11:02:54.428Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Predicted 10-session return from the 22 most similar past days (price and volume average ratios) > 0.4%; hold 10 sessions.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 4,06,827; trades taken: 4,329; exits delayed by suspension or a locked price: 14. Studies logged in the trial registry so far: 48 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 2133 | ✅ |
| Average net return above 0 | -0.56% | ❌ |
| Lower end of 95% range above 0 | -0.72% | ❌ |
| Day-clustered average above 0 | -0.56% | ❌ |
| Still positive without the 5 best signal days | -0.60% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -24.95% | ❌ |
| Portfolio: max drawdown ≤ 20% | 56.4% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -24.95% vs +6.23%; DD 56.4% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.01% | ✅ |
| Day-clustered excess vs control above 0 | +0.01% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 2,196 | 732 | 31.8% | -0.50% ± 0.16 | -0.50% | -0.55% |
| **Test** | 2,133 | 711 | 31.5% | -0.56% ± 0.16 | -0.56% | -0.60% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.25% (day-clustered -0.25%); test +0.01% (day-clustered +0.01%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-15 → 2024-01-09 | -22.61% | 53.6% | +14.23% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -24.95% | 56.4% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 717 | 239 | 31.2% | -0.45% ± 0.29 | -0.45% | -0.60% |
| 2022 | 744 | 248 | 32.8% | -0.52% ± 0.27 | -0.52% | -0.64% |
| 2023 | 735 | 245 | 31.4% | -0.54% ± 0.26 | -0.54% | -0.65% |
| 2024 (test) | 738 | 246 | 31.2% | -0.56% ± 0.27 | -0.56% | -0.69% |
| 2025 (test) | 744 | 248 | 30.9% | -0.61% ± 0.26 | -0.61% | -0.72% |
| 2026 (test) | 651 | 217 | 32.4% | -0.50% ± 0.28 | -0.50% | -0.62% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 1,422 | 474 | 31.9% | -0.49% ± 0.19 | -0.49% | -0.56% |
| Discovery, market down | 774 | 258 | 31.8% | -0.53% ± 0.27 | -0.53% | -0.65% |
| Test, market up | 1,263 | 421 | 30.6% | -0.60% ± 0.20 | -0.60% | -0.68% |
| Test, market down | 870 | 290 | 32.6% | -0.50% ± 0.24 | -0.50% | -0.59% |

Research output, not investment advice.
