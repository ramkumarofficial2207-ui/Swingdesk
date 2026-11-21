# Earnings surprise (§3.2): pre-registration

Committed **before** the quarterly-results download finished and before any result was seen. Run once: `npm run research:earnings-surprise`.

**Thesis** (Kakushadze & Serur §3.2; Chan, Jegadeesh & Lakonishok 1996): companies whose latest quarterly profit beats the same quarter last year by far more than their usual year-on-year swing keep outperforming for months ("post-earnings drift"). This is the first SwingDesk study that uses information not on the price chart.

## Data

- `QuarterlyResult` from NSE (classic results list up to 2024, integrated filings from 2025): the **first** filing per company and quarter (later revisions ignored), one basis per company (consolidated if it filed consolidated for at least as many quarters as standalone).
- **Event day** (when the market learned the result, IST): the company's results board-meeting day (`ResultsEvent`) between the quarter end and NSE's publish time, if there is one; otherwise the publish day. Events more than 75 days after the quarter end with no matching meeting are dropped (only a late or revised filing is on record, so the real date is unknown).

## Score

SUE = (net profit this quarter − net profit same quarter last year) ÷ standard deviation of that year-on-year change over the previous 8 quarters (at least 6 needed). **Deviation from the paper:** company net profit instead of EPS, so bonuses, splits and new shares don't distort the comparison.

**Top 10%, point-in-time:** an event qualifies if its SUE is above the 90th percentile of all SUEs announced in the 365 days before it (at least 100 earlier events needed). No future data.

## Trades

Signal at the close of the last session on or before the event day; buy at the next open (after the release). No gap filter: a gap up after good results is part of the information, and the drift is what comes after.

| Rule | Exit | Trader rules |
|---|---|---|
| **Own (paper)** | Hold 126 sessions (about 6 months, the paper's typical holding period), no stop | ≤ 10 new per day, ≤ 50 open, equal weight |
| **Ratchet (user's swing exit)** | Stop −5.5%, target +8.5%; stop to buy price after +3.5%, to +2.5% after +4.5%, to +4.75% after +7% (from the next session); sell at the close of session 15 | ≤ 3 new per day, ≤ 2 per industry, ≤ 15 open |

0.4% round-trip costs. Universe: daily top 500 company shares by turnover. Discovery: signals 2021–2023; **test 2024-01-01 → latest**.

## Control

Every universe stock whose results were announced for the **same signal session** (any surprise), with the same exit. This isolates the effect of a big surprise from the effect of simply reporting.

## Pass rule

All harness v3 checks on the test period plus both control checks (average and per-day excess > 0). Two trials.

- **PASS** → Auto Paper forward tracking (results-driven picks); a candidate for the Workspace only after a live record.
- **FAIL** → reported as is. No re-tuning (no other thresholds, horizons or profit measures) on the test period.

Known limits stated up front: the 2018 filings partly lack data files, so SUE starts around 2021; the industry labels are not used here.
