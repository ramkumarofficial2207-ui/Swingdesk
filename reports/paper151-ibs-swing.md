# 151 Strategies §4.4 Internal bar strength — 5% swing rule

Generated: 2026-11-21T11:02:22.329Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Bottom 10% by (close − low) ÷ (high − low); hold 1 session.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 71,034; trades taken: 4,292; exits delayed by suspension or a locked price: 39. Studies logged in the trial registry so far: 36 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 2077 | ✅ |
| Average net return above 0 | -0.47% | ❌ |
| Lower end of 95% range above 0 | -0.63% | ❌ |
| Day-clustered average above 0 | -0.49% | ❌ |
| Still positive without the 5 best signal days | -0.52% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -21.01% | ❌ |
| Portfolio: max drawdown ≤ 20% | 50.4% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -21.01% vs +6.23%; DD 50.4% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.09% | ✅ |
| Day-clustered excess vs control above 0 | +0.08% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 2,215 | 741 | 33.4% | -0.54% ± 0.17 | -0.55% | -0.58% |
| **Test** | 2,077 | 708 | 32.8% | -0.47% ± 0.16 | -0.49% | -0.52% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.28% (day-clustered -0.29%); test +0.09% (day-clustered +0.08%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-17 | -23.81% | 57.7% | +15.28% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -21.01% | 50.4% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 744 | 248 | 32.3% | -0.58% ± 0.28 | -0.58% | -0.69% |
| 2022 | 743 | 248 | 31.0% | -0.64% ± 0.27 | -0.64% | -0.76% |
| 2023 | 728 | 245 | 37.0% | -0.40% ± 0.33 | -0.42% | -0.52% |
| 2024 (test) | 726 | 245 | 33.5% | -0.44% ± 0.27 | -0.42% | -0.53% |
| 2025 (test) | 720 | 247 | 34.0% | -0.40% ± 0.28 | -0.44% | -0.55% |
| 2026 (test) | 631 | 216 | 30.6% | -0.59% ± 0.28 | -0.61% | -0.72% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 1,444 | 483 | 34.6% | -0.44% ± 0.21 | -0.45% | -0.50% |
| Discovery, market down | 771 | 258 | 31.1% | -0.72% ± 0.29 | -0.73% | -0.84% |
| Test, market up | 1,216 | 418 | 31.7% | -0.55% ± 0.20 | -0.56% | -0.62% |
| Test, market down | 861 | 290 | 34.3% | -0.36% ± 0.25 | -0.38% | -0.48% |

Research output, not investment advice.
