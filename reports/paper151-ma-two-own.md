# 151 Strategies §3.12 Two moving averages — paper's own holding rule

Generated: 2026-11-21T11:02:29.145Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: 10-day average crosses above 30-day; sell when it crosses back or the close falls > 2% in a day (max 60).

Trader rules: top 5 candidates per day by score, at most 20 per industry, at most 20 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 20 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 12,654; trades taken: 2,938; exits delayed by suspension or a locked price: 2. Studies logged in the trial registry so far: 39 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1518 | ✅ |
| Average net return above 0 | -0.38% | ❌ |
| Lower end of 95% range above 0 | -0.72% | ❌ |
| Day-clustered average above 0 | -0.43% | ❌ |
| Still positive without the 5 best signal days | -0.54% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -10.26% | ❌ |
| Portfolio: max drawdown ≤ 20% | 29.9% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -10.26% vs +6.23%; DD 29.9% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -0.55% | ❌ |
| Day-clustered excess vs control above 0 | -0.55% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,420 | 570 | 38.1% | +0.50% ± 0.36 | +0.79% | +0.39% |
| **Test** | 1,518 | 588 | 33.4% | -0.38% ± 0.34 | -0.43% | -0.54% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.97% (day-clustered -0.79%); test -0.55% (day-clustered -0.55%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-02-08 | +10.17% | 25.0% | +15.24% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -10.26% | 29.9% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 548 | 210 | 40.3% | +0.77% ± 0.57 | +0.83% | +0.49% |
| 2022 | 491 | 193 | 31.0% | -0.40% ± 0.55 | -0.19% | -0.81% |
| 2023 | 381 | 167 | 44.1% | +1.28% ± 0.74 | +1.87% | +0.97% |
| 2024 (test) | 516 | 204 | 33.7% | -0.33% ± 0.56 | -0.01% | -0.69% |
| 2025 (test) | 481 | 199 | 35.8% | -0.45% ± 0.62 | -0.70% | -0.74% |
| 2026 (test) | 521 | 185 | 30.9% | -0.37% ± 0.58 | -0.59% | -0.84% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 775 | 337 | 38.1% | +0.62% ± 0.48 | +1.10% | +0.42% |
| Discovery, market down | 645 | 233 | 38.1% | +0.37% ± 0.52 | +0.33% | +0.10% |
| Test, market up | 767 | 333 | 35.3% | -0.40% ± 0.48 | -0.45% | -0.58% |
| Test, market down | 751 | 255 | 31.4% | -0.36% ± 0.47 | -0.40% | -0.69% |

Research output, not investment advice.
