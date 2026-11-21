# 151 Strategies §3.13 Three moving averages — 5% swing rule

Generated: 2026-11-21T11:02:35.686Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: 3 > 10 > 21-day averages newly lined up; sell when 3 ≤ 10 (max 60).

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 30,354; trades taken: 3,953; exits delayed by suspension or a locked price: 0. Studies logged in the trial registry so far: 42 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1964 | ✅ |
| Average net return above 0 | -0.57% | ❌ |
| Lower end of 95% range above 0 | -0.73% | ❌ |
| Day-clustered average above 0 | -0.59% | ❌ |
| Still positive without the 5 best signal days | -0.62% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -23.91% | ❌ |
| Portfolio: max drawdown ≤ 20% | 56.2% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -23.91% vs +6.23%; DD 56.2% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -0.03% | ❌ |
| Day-clustered excess vs control above 0 | -0.03% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,989 | 721 | 36.6% | -0.24% ± 0.16 | -0.24% | -0.28% |
| **Test** | 1,964 | 698 | 32.2% | -0.57% ± 0.16 | -0.59% | -0.62% |

Control group (all universe stocks, same day and exit): excess per trade, discovery +0.04% (day-clustered +0.03%); test -0.03% (day-clustered -0.03%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-12 | -10.74% | 36.7% | +15.92% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -23.91% | 56.2% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 707 | 246 | 35.9% | -0.27% ± 0.26 | -0.27% | -0.38% |
| 2022 | 673 | 240 | 35.2% | -0.34% ± 0.27 | -0.36% | -0.44% |
| 2023 | 609 | 235 | 38.9% | -0.10% ± 0.29 | -0.09% | -0.20% |
| 2024 (test) | 700 | 245 | 33.9% | -0.39% ± 0.27 | -0.43% | -0.51% |
| 2025 (test) | 641 | 239 | 32.8% | -0.61% ± 0.28 | -0.60% | -0.74% |
| 2026 (test) | 623 | 214 | 29.9% | -0.75% ± 0.28 | -0.77% | -0.90% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 1,278 | 470 | 37.9% | -0.15% ± 0.20 | -0.11% | -0.21% |
| Discovery, market down | 711 | 251 | 34.3% | -0.42% ± 0.27 | -0.49% | -0.52% |
| Test, market up | 1,131 | 413 | 32.7% | -0.55% ± 0.21 | -0.58% | -0.63% |
| Test, market down | 833 | 285 | 31.6% | -0.61% ± 0.24 | -0.61% | -0.72% |

Research output, not investment advice.
