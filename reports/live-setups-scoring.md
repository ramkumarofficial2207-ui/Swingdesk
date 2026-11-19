# Live setups (Aug–Oct 2026): scored

Generated: 2026-11-19T16:11:10.624Z · rules: [`live-setups-scoring-plan.md`](live-setups-scoring-plan.md) (committed before scoring) · source: Railway production backup.

Setups recorded live: 354 (2026-08-03 → 2026-10-16). No local prices: 0. L2: never triggered 299, skipped because the fill was past the stop or target 3. One position per stock at a time.

Control (average top-500 stock bought at the same opens, held 5 sessions): -1.28% per fill day.

## Overall

| Group | Trades | Fill days | Win rate | Avg net (95% range) | Per-day avg | Excess vs control |
|---|---:|---:|---:|---:|---:|---:|
| **L1** Buy at the next open, hold 5 sessions | 301 | 52 | 32.2% | -1.53% ± 0.77 | -1.99% | -0.47% |
| **L2** App's plan: close-confirmed trigger, own stop/target, ≤ 10 sessions | 46 | 29 | 28.3% | -5.22% ± 2.29 | -5.33% | -3.59% |

L2 exits: target 8, stop 14, time 24.

## L1 by setup type (≥ 10 trades)

| Group | Trades | Fill days | Win rate | Avg net (95% range) | Per-day avg | Excess vs control |
|---|---:|---:|---:|---:|---:|---:|
| Pre-Surge Hybrid Base 🌱 | 93 | 39 | 32.3% | -0.97% ± 1.22 | -1.83% | -0.14% |
| Pullback Continuation | 86 | 40 | 36.0% | -1.18% ± 1.68 | -0.25% | -0.15% |
| Leader Pullback Reclaim | 40 | 24 | 37.5% | -1.39% ± 2.19 | -1.25% | -0.23% |
| EMA50 Pullback | 20 | 16 | 15.0% | -2.28% ± 2.91 | -2.38% | -0.69% |
| EMA20 Pullback | 15 | 12 | 13.3% | -4.87% ± 2.88 | -5.00% | -3.91% |
| Second-Entry Retest | 13 | 11 | 15.4% | -4.13% ± 3.58 | -4.08% | -2.91% |

## L2 by setup type (≥ 10 trades)

| Group | Trades | Fill days | Win rate | Avg net (95% range) | Per-day avg | Excess vs control |
|---|---:|---:|---:|---:|---:|---:|
| Pre-Surge Hybrid Base 🌱 | 14 | 11 | 7.1% | -8.50% ± 3.31 | -8.76% | -7.14% |
| Pullback Continuation | 13 | 12 | 46.2% | -2.18% ± 4.20 | -2.40% | -0.35% |
| Leader Pullback Reclaim | 10 | 7 | 30.0% | -7.55% ± 4.59 | -9.07% | -5.25% |

## Notes

- **The market fell during these weeks:** the average top-500 stock lost 1.28% per 5-session hold on the same days. That explains part of the losses, but the picks still did **worse** than that average (L1 −0.47%, L2 −3.59% per trade).
- **Split/bonus check:** the app stored entry, stop and target in prices of the day, while the local candles are adjusted for later splits and bonuses. Only 1 of 354 setups (BLSE) had a corporate action after it was recorded, so the result does not change. L1 does not use the app's levels at all.
- **Consistent with the backtests:** the setup types tested on 2024–26 history were all "research only", and the picks the app made live lost money too.

A small live sample from one 2.5-month period: it can show the picks did not work, not prove that they do. Research output, not investment advice.
