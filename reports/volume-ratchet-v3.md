# Rising volume before the move V3 + ratcheting stop

Generated: 2026-11-21T11:16:20.365Z · evaluation harness v3 · pre-registered

Plan: [`volume-rise-ratchet-plan.md`](volume-rise-ratchet-plan.md). Thesis: V1 + price up 0–3% over the 3 sessions (move not started yet). Top 3 per day by today's volume ratio.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 8,996; trades taken: 3,066; exits delayed by suspension or a locked price: 3. Studies logged in the trial registry so far: 53 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1506 | ✅ |
| Average net return above 0 | -0.89% | ❌ |
| Lower end of 95% range above 0 | -1.17% | ❌ |
| Day-clustered average above 0 | -0.99% | ❌ |
| Still positive without the 5 best signal days | -0.95% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -27.81% | ❌ |
| Portfolio: max drawdown ≤ 20% | 61.8% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -27.81% vs +6.23%; DD 61.8% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -0.37% | ❌ |
| Day-clustered excess vs control above 0 | -0.45% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,560 | 679 | 45.7% | -0.31% ± 0.25 | -0.25% | -0.36% |
| **Test** | 1,506 | 646 | 42.0% | -0.89% ± 0.28 | -0.99% | -0.95% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.23% (day-clustered -0.16%); test -0.37% (day-clustered -0.45%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-18 | -11.01% | 40.6% | +15.06% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -27.81% | 61.8% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 554 | 228 | 46.8% | -0.06% ± 0.44 | -0.02% | -0.18% |
| 2022 | 536 | 230 | 42.9% | -0.69% ± 0.42 | -0.51% | -0.77% |
| 2023 | 470 | 221 | 47.7% | -0.17% ± 0.46 | -0.21% | -0.32% |
| 2024 (test) | 530 | 221 | 43.0% | -0.69% ± 0.43 | -0.74% | -0.78% |
| 2025 (test) | 517 | 224 | 42.9% | -0.96% ± 0.54 | -1.04% | -1.08% |
| 2026 (test) | 459 | 201 | 39.7% | -1.04% ± 0.48 | -1.20% | -1.24% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 1,001 | 441 | 47.6% | -0.23% ± 0.32 | -0.10% | -0.31% |
| Discovery, market down | 559 | 238 | 42.4% | -0.46% ± 0.41 | -0.52% | -0.55% |
| Test, market up | 850 | 375 | 41.5% | -1.01% ± 0.37 | -1.08% | -1.06% |
| Test, market down | 656 | 271 | 42.5% | -0.74% ± 0.42 | -0.86% | -0.88% |

Research output, not investment advice.
