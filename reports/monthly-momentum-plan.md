# Monthly momentum study: pre-registration (final test)

Committed **before** running. The rules, variants and decision rule below may not be changed after seeing results. Evaluated with harness v3 ([`SETUP_DISCOVERY_ROADMAP.md`](../SETUP_DISCOVERY_ROADMAP.md) Part 3). Agreed in advance: **if this fails, prediction work stops** and SwingDesk becomes a discipline and journaling tool.

## Setup card

| Field | Rule |
|---|---|
| **Thesis** | Stocks that rose most over the past year, excluding the latest month, tend to keep beating other stocks for the next few months (cross-sectional momentum, documented over decades and markets, including India; NSE runs momentum indices on it). The edge is slow and works as a **portfolio**, so this is a monthly-rebalanced basket, not a short swing. |
| **Universe** | Daily top 500 company shares by 20-session turnover (ISIN `INE…`), split/bonus adjusted, on the rebalance day. |
| **Rebalance day** | The last session of each calendar month (the stock's own next session falls in a new month). |
| **Score (at the rebalance close)** | 12-1 momentum, risk-adjusted: (close 21 sessions ago ÷ close 252 sessions ago − 1) ÷ standard deviation of the daily returns over the 252 sessions before the rebalance day. Needs 253 sessions of history. |
| **Picks** | The **15 highest scores**, at most **4 per industry** (stocks without a label count as their own industry). |
| **Entry** | Next session's open. Skip if that open is more than 3% above the rebalance close. |
| **Exit** | Close of the next rebalance day (about one month). No stop, no target. Every position is closed and re-bought each month, so costs (0.4% round trip) are charged on **every** holding every month. This overstates costs for stocks that stay in the basket. |
| **Trader rules** | Top 15 per rebalance, at most 4 per industry, at most 15 open positions, no re-entry while held, exits only on tradeable bars, equity ÷ 15 per position. |

## Variants (exactly two)

| ID | Market filter |
|---|---|
| M1 | None (always invested) |
| M2 | Buy only if NIFTY 50 closes above its **200-day** average on the rebalance day; otherwise hold cash that month |

**Primary** = the variant with the better **discovery day-clustered** average net return (each rebalance month counts once). Only the primary's test result decides.

## Control group

All universe stocks on the same rebalance day, entered at the next open with the same exit and gap rule (an equal-weight "buy everything" basket).

## Periods

Discovery: rebalance days 2021-01-05 → 2023-12-29. Test: rebalance days 2024-01-01 → latest month with a complete exit.

## Decision rule (test period, primary)

**Pass** only if all 11 checks pass: the 9 harness v3 checks (≥ 100 trades; average net > 0; lower end of its 95% range > 0; day-clustered (per month) > 0; > 0 without the 5 best rebalance months; positive in ≥ 2 of 3 test years; portfolio net CAGR > 0; portfolio max drawdown ≤ 20%; beats NIFTY 50 CAGR or has a lower drawdown) **and** average excess > 0 and day-clustered excess > 0 vs the control group.

Known strictness, stated before the run: momentum baskets often fall 25–35% in bad years, so check 8 (drawdown ≤ 20%) is hard for this style. It stays, because it is the standard every setup was held to.

**Pass** → "Monthly Momentum" becomes a tracked basket, **On trial** with a live paper record (≥ 12 monthly rebalances before Trusted, because it trades monthly). **Fail** → no re-tuning on the test period; the stopping rule applies.
