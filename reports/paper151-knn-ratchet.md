# 151 Strategies §3.17 Single-stock k-nearest neighbours — ratcheting-stop swing rule

Generated: 2026-11-21T11:28:19.630Z · evaluation harness v3 · pre-registered

Plan: [`paper151-ratchet-plan.md`](paper151-ratchet-plan.md). Thesis: Predicted 10-session return from the 22 most similar past days (price and volume average ratios) > 0.4%; hold 10 sessions.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 4,06,827; trades taken: 4,200; exits delayed by suspension or a locked price: 24. Studies logged in the trial registry so far: 67 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 2074 | ✅ |
| Average net return above 0 | -0.57% | ❌ |
| Lower end of 95% range above 0 | -0.80% | ❌ |
| Day-clustered average above 0 | -0.58% | ❌ |
| Still positive without the 5 best signal days | -0.64% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -25.42% | ❌ |
| Portfolio: max drawdown ≤ 20% | 58.1% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -25.42% vs +6.23%; DD 58.1% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.01% | ✅ |
| Day-clustered excess vs control above 0 | -0.00% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 2,126 | 730 | 46.2% | -0.21% ± 0.24 | -0.21% | -0.27% |
| **Test** | 2,074 | 708 | 43.7% | -0.57% ± 0.24 | -0.58% | -0.64% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.14% (day-clustered -0.16%); test +0.01% (day-clustered -0.00%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-15 → 2024-01-12 | -10.78% | 37.9% | +14.79% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -25.42% | 58.1% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 712 | 239 | 45.6% | -0.18% ± 0.43 | -0.20% | -0.37% |
| 2022 | 721 | 247 | 45.1% | -0.37% ± 0.40 | -0.38% | -0.55% |
| 2023 | 693 | 244 | 48.1% | -0.07% ± 0.44 | -0.07% | -0.22% |
| 2024 (test) | 729 | 246 | 43.8% | -0.68% ± 0.41 | -0.67% | -0.87% |
| 2025 (test) | 702 | 245 | 43.7% | -0.54% ± 0.41 | -0.59% | -0.67% |
| 2026 (test) | 643 | 217 | 43.7% | -0.47% ± 0.42 | -0.47% | -0.62% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 1,360 | 472 | 47.3% | -0.10% ± 0.31 | -0.12% | -0.19% |
| Discovery, market down | 766 | 258 | 44.4% | -0.40% ± 0.40 | -0.40% | -0.57% |
| Test, market up | 1,219 | 420 | 43.2% | -0.60% ± 0.31 | -0.60% | -0.69% |
| Test, market down | 855 | 288 | 44.6% | -0.52% ± 0.38 | -0.55% | -0.68% |

Research output, not investment advice.
