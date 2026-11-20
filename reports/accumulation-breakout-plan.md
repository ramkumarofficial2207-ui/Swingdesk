# Accumulation then breakout: pre-registration

Committed **before** running. The rules, variants and decision rule below may not be changed after seeing results. Evaluated with harness v3 ([`SETUP_DISCOVERY_ROADMAP.md`](../SETUP_DISCOVERY_ROADMAP.md) Part 3) plus a control group.

## The idea (the user's observation, 2026-11-21)

Stocks that jump 4–7% in a day have often climbed quietly for 20–25 sessions first (+10–15%) while big buyers kept adding. Then volume surges and the stock moves. The aim is to find these stocks **10–15 days before the jump**, keep them on a watchlist, and buy before or at the very start of the surge, not after it.

Three traps this design handles:

1. **Hindsight.** Today's gainers are visible only after the fact. Many stocks climb steadily and never jump. So the first measurement is whether watchlist stocks reach +5% **more often than random stocks** on the same days.
2. **Chasing.** Buying after the 4–6% day was tested before ("20-day breakout on 1.5× volume": −0.27R) and lost. Entries here are before the surge (A) or on its first, small day (B, gain capped at 3%).
3. **Wide stops.** A 1.5× ATR stop gave +5% wins against −5.5% losses. All trades here use a fixed −2.5% stop.

## Data

- Universe: daily top 500 company shares by 20-session turnover (ISIN `INE…`), split/bonus adjusted (same as all studies).
- Delivery %: NSE MTO file, stored in `DailyCandle.deliveryPct` (2020–2026).
- Futures open interest: `FnoDaily.futOi` (all expiries, shares), NSE F&O Bhavcopy 2020-06 → 2026-11, **divided by the same split/bonus factor as volume** so a bonus issue is not read as an OI jump. Only F&O stocks (about 218 of the 500) have it.

All values at day i use data up to the close of day i only.

## Stage 1: watchlist (at the close of day i)

A stock is **on the watchlist** when all of these hold:

| # | Rule | Exact test |
|---|---|---|
| W1 | Climbed over a month | Close is **8% to 15%** above the close 20 sessions earlier |
| W2 | Smoothly, no single big jump | No daily close-to-close gain above **4%** in the last 20 sessions |
| W3 | Calm daily moves | Standard deviation of the last 20 daily returns ≤ **2.5%** |
| W4 | Rising lows | Lowest low of sessions i−9..i is above the lowest low of sessions i−19..i−10 |
| W5 | Holding the trend | Close > 20-day average, 20-day average > its value 5 sessions earlier, close > 50-day average, and at least **15 of the last 20** closes above their own 20-day average |
| W6 | Volume not yet surging | No session in the last 20 had volume above **2.5×** its 50-session average volume |
| W7 | Buyers holding shares | Average delivery % of sessions i−9..i is above the average of sessions i−49..i−10 (needs ≥ 30 delivery values) |
| W8 | Fresh futures positions (F&O stocks only) | Split-adjusted futures OI today is **0% to +40%** above its value 20 sessions earlier. Stocks without F&O data skip W8. |

## Stage 2: entries (from the watchlist)

| Variant | When to buy (signal at the close of day i, entry at the next open) |
|---|---|
| **A: early dip** | On the watchlist **today**, and today is quiet: low ≤ 10-day average + 0.25 × ATR(14), close ≥ 20-day average, day's change between −2% and +1%, volume ≤ its 20-session average. |
| **B: first surge** | On the watchlist on **at least one of the previous 10 sessions** (i−10..i−1), and today: volume ≥ **1.5×** its 20-session average, close in the top 25% of the day's range, day's change between **+0.5% and +3%** (not after a big jump), close above the highest close of the previous 20 sessions. |
| **W: watchlist itself** (measurement only) | Every stock-day on the watchlist, entered at the next open. Answers "do watchlist stocks hit +5% more often than random ones?" Not a tradeable candidate and not part of the verdict. |

**Ranking (several candidates on one day):** A and W by smoothness (20-session return ÷ standard deviation of daily returns); B by today's volume ÷ 20-session average.

## Trade (identical for A, B, W and the control group)

Entry at the next session's open; skipped if that open is more than 3% above the signal close. Target **+5%**, stop **−2.5%**, exit at the close of session **15** (entry day = session 1). A gap through a level exits at the open; a bar touching both levels counts as the stop. 0.4% round-trip costs. Exits only on tradeable bars.

**Trader rules (A and B):** at most 3 new trades per day, at most 2 per industry, at most 8 open positions, no re-entry while held. Portfolio: each position min(equity ÷ 8, 1% of equity at risk ÷ 2.5%).

**W** uses the same exit with no per-day or position limits (one open trade per stock), so it measures the watchlist rather than a portfolio.

## Control group (the "random stocks" comparison)

Every universe stock on the same signal day, entered at the next open with the same exit and gap rule. **Excess** = trade net return − that day's control average. W's excess answers the hindsight question directly.

## Periods

Discovery: signals 2021-01-05 → 2023-12-29. Test: signals 2024-01-01 → latest complete exit. Evaluated **once**.

## Primary candidate and decision rule

**Primary** = A or B, whichever has the better **discovery day-clustered** average net return. Only the primary's test result decides.

**Pass** only if all hold on the test period:

1. ≥ 100 trades. 2. Average net > 0. 3. Lower end of its 95% range > 0. 4. Day-clustered average > 0. 5. Still > 0 without the 5 best signal days. 6. Positive in ≥ 2 of 3 test years. 7. Portfolio net CAGR > 0. 8. Portfolio max drawdown ≤ 20%. 9. Portfolio beats NIFTY 50 CAGR or has a lower drawdown. 10. Average excess vs the control group > 0. 11. Day-clustered excess vs the control group > 0.

Also reported (not pass rules): hit rate of +5%, average winner and loser, average sessions held, watchlist size per day, W's hit rate vs the control's.

## What happens next

- **Pass:** add the primary as strategy `ACCUMULATION_BREAKOUT` to Auto Paper with exactly these rules, and show the evening watchlist in the Auto Paper tab. Live paper trades then decide (30 closed trades, ≥ 40% hitting +5%, average > 0).
- **Fail:** do not trade it and do not re-tune on the test period. Report it plainly, including whether the watchlist itself (W) beat random stocks. A watchlist that beats random while A/B fail means the entry timing is the problem, not the stock selection.

## Not modelled

Intraday timing of entry B (5-minute data exists and could refine it later, as a separate pre-registered study), results dates, liquidity limits on position size, Muhurat/Budget special sessions.
