# Sector momentum study: pre-registration (Phase 1)

Committed **before** running. The rules, variants and decision rule below may not be changed after seeing results. Evaluated with harness v3 ([`SETUP_DISCOVERY_ROADMAP.md`](../SETUP_DISCOVERY_ROADMAP.md) Part 3).

## Setup card

| Field | Rule |
|---|---|
| **Thesis** | When many stocks in one industry rise together, a common cause is usually behind it (commodity prices, policy, fund rotation; e.g. copper → appliance makers on 2026-11-19). Funds rotate into a sector over days, not minutes, so the sector keeps drifting. Industry momentum is documented in equities. We bet on the **sector**, so we buy its most liquid names, not the single biggest mover. |
| **Evidence so far** | Exploration on 2021–23 only ([`next-day-clues-discovery.md`](next-day-clues-discovery.md)): stocks in an industry with ≥ 4 members in the day's top 30 gainers made **+0.20% ± 0.07** net over 5 sessions (all stocks: −0.10%). One of ~25 looks, so optimistic. |
| **Universe** | Daily top 500 company shares by 20-session turnover (ISIN `INE…`), split/bonus adjusted. |
| **Industry** | NSE industry from the current Nifty 500 list. Stocks without a label are ranked for the top 30 but are never counted toward a sector and never traded. |
| **Hot sector (day i, at the close)** | Rank all universe stocks by today's close-to-close return. An industry is **hot** if ≥ 4 of its stocks are in the top 30. |
| **Candidates** | Every labelled universe stock in a hot industry on day i (whether or not it rose today). |
| **Ranking** | 20-session average turnover (close × volume), highest first. |
| **Entry** | Next session's open. Skip if that open is more than 3% above day i's close (no chasing). |
| **Exit** | Close of the 5th session (entry day = session 1). No stop, no target. |
| **Trader rules (harness defaults)** | Top 5 candidates per day, at most 2 per industry, at most 5 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars, equity ÷ 5 per position. |

## Variants (exactly two)

| ID | Market filter |
|---|---|
| S1 | None |
| S2 | NIFTY 50 close above its 50-day average on day i |

**Primary** = the variant with the better **discovery day-clustered** average net return. Only the primary's test result decides.

## Control group (for the industry-label bias)

Labels come from today's Nifty 500 list, which favours stocks that later did well. To cancel that, every trade is compared with the **control group**: all labelled universe stocks on the same signal day, entered at the next open with the same exit and gap rule. **Excess** = trade net return − that day's control average.

## Periods

Discovery: signals 2021-01-05 → 2023-12-29. Test: signals 2024-01-01 → latest complete exit.

## Decision rule (test period, primary)

**Pass** only if **all** harness v3 checks pass:

1. ≥ 100 trades. 2. Average net > 0. 3. Lower end of its 95% range > 0. 4. Day-clustered average > 0. 5. Still > 0 without the 5 best signal days. 6. Positive in ≥ 2 of 3 test years. 7. Portfolio net CAGR > 0. 8. Portfolio max drawdown ≤ 20%. 9. Portfolio beats NIFTY 50 CAGR or has a lower drawdown.

**and** both control checks:

10. Average excess vs the control group > 0.
11. Day-clustered excess vs the control group > 0.

**Pass** → "Sector Momentum" becomes a scanner setup type, **On trial** for live paper tracking (≥ 30 signal days before Trusted). **Fail** → no re-tuning on the test period; move to Phase 2 (global and commodity cues), which tests the *cause* of sector moves directly.
