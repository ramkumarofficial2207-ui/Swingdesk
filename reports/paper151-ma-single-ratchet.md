# 151 Strategies §3.11 Single moving average — ratcheting-stop swing rule

Generated: 2026-11-21T11:28:07.380Z · evaluation harness v3 · pre-registered

Plan: [`paper151-ratchet-plan.md`](paper151-ratchet-plan.md). Thesis: Close crosses above its 50-day average; sell after a close below it (max 60 sessions).

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 22,637; trades taken: 2,850; exits delayed by suspension or a locked price: 2. Studies logged in the trial registry so far: 62 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1415 | ✅ |
| Average net return above 0 | -0.69% | ❌ |
| Lower end of 95% range above 0 | -0.98% | ❌ |
| Day-clustered average above 0 | -0.76% | ❌ |
| Still positive without the 5 best signal days | -0.75% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -21.44% | ❌ |
| Portfolio: max drawdown ≤ 20% | 51.4% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -21.44% vs +6.23%; DD 51.4% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -0.18% | ❌ |
| Day-clustered excess vs control above 0 | -0.20% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,435 | 647 | 46.7% | -0.29% ± 0.26 | -0.31% | -0.31% |
| **Test** | 1,415 | 631 | 42.5% | -0.69% ± 0.29 | -0.76% | -0.75% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.20% (day-clustered -0.24%); test -0.18% (day-clustered -0.20%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-18 | -9.61% | 47.1% | +15.06% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -21.44% | 51.4% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 516 | 217 | 49.8% | +0.06% ± 0.45 | -0.02% | -0.02% |
| 2022 | 518 | 227 | 39.8% | -1.12% ± 0.43 | -1.08% | -1.23% |
| 2023 | 401 | 203 | 51.6% | +0.35% ± 0.47 | +0.24% | +0.26% |
| 2024 (test) | 494 | 221 | 44.7% | -0.38% ± 0.47 | -0.61% | -0.54% |
| 2025 (test) | 467 | 211 | 43.9% | -0.65% ± 0.57 | -0.51% | -0.79% |
| 2026 (test) | 454 | 199 | 38.5% | -1.06% ± 0.47 | -1.18% | -1.21% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 871 | 412 | 47.5% | -0.21% ± 0.33 | -0.12% | -0.26% |
| Discovery, market down | 564 | 235 | 45.4% | -0.40% ± 0.42 | -0.64% | -0.49% |
| Test, market up | 778 | 364 | 42.5% | -0.72% ± 0.41 | -0.79% | -0.81% |
| Test, market down | 637 | 267 | 42.4% | -0.65% ± 0.41 | -0.72% | -0.82% |

Research output, not investment advice.
