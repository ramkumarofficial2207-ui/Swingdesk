# Trend ride T1 (trailing exit only)

Generated: 2026-11-20T17:30:49.688Z · evaluation harness v3 · pre-registered

Plan: [`trend-ride-plan.md`](trend-ride-plan.md). Thesis: The strongest stocks keep outperforming for months; buy them on a pullback to the 20-day average and let winners run with a trailing exit instead of a fixed target.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 8 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 8 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 2,015; trades taken: 464; exits delayed by suspension or a locked price: 0. Studies logged in the trial registry so far: 16 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 231 | ✅ |
| Average net return above 0 | -0.44% | ❌ |
| Lower end of 95% range above 0 | -1.11% | ❌ |
| Day-clustered average above 0 | -0.44% | ❌ |
| Still positive without the 5 best signal days | -0.93% | ❌ |
| Positive in at least 2 of 3 test years | 1 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -4.47% | ❌ |
| Portfolio: max drawdown ≤ 20% | 18.6% | ✅ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -4.47% vs +5.82%; DD 18.6% vs 15.8% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 233 | 172 | 28.3% | +0.82% ± 1.21 | +0.82% | -0.02% |
| **Test** | 231 | 165 | 28.1% | -0.44% ± 0.67 | -0.44% | -0.93% |

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-14 → 2024-02-06 | +7.50% | 12.3% | +14.63% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-19 | -4.47% | 18.6% | +5.82% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 82 | 63 | 23.2% | -0.07% ± 1.41 | -0.02% | -1.35% |
| 2022 | 64 | 46 | 23.4% | -0.35% ± 2.13 | -1.01% | -1.91% |
| 2023 | 87 | 63 | 36.8% | +2.52% ± 2.49 | +2.98% | +0.03% |
| 2024 (test) | 86 | 67 | 38.4% | +0.26% ± 1.31 | +0.08% | -0.86% |
| 2025 (test) | 118 | 78 | 22.9% | -0.76% ± 0.79 | -0.66% | -1.49% |
| 2026 (test) | 27 | 20 | 18.5% | -1.28% ± 1.72 | -1.33% | -2.91% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 233 | 172 | 28.3% | +0.82% ± 1.21 | +0.82% | -0.02% |
| Discovery, market down | 0 | — | — | — | — | — |
| Test, market up | 231 | 165 | 28.1% | -0.44% ± 0.67 | -0.44% | -0.93% |
| Test, market down | 0 | — | — | — | — | — |

Research output, not investment advice.
