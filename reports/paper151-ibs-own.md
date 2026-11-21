# 151 Strategies §4.4 Internal bar strength — paper's own holding rule

Generated: 2026-11-21T11:02:19.086Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Bottom 10% by (close − low) ÷ (high − low); hold 1 session.

Trader rules: top 5 candidates per day by score, at most 5 per industry, at most 5 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 5 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 71,034; trades taken: 7,260; exits delayed by suspension or a locked price: 0. Studies logged in the trial registry so far: 35 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 3555 | ✅ |
| Average net return above 0 | -0.56% | ❌ |
| Lower end of 95% range above 0 | -0.65% | ❌ |
| Day-clustered average above 0 | -0.56% | ❌ |
| Still positive without the 5 best signal days | -0.62% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -76.36% | ❌ |
| Portfolio: max drawdown ≤ 20% | 98.3% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -76.36% vs +6.23%; DD 98.3% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -0.02% | ❌ |
| Day-clustered excess vs control above 0 | -0.02% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 3,705 | 741 | 33.4% | -0.52% ± 0.10 | -0.52% | -0.56% |
| **Test** | 3,555 | 711 | 35.1% | -0.56% ± 0.09 | -0.56% | -0.62% |

Control group (all universe stocks, same day and exit): excess per trade, discovery +0.04% (day-clustered +0.04%); test -0.02% (day-clustered -0.02%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-01 | -73.95% | 98.3% | +15.86% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -76.36% | 98.3% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 1,240 | 248 | 33.0% | -0.50% ± 0.18 | -0.50% | -0.62% |
| 2022 | 1,240 | 248 | 32.3% | -0.69% ± 0.16 | -0.69% | -0.81% |
| 2023 | 1,225 | 245 | 34.8% | -0.36% ± 0.16 | -0.36% | -0.47% |
| 2024 (test) | 1,230 | 246 | 34.2% | -0.56% ± 0.16 | -0.56% | -0.70% |
| 2025 (test) | 1,240 | 248 | 34.4% | -0.56% ± 0.16 | -0.56% | -0.68% |
| 2026 (test) | 1,085 | 217 | 37.0% | -0.56% ± 0.16 | -0.56% | -0.66% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 2,415 | 483 | 33.0% | -0.49% ± 0.12 | -0.49% | -0.56% |
| Discovery, market down | 1,290 | 258 | 34.0% | -0.56% ± 0.16 | -0.56% | -0.68% |
| Test, market up | 2,105 | 421 | 33.3% | -0.60% ± 0.12 | -0.60% | -0.69% |
| Test, market down | 1,450 | 290 | 37.7% | -0.50% ± 0.14 | -0.50% | -0.60% |

Research output, not investment advice.
