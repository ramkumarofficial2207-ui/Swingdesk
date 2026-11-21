# Rising volume before the move V1 + ratcheting stop

Generated: 2026-11-21T11:16:16.374Z · evaluation harness v3 · pre-registered

Plan: [`volume-rise-ratchet-plan.md`](volume-rise-ratchet-plan.md). Thesis: Volume rising 3 sessions in a row, today ≥ 1.5× its 20-day average. Top 3 per day by today's volume ratio.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 44,782; trades taken: 4,072; exits delayed by suspension or a locked price: 3. Studies logged in the trial registry so far: 51 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 2013 | ✅ |
| Average net return above 0 | -1.02% | ❌ |
| Lower end of 95% range above 0 | -1.25% | ❌ |
| Day-clustered average above 0 | -1.06% | ❌ |
| Still positive without the 5 best signal days | -1.07% | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -39.12% | ❌ |
| Portfolio: max drawdown ≤ 20% | 76.4% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -39.12% vs +6.23%; DD 76.4% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | -0.46% | ❌ |
| Day-clustered excess vs control above 0 | -0.49% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 2,059 | 735 | 44.8% | -0.41% ± 0.23 | -0.40% | -0.47% |
| **Test** | 2,013 | 705 | 39.1% | -1.02% ± 0.23 | -1.06% | -1.07% |

Control group (all universe stocks, same day and exit): excess per trade, discovery -0.33% (day-clustered -0.33%); test -0.46% (day-clustered -0.49%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-15 | -18.08% | 51.6% | +16.26% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -39.12% | 76.4% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 722 | 248 | 43.9% | -0.34% ± 0.43 | -0.38% | -0.51% |
| 2022 | 698 | 246 | 43.1% | -0.71% ± 0.37 | -0.70% | -0.84% |
| 2023 | 639 | 241 | 47.7% | -0.16% ± 0.40 | -0.12% | -0.26% |
| 2024 (test) | 704 | 245 | 42.0% | -0.74% ± 0.39 | -0.74% | -0.88% |
| 2025 (test) | 672 | 244 | 38.2% | -1.24% ± 0.39 | -1.33% | -1.39% |
| 2026 (test) | 637 | 216 | 36.7% | -1.10% ± 0.42 | -1.13% | -1.31% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 1,338 | 481 | 44.5% | -0.40% ± 0.29 | -0.36% | -0.48% |
| Discovery, market down | 721 | 254 | 45.4% | -0.42% ± 0.38 | -0.48% | -0.57% |
| Test, market up | 1,160 | 415 | 38.3% | -1.15% ± 0.30 | -1.18% | -1.22% |
| Test, market down | 853 | 290 | 40.2% | -0.85% ± 0.35 | -0.90% | -1.01% |

Research output, not investment advice.
