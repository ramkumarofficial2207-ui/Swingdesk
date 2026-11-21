# Rising volume before the move + ratcheting stop: pre-registration

Committed **before** running. The user's idea (2026-11-21), turned into exact rules. Run once; no changes after seeing results.

**Idea:** stocks that jump 5–7% in a week usually show rising volume 2–3 days before the jump. Buy when the volume starts rising, and manage the trade with a wider stop that moves up as profit builds.

## Step A: check the idea on all data (descriptive)

For every universe stock-day: was the stock ≥ 5% higher 5 sessions later ("gainer")? Was volume rising at that close (higher 3 sessions in a row, last one ≥ 1.5× the 20-day average)? Report how much more often gainers follow the clue (lift), separately for 2021–23 and 2024–26.

## Step B: trades

| Item | Rule |
|---|---|
| Universe | Daily top 500 company shares by 20-session turnover, split/bonus adjusted, point-in-time |
| Entry | Next session's open after the signal close; skip if it opens > 3% above the signal close |
| Picks | Top 3 per day by today's volume ÷ 20-day average; at most 2 per industry; at most 15 open |
| **Exit (user's rule, midpoints of the ranges given)** | Stop −5.5% (user: 5–6%). Target +8.5% (user: 8–9%). After a high of **+3.5%** (user: 3–4%) the stop moves to the **buy price**; after **+4.5%** (user: 4–5%) to **+2.5%** (user: 2–3%); after **+7%** to **+4.75%** (user: 4.5–5%). A stop move applies from the next session (the order of high and low within one day is unknown). Sell at the close of session 15 if nothing hit. |
| Costs | 0.4% round trip |
| Sizing | Harness default: equity ÷ 15 per position, capped so a full stop loses ≤ 1% of equity |

### Entry variants (exactly four; signal at the close)

| ID | Rule |
|---|---|
| V1 | Volume higher on each of the last 3 sessions, today ≥ 1.5× its 20-day average |
| V2 | V1 + today closed up |
| V3 | V1 + price up 0–3% over the last 3 sessions (the move has not started yet) |
| V4 | V2 + close above the 50-day average |

**Primary** = the variant with the best discovery (2021–2023) per-day average net return. Only the primary's test (2024-01-01 → latest) decides.

## Pass rule

Harness v3 checks on the test period (≥ 100 trades, average > 0, 95% range above 0, per-day average > 0, positive without the 5 best days, ≥ 2 of 3 positive years, portfolio CAGR > 0, drawdown ≤ 20%, beats NIFTY CAGR or lower drawdown) **plus** a control group (all universe stocks, same days, same exit): average and per-day excess > 0.

For comparison only (not part of the decision): the primary's entry with the old +5% / −2.5% exit; the control row shows the new exit on random stocks.

**PASS** → added to Auto Paper for forward paper tracking. **FAIL** → reported as is.
