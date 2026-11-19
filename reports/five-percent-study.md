# 5% move study

Generated: 2026-11-19T21:03:45.414Z

**Question:** after a signal at the close, how often does a stock reach **+5%** before **−2.5%** within **10 sessions**, and which conditions make that more likely?

## Method

- Universe: on each date, the 500 most-traded company shares by 20-session average turnover (ETFs excluded by ISIN). Stocks that later dropped out are included.
- Prices adjusted for splits and bonuses (`loadAdjustedDailySeries`). Features use only data up to the signal date.
- Entry at the next session's open. Target +5%, stop −2.5%, exit at the close of session 10 otherwise.
- A gap through the stop exits at the open. A day touching both levels counts as a stop (daily bars hide the order).
- Costs: 40 bps round trip. 1R = 2.5% of entry. A pure target/stop trader needs to hit the target first on about 39% of trades to break even.
- **Discovery:** 2021-01-05 to 2023-12-29 (conditions chosen here). **Test:** 2024-01-01 to 2026-11-04 (evaluated once).
- Not modelled: results dates (no reliable history), sector strength, intraday order of highs and lows, liquidity limits on position size.

## Baseline: every stock-day in the universe

| Period | Trades | Hit +5% first | Hit stop first | Expired | Avg net R (95% range) |
|---|---:|---:|---:|---:|---:|
| Discovery | 3,46,599 | 31.6% | 61.4% | 7.0% | -0.117R ± 0.005 |
| Test | 3,24,032 | 28.4% | 65.2% | 6.4% | -0.228R ± 0.005 |

## Each condition on its own (all qualifying stock-days)

Overlapping stock-days are counted here, so ranges are narrower than for real, non-overlapping trades. Use this table to see direction, not size.

| Condition | Discovery trades | Discovery hit +5% | Discovery avg R | Test trades | Test hit +5% | Test avg R |
|---|---:|---:|---:|---:|---:|---:|
| Daily range (ATR) below 1.5% | 3,675 | 24.9% | +0.185R | 3,189 | 14.1% | -0.261R |
| Daily range (ATR) 1.5–3.5% | 1,61,451 | 30.3% | -0.084R | 1,61,294 | 25.5% | -0.261R |
| Daily range (ATR) above 3.5% | 1,81,473 | 32.9% | -0.152R | 1,59,549 | 31.7% | -0.195R |
| Trend stack: close > 20 > 50 > 200-day average | 1,19,197 | 31.5% | -0.149R | 86,159 | 28.4% | -0.235R |
| Beat NIFTY over 3 months | 2,05,377 | 32.4% | -0.112R | 1,81,827 | 29.0% | -0.222R |
| Beat NIFTY by 10%+ over 3 months | 1,31,492 | 32.7% | -0.134R | 1,12,642 | 29.9% | -0.218R |
| Tight 15-day base (range < 10%) | 74,509 | 29.2% | -0.048R | 72,422 | 23.5% | -0.261R |
| Within 5% of 52-week high | 61,049 | 31.0% | -0.119R | 51,056 | 27.5% | -0.223R |
| Volume dry-up (10-day < 0.8× 50-day) | 1,22,340 | 32.6% | -0.095R | 1,11,839 | 28.1% | -0.251R |
| 20-day breakout on 1.5× volume | 15,265 | 27.7% | -0.271R | 11,481 | 27.9% | -0.275R |
| Close in top 25% of day range | 63,039 | 30.4% | -0.129R | 68,805 | 28.7% | -0.213R |
| Pullback to 20-day average in uptrend | 38,937 | 32.4% | -0.089R | 30,634 | 28.1% | -0.211R |
| Market green: NIFTY > 50 > 200-day | 1,87,135 | 30.6% | -0.148R | 1,41,663 | 26.5% | -0.272R |
| Breadth above 60% | 2,08,706 | 31.4% | -0.116R | 1,64,842 | 27.3% | -0.262R |
| Extended: up 10%+ in 5 days | 23,347 | 29.6% | -0.253R | 19,965 | 30.2% | -0.236R |

## Combination chosen on discovery data only

Forward selection: add the condition that most improves non-overlapping average net R, keeping at least 300 discovery trades.

| Step | Conditions | Trades | Hit +5% first | Hit stop first | Expired | Avg net R (95% range) |
|---|---|---:|---:|---:|---:|---:|
| 1 | Daily range (ATR) below 1.5% | 640 | 23.4% | 36.1% | 40.5% | +0.136R ± 0.096 |
| 2 | Daily range (ATR) below 1.5% + Breadth above 60% | 551 | 25.2% | 34.3% | 40.5% | +0.202R ± 0.104 |
| 3 | Daily range (ATR) below 1.5% + Breadth above 60% + Tight 15-day base (range < 10%) | 546 | 25.5% | 34.1% | 40.5% | +0.207R ± 0.104 |

## Result on unseen dates (non-overlapping trades)

Setup: **Daily range (ATR) below 1.5% + Breadth above 60% + Tight 15-day base (range < 10%)**

| Period | Trades | Hit +5% first | Hit stop first | Expired | Avg net R (95% range) |
|---|---:|---:|---:|---:|---:|
| Discovery | 546 | 25.5% | 34.1% | 40.5% | +0.207R ± 0.104 |
| **Test** | **359 | 13.4% | 56.5% | 30.1% | -0.380R ± 0.118** |
| Test, excluding trades near unexplained price jumps | 359 | 13.4% | 56.5% | 30.1% | -0.380R ± 0.118 |

**Verdict:** The selected setup did not hold up on unseen dates (net expectancy ≤ 0). Do not trade it.

### By year

| Year | Trades | Hit +5% first | Hit stop first | Expired | Avg net R (95% range) |
|---|---:|---:|---:|---:|---:|
| 2021 | 78 | 24.4% | 39.7% | 35.9% | +0.085R ± 0.280 |
| 2022 | 80 | 15.0% | 50.0% | 35.0% | -0.293R ± 0.250 |
| 2023 | 388 | 27.8% | 29.6% | 42.5% | +0.335R ± 0.122 |
| 2024 (test) | 79 | 16.5% | 51.9% | 31.6% | -0.242R ± 0.270 |
| 2025 (test) | 181 | 13.8% | 51.4% | 34.8% | -0.330R ± 0.169 |
| 2026 (test) | 99 | 10.1% | 69.7% | 20.2% | -0.583R ± 0.204 |

Research output, not investment advice. A positive test result justifies a frozen forward test on new sessions; it does not guarantee future results.
