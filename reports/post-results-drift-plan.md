# Post-results drift study: pre-registration

Committed **before** running. The rules, variants and decision rule below may not be changed after seeing results.

## Idea

After a company reports results that the market likes, its price tends to keep drifting in the same direction for weeks (post-earnings-announcement drift, one of the most replicated effects in finance). We have no earnings-surprise data, so the market's own reaction is the signal: a strong, high-volume rise around the results meeting that holds into the close.

## Data

Results dates: NSE board-meeting history (`ResultsEvent`, purpose contains "Financial Results"), 2020–2026. NSE does not say whether results were released during market hours or after the close, so the rules use a two-session window that covers both, and act only after it is complete.

## Timing (no look-ahead)

- **E** = the meeting date, or the next trading session if the meeting fell on a non-trading day.
- **Reaction window** = close of the session before E → close of E+1.
- **Signal** at the close of E+1 (everything is known then). **Entry** at the open of E+2.

## Signal (all required)

1. **Strong reaction:** stock return over the window minus NIFTY 50's return over the same window ≥ **+5%**.
2. **Volume:** the higher of the volumes on E and E+1 ≥ **2×** the average of the 20 sessions before E.
3. **Held into the close:** the close of E+1 is in the upper half of that session's range.
4. **Volatility range:** ATR(14) at E+1 between **1% and 6%** of price.
5. **No chasing:** skip if the E+2 open is more than **3%** above the E+1 close.

## Trade

Entry: open of E+2. Stop: 1.5 × ATR(14) below entry. Target: 2 × the stop distance. Time exit at the close of the last session. Conservative ordering (a gap through the stop exits at the open; a bar touching both levels is a stop). Costs 40 bps round trip.

## Variants (exactly two)

| ID | Extra rule | Max sessions |
|---|---|---:|
| D1 | none | 15 |
| D2 | before the event (close of the session before E) the stock was above its 50-day average | 15 |

Primary = the variant with the better discovery average net R. Only the primary's test result decides the verdict.

## Universe and periods

Daily top 500 company shares by 20-session turnover on the signal date (ISIN `INE…`), split/bonus adjusted. **Discovery:** signals dated 2021-01-05 to 2023-12-29 (strictly; earlier signals are excluded). **Test:** signals from 2024-01-01. One trade per results event; trades are also non-overlapping per stock.

## Decision rule (test period, primary)

**Pass** only if all hold: ≥ 100 test trades; average net R > 0; lower end of its 95% range > 0; positive in at least 2 of the 3 test years (2024, 2025, 2026).

**Pass** → add "Post-Results Drift" as a scanner setup type, **On trial** for live paper tracking. **Fail** → do not trade it and do not re-tune these rules on the test period.
