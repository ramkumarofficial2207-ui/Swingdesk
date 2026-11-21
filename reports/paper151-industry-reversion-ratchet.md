# 151 Strategies §3.9 Industry-neutral mean-reversion — ratcheting-stop swing rule

Generated: 2026-11-21T11:28:02.209Z · evaluation harness v3 · pre-registered

Plan: [`paper151-ratchet-plan.md`](paper151-ratchet-plan.md). Thesis: Bottom 10% by 5-session return minus own industry average; hold 5 sessions.

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 47,630; trades taken: 3,659; exits delayed by suspension or a locked price: 9. Studies logged in the trial registry so far: 60 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1788 | ✅ |
| Average net return above 0 | -0.50% | ❌ |
| Lower end of 95% range above 0 | -0.75% | ❌ |
| Day-clustered average above 0 | -0.55% | ❌ |
| Still positive without the 5 best signal days | -0.56% | ❌ |
| Positive in at least 2 of 3 test years | 1 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -20.40% | ❌ |
| Portfolio: max drawdown ≤ 20% | 57.5% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -20.40% vs +6.23%; DD 57.5% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks with an industry label, same day and exit) above 0 | -0.10% | ❌ |
| Day-clustered excess vs control above 0 | -0.08% | ❌ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,871 | 711 | 49.5% | -0.01% ± 0.25 | +0.02% | -0.06% |
| **Test** | 1,788 | 686 | 44.0% | -0.50% ± 0.25 | -0.55% | -0.56% |

Control group (all universe stocks with an industry label, same day and exit): excess per trade, discovery -0.02% (day-clustered -0.03%); test -0.10% (day-clustered -0.08%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-16 | -1.67% | 42.6% | +16.12% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -20.40% | 57.5% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 653 | 241 | 53.0% | +0.41% ± 0.41 | +0.47% | +0.28% |
| 2022 | 657 | 241 | 42.0% | -0.74% ± 0.41 | -0.74% | -0.88% |
| 2023 | 561 | 229 | 54.4% | +0.36% ± 0.48 | +0.33% | +0.19% |
| 2024 (test) | 619 | 236 | 48.3% | +0.00% ± 0.43 | -0.16% | -0.12% |
| 2025 (test) | 612 | 237 | 41.8% | -0.78% ± 0.43 | -0.67% | -0.93% |
| 2026 (test) | 557 | 213 | 41.5% | -0.76% ± 0.44 | -0.87% | -0.95% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 1,154 | 461 | 50.5% | +0.08% ± 0.30 | +0.13% | +0.01% |
| Discovery, market down | 717 | 250 | 48.0% | -0.15% ± 0.43 | -0.20% | -0.32% |
| Test, market up | 984 | 402 | 44.0% | -0.53% ± 0.33 | -0.62% | -0.59% |
| Test, market down | 804 | 284 | 43.9% | -0.47% ± 0.38 | -0.46% | -0.64% |

Research output, not investment advice.
