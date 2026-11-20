# Auto paper trading

Updated: 2026-11-20T18:28:04.834Z · latest signal session 2026-11-20 · paper only, no orders are placed.

Rules for every strategy: top 3 picks per day, buy at the next open (skipped if it opens > 3% above the signal close), target +5%, stop −2.5%, exit at the close of session 15. 0.4% costs. With these levels a strategy needs about 40% of trades hitting the target to make money. Verdict after 30 closed trades.

## Scorecard

| Strategy | Closed | Hit +5% | Stopped | Time exit | Hit rate | Avg net per trade | Avg days held | Open | Waiting to enter | Skipped (gap) | Verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| TREND_PULLBACK | 0 | 0 | 0 | 0 | — | — | — | 0 | 3 | 0 | Collecting (0/30 closed) |
| SECTOR_MOMENTUM | 1 | 0 | 1 | 0 | 0.0% | -2.90% | 1.0 | 2 | 3 | 0 | Collecting (1/30 closed) |
| DELIVERY_OI | 0 | 0 | 0 | 0 | — | — | — | 1 | 0 | 0 | Collecting (0/30 closed) |
| STRENGTH_PLUS_BUYING | 0 | 0 | 0 | 0 | — | — | — | 0 | 0 | 0 | Collecting (0/30 closed) |

- **TREND_PULLBACK**: Top 10% 6-month strength, uptrend, 3–8% pullback to the 20-day average, NIFTY trending up
- **SECTOR_MOMENTUM**: Industry with ≥ 4 stocks in the day’s top 30 gainers; its most-traded names above the 50-day average
- **DELIVERY_OI**: Up ≥ 1% with delivery % ≥ 1.5× its 20-day average and futures OI up ≥ 3% (long build-up), above the 50-day average
- **STRENGTH_PLUS_BUYING**: Top 20% 6-month strength in an uptrend, bouncing ≥ 1% today with delivery ≥ 1.3× normal and futures OI up ≥ 2%

## Picks from 2026-11-20

| Strategy | Stock | Why |
|---|---|---|
| TREND_PULLBACK | LAURUSLABS | 6-month +89.3%, ATR 3.7%, pulled back to the 20-day average |
| TREND_PULLBACK | SOUTHBANK | 6-month +60.8%, ATR 3.2%, pulled back to the 20-day average |
| TREND_PULLBACK | NAZARA | 6-month +59.4%, ATR 3.2%, pulled back to the 20-day average |
| SECTOR_MOMENTUM | HDFCBANK | Financial Services: 7 stocks in today’s top 30 gainers; HDFCBANK +2.9% today |
| SECTOR_MOMENTUM | ICICIBANK | Financial Services: 7 stocks in today’s top 30 gainers; ICICIBANK +1.9% today |
| SECTOR_MOMENTUM | SBIN | Financial Services: 7 stocks in today’s top 30 gainers; SBIN +0.8% today |

## All paper trades

| Signal | Strategy | Stock | State | Entry | Exit | Net | Days |
|---|---|---|---|---:|---:|---:|---:|
| 2026-11-20 | SECTOR_MOMENTUM | HDFCBANK | PENDING | — | — | — | — |
| 2026-11-20 | SECTOR_MOMENTUM | ICICIBANK | PENDING | — | — | — | — |
| 2026-11-20 | SECTOR_MOMENTUM | SBIN | PENDING | — | — | — | — |
| 2026-11-20 | TREND_PULLBACK | LAURUSLABS | PENDING | — | — | — | — |
| 2026-11-20 | TREND_PULLBACK | SOUTHBANK | PENDING | — | — | — | — |
| 2026-11-20 | TREND_PULLBACK | NAZARA | PENDING | — | — | — | — |
| 2026-11-19 | DELIVERY_OI | DELHIVERY | OPEN | 455.95 | — | — | 1 |
| 2026-11-19 | SECTOR_MOMENTUM | M&M | OPEN | 3487.90 | — | — | 1 |
| 2026-11-19 | SECTOR_MOMENTUM | KALYANKJIL | STOP | 648.90 | 632.68 | -2.90% | 1 |
| 2026-11-19 | SECTOR_MOMENTUM | MARUTI | OPEN | 13579.00 | — | — | 1 |

Paper results, not investment advice.
