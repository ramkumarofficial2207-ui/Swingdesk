# Rising volume before the move V3 (old +5/−2.5 exit, comparison only)

Generated: 2026-11-21T11:16:24.715Z · evaluation harness v3 · exploration

Plan: [`volume-rise-ratchet-plan.md`](volume-rise-ratchet-plan.md). Thesis: V1 + price up 0–3% over the 3 sessions (move not started yet). Top 3 per day by today's volume ratio.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 8,996; trades taken: 3,834; exits delayed by suspension or a locked price: 1. Studies logged in the trial registry so far: 55 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1888 | ✅ |
| Average net return above 0 | -0.83% | ❌ |
| Lower end of 95% range above 0 | -1.00% | ❌ |
| Day-clustered average above 0 | -0.81% | ❌ |
| Still positive without the 5 best signal days | -0.88% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -31.41% | ❌ |
| Portfolio: max drawdown ≤ 20% | 66.0% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -31.41% vs +6.23%; DD 66.0% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -0.26% | ❌ |
| Day-clustered excess vs control above 0 | -0.24% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,946 | 720 | 32.7% | -0.51% ± 0.16 | -0.50% | -0.54% |
| **Test** | 1,888 | 689 | 28.7% | -0.83% ± 0.17 | -0.81% | -0.88% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.25% (day-clustered -0.22%); test -0.26% (day-clustered -0.24%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-09 | -20.27% | 51.3% | +15.36% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -31.41% | 66.0% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 657 | 239 | 33.5% | -0.40% ± 0.28 | -0.36% | -0.51% |
| 2022 | 648 | 241 | 31.9% | -0.56% ± 0.27 | -0.60% | -0.65% |
| 2023 | 641 | 240 | 32.8% | -0.55% ± 0.27 | -0.54% | -0.64% |
| 2024 (test) | 651 | 237 | 29.5% | -0.73% ± 0.27 | -0.65% | -0.82% |
| 2025 (test) | 664 | 240 | 29.4% | -0.75% ± 0.27 | -0.74% | -0.88% |
| 2026 (test) | 573 | 212 | 27.1% | -1.04% ± 0.34 | -1.07% | -1.15% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 1,291 | 472 | 33.3% | -0.46% ± 0.20 | -0.42% | -0.51% |
| Discovery, market down | 655 | 248 | 31.6% | -0.59% ± 0.27 | -0.66% | -0.71% |
| Test, market up | 1,123 | 408 | 28.0% | -0.89% ± 0.20 | -0.86% | -0.95% |
| Test, market down | 765 | 281 | 29.8% | -0.75% ± 0.29 | -0.74% | -0.85% |

Note: Same entry as the primary with the old exit, for comparison only.

Research output, not investment advice.
