# 151 Strategies §3.7 Residual momentum — ratcheting-stop swing rule

Generated: 2026-11-21T11:27:59.687Z · evaluation harness v3 · pre-registered

Plan: [`paper151-ratchet-plan.md`](paper151-ratchet-plan.md). Thesis: Top 10% by mean ÷ volatility of 12 monthly residuals vs NIFTY 50 (beta from 24 months); monthly rebalance.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 50,402; trades taken: 3,048; exits delayed by suspension or a locked price: 2. Studies logged in the trial registry so far: 58 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1828 | ✅ |
| Average net return above 0 | -0.25% | ❌ |
| Lower end of 95% range above 0 | -0.50% | ❌ |
| Day-clustered average above 0 | -0.19% | ❌ |
| Still positive without the 5 best signal days | -0.33% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -11.67% | ❌ |
| Portfolio: max drawdown ≤ 20% | 42.0% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -11.67% vs +6.23%; DD 42.0% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.29% | ✅ |
| Day-clustered excess vs control above 0 | +0.38% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,220 | 451 | 49.8% | +0.07% ± 0.31 | +0.01% | -0.03% |
| **Test** | 1,828 | 686 | 47.2% | -0.25% ± 0.25 | -0.19% | -0.33% |

Control group (all universe stocks, same day and exit): excess per trade, discovery +0.04% (day-clustered -0.01%); test +0.29% (day-clustered +0.38%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2022-02-11 → 2024-01-12 | +1.47% | 34.0% | +12.79% | 15.3% |
| **Test** | 2024-01-02 → 2026-11-20 | -11.67% | 42.0% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2022 | 618 | 217 | 45.3% | -0.50% ± 0.44 | -0.59% | -0.70% |
| 2023 | 602 | 234 | 54.5% | +0.65% ± 0.43 | +0.57% | +0.54% |
| 2024 (test) | 649 | 238 | 48.4% | -0.12% ± 0.42 | -0.10% | -0.30% |
| 2025 (test) | 629 | 238 | 44.8% | -0.49% ± 0.44 | -0.24% | -0.67% |
| 2026 (test) | 550 | 210 | 48.4% | -0.14% ± 0.45 | -0.24% | -0.29% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 693 | 262 | 50.5% | +0.20% ± 0.41 | +0.12% | +0.12% |
| Discovery, market down | 527 | 189 | 49.0% | -0.10% ± 0.47 | -0.14% | -0.33% |
| Test, market up | 1,034 | 400 | 46.6% | -0.29% ± 0.34 | -0.14% | -0.41% |
| Test, market down | 794 | 286 | 47.9% | -0.20% ± 0.37 | -0.26% | -0.37% |

Research output, not investment advice.
