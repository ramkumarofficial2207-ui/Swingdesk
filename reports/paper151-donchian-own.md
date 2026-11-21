# 151 Strategies §3.15 Donchian channel — paper's own holding rule

Generated: 2026-11-21T11:02:44.959Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Close at or below the 20-session low of closes (floor); sell at a close at or above the 20-session high (max 60).

Trader rules: top 5 candidates per day by score, at most 20 per industry, at most 20 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 20 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 66,743; trades taken: 999; exits delayed by suspension or a locked price: 6. Studies logged in the trial registry so far: 45 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 468 | ✅ |
| Average net return above 0 | +0.79% | ✅ |
| Lower end of 95% range above 0 | -0.12% | ❌ |
| Day-clustered average above 0 | +0.89% | ✅ |
| Still positive without the 5 best signal days | +0.53% | ✅ |
| Positive in at least 2 of 3 test years | 2 of 3 | ✅ |
| Portfolio: net CAGR above 0 | +5.67% | ✅ |
| Portfolio: max drawdown ≤ 20% | 21.5% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | +5.67% vs +6.23%; DD 21.5% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.45% | ✅ |
| Day-clustered excess vs control above 0 | +0.38% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 531 | 339 | 69.3% | +1.29% ± 0.86 | +1.34% | +1.09% |
| **Test** | 468 | 318 | 61.8% | +0.79% ± 0.91 | +0.89% | +0.53% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.76% (day-clustered -0.67%); test +0.45% (day-clustered +0.38%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-03-05 | +9.91% | 23.9% | +15.94% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | +5.67% | 21.5% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 181 | 117 | 69.1% | +1.50% ± 1.23 | +1.51% | +1.09% |
| 2022 | 158 | 103 | 57.0% | -1.41% ± 2.12 | -1.35% | -2.40% |
| 2023 | 192 | 119 | 79.7% | +3.32% ± 1.06 | +3.50% | +2.77% |
| 2024 (test) | 172 | 112 | 65.7% | +0.84% ± 1.44 | +0.99% | +0.30% |
| 2025 (test) | 158 | 113 | 58.2% | -0.52% ± 1.69 | -0.27% | -1.13% |
| 2026 (test) | 138 | 93 | 60.9% | +2.23% ± 1.59 | +2.18% | +1.49% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 417 | 253 | 68.1% | +0.89% ± 0.97 | +0.74% | +0.69% |
| Discovery, market down | 114 | 86 | 73.7% | +2.77% ± 1.89 | +3.10% | +1.80% |
| Test, market up | 310 | 209 | 59.0% | -0.19% ± 1.14 | -0.21% | -0.56% |
| Test, market down | 158 | 109 | 67.1% | +2.70% ± 1.47 | +2.99% | +2.07% |

Research output, not investment advice.
