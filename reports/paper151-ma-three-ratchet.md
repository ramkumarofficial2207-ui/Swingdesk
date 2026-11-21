# 151 Strategies §3.13 Three moving averages — ratcheting-stop swing rule

Generated: 2026-11-21T11:28:11.783Z · evaluation harness v3 · pre-registered

Plan: [`paper151-ratchet-plan.md`](paper151-ratchet-plan.md). Thesis: 3 > 10 > 21-day averages newly lined up; sell when 3 ≤ 10 (max 60).

Trader rules: top 3 candidates per day by score, at most 2 per industry, at most 15 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ 15 per position, capped at 1% of equity at risk when the setup has a stop.

Raw candidates: 30,354; trades taken: 3,045; exits delayed by suspension or a locked price: 1. Studies logged in the trial registry so far: 64 (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 1540 | ✅ |
| Average net return above 0 | -0.28% | ❌ |
| Lower end of 95% range above 0 | -0.54% | ❌ |
| Day-clustered average above 0 | -0.32% | ❌ |
| Still positive without the 5 best signal days | -0.33% | ❌ |
| Positive in at least 2 of 3 test years | 1 of 3 | ❌ |
| Portfolio: net CAGR above 0 | -10.85% | ❌ |
| Portfolio: max drawdown ≤ 20% | 44.5% | ❌ |
| Portfolio: beats NIFTY 50 CAGR or has a lower drawdown | -10.85% vs +6.23%; DD 44.5% vs 15.8% | ❌ |
| Average excess vs control (all universe stocks, same day and exit) above 0 | +0.17% | ✅ |
| Day-clustered excess vs control above 0 | +0.19% | ✅ |

## Trades

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery | 1,505 | 652 | 49.4% | -0.03% ± 0.25 | -0.04% | -0.06% |
| **Test** | 1,540 | 644 | 47.3% | -0.28% ± 0.26 | -0.32% | -0.33% |

Control group (all universe stocks, same day and exit): excess per trade, discovery +0.05% (day-clustered +0.02%); test +0.17% (day-clustered +0.19%).

## Portfolio

| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |
|---|---|---:|---:|---:|---:|
| Discovery | 2021-01-04 → 2024-01-12 | -2.20% | 31.1% | +15.92% | 17.2% |
| **Test** | 2024-01-02 → 2026-11-20 | -10.85% | 44.5% | +6.23% | 15.8% |

## By year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 584 | 229 | 50.2% | -0.05% ± 0.41 | -0.01% | -0.12% |
| 2022 | 505 | 218 | 45.1% | -0.35% ± 0.45 | -0.42% | -0.44% |
| 2023 | 416 | 205 | 53.6% | +0.36% ± 0.47 | +0.32% | +0.27% |
| 2024 (test) | 557 | 224 | 50.3% | +0.16% ± 0.43 | +0.13% | +0.02% |
| 2025 (test) | 490 | 222 | 46.5% | -0.41% ± 0.45 | -0.40% | -0.53% |
| 2026 (test) | 493 | 198 | 44.8% | -0.66% ± 0.45 | -0.75% | -0.81% |

## By market regime (NIFTY 50 vs its 50-day average on the signal day)

| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| Discovery, market up | 924 | 419 | 49.9% | +0.00% ± 0.32 | +0.05% | -0.04% |
| Discovery, market down | 581 | 233 | 48.7% | -0.10% ± 0.42 | -0.21% | -0.19% |
| Test, market up | 847 | 373 | 47.7% | -0.19% ± 0.34 | -0.28% | -0.28% |
| Test, market down | 693 | 271 | 46.9% | -0.40% ± 0.38 | -0.38% | -0.49% |

Research output, not investment advice.
