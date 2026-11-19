# Uptrend dip study

Generated: 2026-11-19T13:54:06.082Z

Pre-registered plan: [`uptrend-dip-plan.md`](uptrend-dip-plan.md) (committed before this run). Signal at the close: down ≥ 3% today, down ≥ 5% over 5 sessions, close above the 50-day average. Entry at the next open; 0.4% round-trip costs; one trade per stock at a time.

Signals in the universe (discovery + test): 7,824.

## Verdict: **FAIL**

Primary variant (better discovery average): **U1 — Hold 5 sessions, no stop**.

| Pre-registered rule | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 2,874 | ✅ |
| Average net return above 0 | +0.53% | ✅ |
| Lower end of 95% range above 0 | +0.25% | ✅ |
| Day-clustered average above 0 | -0.58% | ❌ |
| Positive in at least 2 of 3 test years | 3 of 3 | ✅ |

Per plan: do not trade it and do not re-tune these rules on the test period.

## Both variants

| Variant | Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered avg |
|---|---|---:|---:|---:|---:|---:|
| U1: Hold 5 sessions, no stop | Discovery | 3,153 | 548 | 48.9% | +0.54% ± 0.26 | +0.38% |
| | **Test** | **2,874 | 520 | 51.8% | +0.53% ± 0.28 | -0.58%** |
| U2: 1.5 × ATR stop, 2 × stop target, 10 sessions | Discovery | 3,041 | 545 | 47.7% | +0.52% ± 0.33 | +0.27% |
| | **Test** | **2,763 | 509 | 46.1% | +0.15% ± 0.36 | -1.32%** |

U2 test exits: target first 405, stop first 969, time exit 1389.
U1 worst single test trade: -58.96%.
U2 worst single test trade: -94.94%.

## U1 by year

| Year | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered avg |
|---|---:|---:|---:|---:|---:|
| 2021 | 1,318 | 193 | 46.9% | +0.49% ± 0.38 | +0.55% |
| 2022 | 1,070 | 177 | 44.2% | -0.15% ± 0.50 | +0.15% |
| 2023 | 765 | 178 | 59.1% | +1.59% ± 0.43 | +0.43% |
| 2024 (test) | 1,306 | 182 | 54.6% | +0.80% ± 0.45 | -0.87% |
| 2025 (test) | 715 | 166 | 49.4% | +0.30% ± 0.56 | -0.68% |
| 2026 (test) | 853 | 172 | 49.7% | +0.32% ± 0.47 | -0.17% |

## What the failure means (notes added after the run; they do not change the verdict)

- **The pooled gain comes from a few market-wide selloffs.** The busiest test signal days were 2024-02-12 (95 signals, +8.6% average), 2024-06-04 (election-result crash; 59 signals, +11.1%), 2024-01-23 (60, +3.8%) and 2024-08-05 (86, +1.5%). Days with 3 or fewer signals (292 days) averaged −0.85%. Buying a lone dip on an ordinary day loses money. Buying everything on a crash day worked in 2024, but that is a bet on the market rebounding, not a stock setup, and a handful of days is too few to trust.
- **Worst trades were untradeable, not bad data:** a stock suspended for about three months mid-trade (KERNEX, Dec 2024 → Mar 2025) and one locked at its lower price limit for days (RMDRIP, Feb–Mar 2026). Sensitivity check: leaving out the 60 test signals held through a gap of more than 12 calendar days, the day-clustered average is still −0.35% (median day −0.49%, 45% of signal days positive; computed without the one-trade-per-stock rule).
- The day-clustered rule was pre-registered for exactly this case. Without it, this study would have "passed" on a few correlated crash days.

Research output, not investment advice.
