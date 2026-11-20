# Trend ride T2 (half off at +2R, then stop to entry)

Generated: 2026-11-20T17:32:31.157Z · evaluation harness v3 · pre-registered

Plan: [`trend-ride-plan.md`](trend-ride-plan.md). Thesis: The strongest stocks keep outperforming for months; buy them on a pullback to the 20-day average and let winners run with a trailing exit instead of a fixed target.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 8 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 8 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 2,015; trades taken: 464; exits delayed by suspension or a locked price: 0. Studies logged in the trial registry so far: 17 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 231 | ✅ |
| Average net return above 0 | -0.30% | ❌ |
| Lower end of 95% range above 0 | -0.89% | ❌ |
| Day-clustered average above 0 | -0.28% | ❌ |
| Still positive without the 5 best signal days | -0.63% | ❌ |
| Positive in at least 2 of 3 test years | 1 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -3.18% | ❌ |
| Portfolio: max drawdown ≤ 20% | 17.5% | ✅ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -3.18% vs +5.82%; DD 17.5% vs 15.8% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 233 | 172 | 30.5% | +0.52% ± 0.87 | +0.52% | -0.02% |
| **Test** | 231 | 165 | 29.9% | -0.30% ± 0.59 | -0.28% | -0.63% |

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-14 → 2024-02-06 | +4.75% | 12.3% | +14.63% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-19 | -3.18% | 17.5% | +5.82% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 82 | 63 | 24.4% | -0.02% ± 1.18 | +0.03% | -0.94% |
| 2022 | 64 | 46 | 29.7% | -0.33% ± 1.54 | -0.85% | -1.65% |
| 2023 | 87 | 63 | 36.8% | +1.64% ± 1.69 | +2.01% | +0.26% |
| 2024 (test) | 86 | 67 | 41.9% | +0.49% ± 1.12 | +0.39% | -0.25% |
| 2025 (test) | 118 | 78 | 23.7% | -0.65% ± 0.72 | -0.59% | -1.20% |
| 2026 (test) | 27 | 20 | 18.5% | -1.30% ± 1.61 | -1.27% | -2.91% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 233 | 172 | 30.5% | +0.52% ± 0.87 | +0.52% | -0.02% |
| Discovery, market down | 0 | — | — | — | — | — |
| Test, market up | 231 | 165 | 29.9% | -0.30% ± 0.59 | -0.28% | -0.63% |
| Test, market down | 0 | — | — | — | — | — |

Research output, not investment advice.
