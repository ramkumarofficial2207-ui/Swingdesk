# Rising volume before the move V2 + ratcheting stop

Generated: 2026-11-21T11:16:18.439Z · evaluation harness v3 · pre-registered

Plan: [`volume-rise-ratchet-plan.md`](volume-rise-ratchet-plan.md). Thesis: V1 + today closed up. Top 3 per day by today's volume ratio.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 31,410; trades taken: 4,111; exits delayed by suspension or a locked price: 2. Studies logged in the trial registry so far: 52 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 2018 | ✅ |
| Average net return above 0 | -0.90% | ❌ |
| Lower end of 95% range above 0 | -1.14% | ❌ |
| Day-clustered average above 0 | -0.94% | ❌ |
| Still positive without the 5 best signal days | -0.96% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -35.56% | ❌ |
| Portfolio: max drawdown ≤ 20% | 72.9% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -35.56% vs +6.23%; DD 72.9% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -0.34% | ❌ |
| Day-clustered excess vs control above 0 | -0.36% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 2,093 | 733 | 45.0% | -0.43% ± 0.23 | -0.44% | -0.50% |
| **Test** | 2,018 | 705 | 40.7% | -0.90% ± 0.23 | -0.94% | -0.96% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.37% (day-clustered -0.38%); test -0.34% (day-clustered -0.36%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-15 | -19.32% | 55.1% | +16.26% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -35.56% | 72.9% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 728 | 247 | 44.2% | -0.40% ± 0.42 | -0.42% | -0.60% |
| 2022 | 691 | 244 | 42.7% | -0.79% ± 0.37 | -0.78% | -0.94% |
| 2023 | 674 | 242 | 48.2% | -0.10% ± 0.40 | -0.10% | -0.22% |
| 2024 (test) | 718 | 246 | 44.0% | -0.65% ± 0.40 | -0.65% | -0.81% |
| 2025 (test) | 662 | 243 | 39.6% | -1.10% ± 0.40 | -1.15% | -1.21% |
| 2026 (test) | 638 | 216 | 38.2% | -0.98% ± 0.42 | -1.01% | -1.18% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 1,364 | 479 | 46.5% | -0.29% ± 0.29 | -0.28% | -0.40% |
| Discovery, market down | 729 | 254 | 42.2% | -0.70% ± 0.37 | -0.73% | -0.84% |
| Test, market up | 1,170 | 416 | 39.7% | -1.03% ± 0.31 | -1.07% | -1.11% |
| Test, market down | 848 | 289 | 42.1% | -0.72% ± 0.35 | -0.74% | -0.86% |

Research output, not investment advice.
