# Uptrend dip (short-term reversal) study: pre-registration

Committed **before** running. The rules, variants and decision rule below may not be changed after seeing results.

## Where the idea came from

[`next-day-clues-discovery.md`](next-day-clues-discovery.md) scanned 16 clues and 9 combinations known at the close, on the **discovery period only** (2021-01-05 → 2023-12-29). Clues such as volume spikes, big up days and results dates make a stock 2–4× more likely to be a next-day top gainer, but they predict *size*, not *direction*: buying them at the next open loses after costs. The one clearly positive pattern was a sharp short dip in a stock still above its 50-day average: +0.68% ± 0.24 net over 5 sessions, and +5% reached before −2.5% in 32.8% of cases vs 24.4% for all stocks.

It was chosen from about 25 looks, so the discovery number is optimistic. Only the untouched 2024–26 test period decides. Short-term reversal is a documented effect in equities, but this rule is close to the momentum-pullback rule that failed in [#31](momentum-pullback.md). The difference: this buys on the down day itself, not after a recovery day.

## Signal (all at the close of day i)

1. **Down day:** close ≤ 97% of the previous close (down ≥ 3%).
2. **Short dip:** close ≤ 95% of the close 5 sessions earlier (down ≥ 5% over 5 sessions).
3. **Still in an uptrend:** close > 50-day simple average of closes.
4. In the point-in-time universe on day i: daily top 500 company shares by 20-session turnover (ISIN `INE…`), split/bonus adjusted (same as all studies).

No other filters. No gap filter (a gap down at the open is accepted).

## Trade

Entry at the **open of day i+1**. Costs 0.4% round trip. One trade per stock at a time (later signals in the same stock are skipped until the open trade exits).

## Variants (exactly two)

| ID | Exit |
|---|---|
| U1 | Time exit at the close of the 5th session (entry day = session 1). No stop. |
| U2 | Stop 1.5 × ATR(14, at day i) below entry; target 2 × the stop distance; time exit at the close of session 10. Conservative ordering: a gap through the stop exits at the open; a bar touching both levels counts as the stop. |

Result per trade = net % return (exit / entry − 1 − 0.4%). The **primary** variant is the one with the better discovery average net return. Only the primary's test result decides the verdict; the other is reported for transparency.

## Periods

Discovery: signals 2021-01-05 → 2023-12-29. Test: signals from 2024-01-01 to the latest date with a complete exit.

## Decision rule (test period, primary)

**Pass** only if all of these hold:

1. ≥ 100 test trades.
2. Average net return per trade > 0.
3. Lower end of its 95% range > 0.
4. **Day-clustered average > 0:** average the trades opened on each signal date, then average those daily figures (dips cluster on market selloff days, so trades are not independent; this checks the edge is not one or two crash-and-rebound days).
5. Positive average in at least 2 of the 3 test years (2024, 2025, 2026).

**Pass** → add "Uptrend Dip" as a scanner setup type, **On trial** for live paper tracking (not real money until it earns Trusted). **Fail** → do not trade it and do not re-tune these rules on the test period.
