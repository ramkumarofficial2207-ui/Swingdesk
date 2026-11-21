# 151 Strategies §3.9 Industry-neutral mean-reversion — 5% swing rule

Generated: 2026-11-21T11:02:16.696Z · evaluation harness v3 · pre-registered

Plan: [`paper151-plan.md`](paper151-plan.md). Thesis: Bottom 10% by 5-session return minus own industry average; hold 5 sessions.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 47,630; trades taken: 4,305; exits delayed by suspension or a locked price: 7. Studies logged in the trial registry so far: 34 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 2121 | ✅ |
| Average net return above 0 | -0.69% | ❌ |
| Lower end of 95% range above 0 | -0.84% | ❌ |
| Day-clustered average above 0 | -0.69% | ❌ |
| Still positive without the 5 best signal days | -0.73% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -29.38% | ❌ |
| Portfolio: max drawdown ≤ 20% | 62.8% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -29.38% vs +6.23%; DD 62.8% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks with an industry label, same day and exit) above 0 | -0.16% | ❌ |
| Day-clustered excess vs control above 0 | -0.16% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 2,184 | 739 | 36.8% | -0.20% ± 0.16 | -0.18% | -0.23% |
| **Test** | 2,121 | 711 | 29.7% | -0.69% ± 0.15 | -0.69% | -0.73% |

Control group (all universe stocks with an industry label, same day and exit): excess per trade, discovery -0.01% (day-clustered +0.00%); test -0.16% (day-clustered -0.16%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-11 | -9.91% | 44.1% | +15.50% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -29.38% | 62.8% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 728 | 246 | 39.6% | +0.11% ± 0.27 | +0.12% | +0.01% |
| 2022 | 744 | 248 | 30.9% | -0.63% ± 0.25 | -0.63% | -0.74% |
| 2023 | 712 | 245 | 40.0% | -0.06% ± 0.31 | -0.03% | -0.16% |
| 2024 (test) | 735 | 246 | 31.0% | -0.58% ± 0.26 | -0.58% | -0.69% |
| 2025 (test) | 738 | 248 | 29.8% | -0.70% ± 0.25 | -0.71% | -0.82% |
| 2026 (test) | 648 | 217 | 28.1% | -0.79% ± 0.27 | -0.80% | -0.92% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 1,413 | 481 | 37.7% | -0.08% ± 0.19 | -0.06% | -0.13% |
| Discovery, market down | 771 | 258 | 35.0% | -0.42% ± 0.29 | -0.42% | -0.52% |
| Test, market up | 1,255 | 421 | 29.2% | -0.72% ± 0.20 | -0.73% | -0.79% |
| Test, market down | 866 | 290 | 30.4% | -0.63% ± 0.23 | -0.64% | -0.73% |

Research output, not investment advice.
