# Intraday pilot: findings (Dhan 5-minute data)

2026-11-20. Data: [`intraday-pilot.md`](intraday-pilot.md) (50 stocks across top-500 liquidity ranks, 2025-11-21 → 2026-11-20, 11,683 stock-days). Dhan Data APIs plan active until 2026-12-21.

## Verdict: usable for the early-session study

| Check | Result | Reading |
|---|---:|---|
| NSE days with no 5-minute data | 0.4% | Only the first day of the window (fetch began after that day's close) |
| First bar at 09:15 IST | 99.4% | The rest are special sessions (below) |
| 5-minute volume ÷ NSE daily volume (median) | 0.995 | Matches; LICI is the only outlier, explained below |
| First 5-minute open vs NSE open | 0.000% | Exact |
| 5-minute high/low inside the NSE daily range | 98.9% | Consistent |

## Four oddities, explained

1. **F&O stocks have only 72 bars a day from 2026-08-03.** Their last bar starts at 15:10; the 15:15–15:25 bars are missing, while non-F&O stocks keep all 75. Volume is slightly below NSE's (HDFCBANK 0.964), so the last part of the day's volume is not in 5-minute candles. This looks like the closing-auction session for F&O stocks, which would move their final minutes out of continuous trading. That isn't confirmed from an NSE circular yet. **For the study:** exits must happen by 15:10 for every stock (ChatGPT's draft said 15:15), and "same-time" volume baselines are unaffected because they use 09:15–09:45.
2. **Dhan history is adjusted for splits; our NSE daily candles are raw.** LICI split 2:1 on 2026-05-29. Dhan's older bars show doubled volume and halved prices, which gives the 1.94 volume ratio. Recent days match (0.98). **For the study:** compare intraday values only with other intraday values, or adjust the daily candles first.
3. **Weekend special sessions exist in Dhan but not in our daily database:** 2026-02-01 (Budget Sunday) and 2026-11-08 (Diwali Muhurat, 11–14 bars). The NSE backfill (`src/nseHistoricalBackfill.ts`) only looks at weekdays, so these sessions are missing from `DailyCandle`. This is a small gap of 1–3 days a year. **For the study:** exclude special sessions; they aren't normal 09:15 opens.
4. **2026-11-20 has intraday data but no daily candle yet,** because today's NSE file isn't loaded. Not a problem.

## Known limit

Dhan serves history only for stocks listed today, so delisted stocks are missing. Absolute returns will look better than reality. Comparisons with control groups built from the same data stay fair.

## Next

1. Pre-register the early-session study (ChatGPT's design, thresholds frozen, at most 2 variants, exits by 15:10, special sessions excluded, three control groups).
2. Fetch the full history: top-500 point-in-time universe, 2–3 years, about 15–25 million bars. That's roughly 1–2 hours of fetching.
