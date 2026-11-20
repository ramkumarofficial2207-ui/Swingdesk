# Auto paper trading

Updated: 2026-11-20T18:08:40.694Z · latest signal session 2026-11-19 · paper only, no orders are placed.

Rules for every strategy: top 3 picks per day, buy at the next open (skipped if it opens > 3% above the signal close), target +5%, stop −2.5%, exit at the close of session 15. 0.4% costs. With these levels a strategy needs about 40% of trades hitting the target to make money. Verdict after 30 closed trades.

## Scorecard

| Strategy | Closed | Hit +5% | Stopped | Time exit | Hit rate | Avg net per trade | Avg days held | Open | Waiting to enter | Skipped (gap) | Verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| TREND_PULLBACK | 0 | 0 | 0 | 0 | — | — | — | 0 | 0 | 0 | Collecting (0/30 closed) |
| SECTOR_MOMENTUM | 0 | 0 | 0 | 0 | — | — | — | 0 | 3 | 0 | Collecting (0/30 closed) |
| DELIVERY_OI | 0 | 0 | 0 | 0 | — | — | — | 0 | 1 | 0 | Collecting (0/30 closed) |

- **TREND_PULLBACK**: Top 10% 6-month strength, uptrend, 3–8% pullback to the 20-day average, NIFTY trending up
- **SECTOR_MOMENTUM**: Industry with ≥ 4 stocks in the day’s top 30 gainers; its most-traded names above the 50-day average
- **DELIVERY_OI**: Up ≥ 1% with delivery % ≥ 1.5× its 20-day average and futures OI up ≥ 3% (long build-up), above the 50-day average

## Picks from 2026-11-19

| Strategy | Stock | Why |
|---|---|---|
| SECTOR_MOMENTUM | M&M | Automobile and Auto Components: 11 stocks in today’s top 30 gainers; M&M +4.5% today |
| SECTOR_MOMENTUM | KALYANKJIL | Consumer Durables: 6 stocks in today’s top 30 gainers; KALYANKJIL +1.7% today |
| SECTOR_MOMENTUM | MARUTI | Automobile and Auto Components: 11 stocks in today’s top 30 gainers; MARUTI +7.6% today |
| DELIVERY_OI | DELHIVERY | +1.6% today, delivery 76% (1.6× normal), futures OI +6.0% |

## All paper trades

| Signal | Strategy | Stock | State | Entry | Exit | Net | Days |
|---|---|---|---|---:|---:|---:|---:|
| 2026-11-19 | DELIVERY_OI | DELHIVERY | PENDING | — | — | — | — |
| 2026-11-19 | SECTOR_MOMENTUM | M&M | PENDING | — | — | — | — |
| 2026-11-19 | SECTOR_MOMENTUM | KALYANKJIL | PENDING | — | — | — | — |
| 2026-11-19 | SECTOR_MOMENTUM | MARUTI | PENDING | — | — | — | — |

Paper results, not investment advice.
