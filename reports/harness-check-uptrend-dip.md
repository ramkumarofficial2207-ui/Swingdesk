# Harness check: uptrend dip (U1) under trader rules

Generated: 2026-11-19T14:47:52.856Z · evaluation harness v3 · harness-check

Plan: [`uptrend-dip-plan.md`](uptrend-dip-plan.md). Thesis: Short-term reversal in stocks still above their 50-day average.

Trader rules: top 5 candidates per day by score, at most 2 per industry, at most 5 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 5 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 7,824; trades taken: 1,058; exits delayed by suspension or a locked price: 28. Ideas logged in the trial registry so far: 1.

## Verdict: **FAIL** (harness check, not a new study)

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 491 | ✅ |
| Average net return above 0 | -0.60% | ❌ |
| Lower end of 95% range above 0 | -1.27% | ❌ |
| Day-clustered average above 0 | -0.59% | ❌ |
| Still positive without the 5 best signal days | -0.87% | ❌ |
| Positive in at least 2 of 3 test years | 1 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -22.78% | ❌ |
| Portfolio: max drawdown ≤ 20% | 59.9% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -22.78% vs +5.98%; DD 59.9% vs 15.8% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 567 | 388 | 50.1% | +0.98% ± 0.65 | +0.96% | +0.71% |
| **Test** | 491 | 335 | 44.6% | -0.60% ± 0.68 | -0.59% | -0.87% |

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-06 → 2024-01-03 | +40.64% | 19.9% | +15.07% | 17.2% |
| **Test** | 2024-01-03 → 2026-11-19 | -22.78% | 59.9% | +5.98% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 199 | 138 | 50.8% | +1.17% ± 1.30 | +1.11% | +0.42% |
| 2022 | 170 | 125 | 47.6% | +0.86% ± 1.17 | +0.87% | +0.15% |
| 2023 | 198 | 125 | 51.5% | +0.88% ± 0.87 | +0.87% | +0.47% |
| 2024 (test) | 171 | 114 | 41.5% | -0.93% ± 1.28 | -0.87% | -1.81% |
| 2025 (test) | 161 | 104 | 44.7% | -0.98% ± 1.06 | -1.10% | -1.57% |
| 2026 (test) | 159 | 117 | 47.8% | +0.15% ± 1.16 | +0.16% | -0.53% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 383 | 260 | 50.7% | +1.14% ± 0.77 | +1.05% | +0.80% |
| Discovery, market down | 184 | 128 | 48.9% | +0.64% ± 1.21 | +0.76% | -0.05% |
| Test, market up | 307 | 209 | 45.3% | -0.28% ± 0.78 | -0.08% | -0.69% |
| Test, market down | 184 | 126 | 43.5% | -1.12% ± 1.25 | -1.43% | -1.63% |

Note: Re-run of a failed study to validate the harness; ranking by dip depth was added for the top-N rule.

Research output, not investment advice.
