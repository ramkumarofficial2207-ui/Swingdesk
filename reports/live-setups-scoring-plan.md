# Live setups (Aug–Oct 2026): scoring rules

Written and committed **before** any outcome was looked at. Source: the Railway production database backup taken on 2026-11-19 (`HistoricalSetup`, 354 setups the scanner recorded live between 2026-08-03 and 2026-10-16; the app went offline before checking most of them). Prices: the local split/bonus-adjusted daily candles.

Because these setups were saved at the time, they cannot contain look-ahead. This is a small live sample (about 2.5 months, one market period): it can show that the scanner's picks did **not** work, but cannot prove that they do.

## Timing

`createdAt` is stored in UTC. A setup can only be acted on at the first session **open after it was created**: created before 09:15 IST on day D → first possible fill is D's open; otherwise the next session's open.

## Two scorings

| ID | Rule |
|---|---|
| **L1 Buy at the next open** | Fill at the first possible open; sell at the close of the 5th session. Same as the nightly forward check. |
| **L2 The app's own plan, without look-ahead** | Wait up to 5 sessions from the first possible session for a **close at or above the setup's entry price** on volume ≥ 1.5× its 20-day average (both known at the close). Fill at the next open. Stop and target are the setup's own levels; a fill already at or below the stop, or at or above the target, is skipped. Hold up to 10 sessions; gaps through a level exit at the open; a bar touching both counts as the stop. |

Both: 0.4% round-trip costs; one position per stock at a time (a repeat setup on a stock that is still held is skipped); exits only on tradeable bars (harness v3 `simulateTrade`).

## Comparison

**Control:** for each fill date, the average of all top-500 universe stocks bought at that open and held 5 sessions (L1's hold). **Excess** = trade − control on its fill date.

Reported: trades, win rate, average net (95% range), per-day average, excess vs control, and per setup type (types with ≥ 10 trades only).

## Reading the result

- If L1 or L2 is clearly **negative or below the control**, that confirms the historical finding: the scanner's setups have no edge.
- If they are **positive and above the control**, that is a hint only, to be checked by the nightly forward paper record, not a reason to trade.
