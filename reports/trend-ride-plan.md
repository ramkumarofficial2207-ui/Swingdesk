# Trend ride study: pre-registration

Committed **before** running. The rules, variants and decision rule below may not be changed after seeing results. Evaluated with harness v3 ([`SETUP_DISCOVERY_ROADMAP.md`](../SETUP_DISCOVERY_ROADMAP.md) Part 3), extended with a buy-stop entry, a trailing exit and a partial exit.

## Why this study

Every earlier study asked for a **fixed target within 5–15 sessions** (5% study, volatility exits, momentum pullback, post-results drift, uptrend dip). All failed on the test period. The [Codex 5% re-run](backtests/codex-five-pct-2026-11-20/) showed the same problem: the selected setup hit +5% first on 13% of test trades, and its discovery pick (daily range < 1.5%) chose stocks too slow to move 5%.

This study changes the **shape of the trade**, not the indicators. It holds for weeks instead of days, has no fixed target, and lets winners run. Momentum in stock returns is documented over 3–12 months, not 10 days.

## Setup card

| Field | Rule |
|---|---|
| **Universe** | Daily top 500 company shares by 20-session turnover (ISIN `INE…`), split/bonus adjusted (same as all studies). |
| **Strength rank** | 126-session return ending 5 sessions before the signal day. On each day, rank every universe stock that has this value; a candidate must be in the **top 10%**. |
| **Trend** | Close > 50-day average > 200-day average. |
| **Volatility** | ATR(14) between **2% and 4%** of the close. |
| **Pullback** | Highest close of the previous 10 sessions is **3% to 8%** above today's close, and today's low is at or within **1 × ATR** above the 20-day average. |
| **Market** | NIFTY 50 close above its 50-day average **and** that average higher than it was 10 sessions earlier. |
| **Ranking** | Strength (126-session return), highest first. |
| **Entry** | Buy-stop at the signal day's **high**, valid for the next session only. If the next open is at or above it, fill at the open; if the high reaches it, fill at the trigger; otherwise no trade. Skip if the next open is more than 3% above the signal close. An unfilled order still uses one of that day's slots (no picking the orders that filled). |
| **Stop** | 1.5 × ATR(14) of the signal day, below the entry price. |
| **Trailing exit** | After any session's close **below its 20-day average**, sell at the next tradeable open. |
| **Time exit** | Close of session 40 (entry day = session 1), about 8 weeks. |
| **No fixed target.** | |
| **Trader rules** | At most **3 new trades per day**, at most 2 per industry, at most **8 open positions**, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars. Portfolio: each position sized at min(equity ÷ 8, 1% of equity at risk ÷ stop distance). |

Conservative ordering (unchanged): a gap through the stop exits at the open; a bar touching the stop and a profit level counts as the stop; the entry bar can stop out.

## Variants (exactly two)

| ID | Exit |
|---|---|
| T1 | Stop, trailing exit, time exit (as above). |
| T2 | As T1, plus: sell **half** at entry + 2 × stop distance (+2R). From the next session the stop on the other half moves to the entry price. |

T2's sale of the first half is booked when the whole trade closes (a small timing simplification in the portfolio test). Costs stay 0.4% round trip per trade.

**Primary** = the variant with the better **discovery day-clustered** average net return. Only the primary's test result decides.

## Periods

Discovery: signals 2021-01-05 → 2023-12-29. Test: signals 2024-01-01 → latest complete exit.

## Decision rule (test period, primary)

**Pass** only if **all** harness v3 checks pass:

1. ≥ 100 trades. 2. Average net > 0. 3. Lower end of its 95% range > 0. 4. Day-clustered average > 0. 5. Still > 0 without the 5 best signal days. 6. Positive in ≥ 2 of 3 test years. 7. Portfolio net CAGR > 0. 8. Portfolio max drawdown ≤ 20%. 9. Portfolio beats NIFTY 50 CAGR or has a lower drawdown.

Also reported (not pass rules): average winner, average loser, average sessions held, exit-type split.

**Pass** → "Trend Ride" becomes a scanner setup type, **On trial** for live paper tracking (≥ 30 signal days before Trusted). **Fail** → do not trade it and do not re-tune on the test period.

## Not modelled

Results dates, intraday order of highs and lows, position-size limits from liquidity. Volume on the pullback is not used (volume dry-up alone was negative in the 5% study).
