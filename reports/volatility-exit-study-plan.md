# Volatility-scaled exit study: pre-registration

Written and committed **before** running the study. Results must be judged against this plan; designs, conditions and the decision rule may not be changed after seeing results.

## Why

The fixed +5% / −2.5% study (`reports/five-percent-study.md`) found the stop hit first on ~65% of trades: half the universe moves more than 3.5% on a normal day, so a 2.5% stop sits inside ordinary noise. This study keeps the 2:1 reward-to-risk idea but sizes the stop to each stock's own volatility.

## Fixed inputs (unchanged from the 5% study)

- Universe: daily top 500 company shares by 20-session turnover (ISIN `INE…`), split/bonus adjusted.
- The same 15 conditions, computed from data up to the signal close.
- Discovery 2021-01-05 → 2023-12-29; test 2024-01-01 onward. 40 bps round-trip costs.
- Conservative ordering: a gap through the stop exits at the open; a bar touching both levels is a stop.
- ATR = 14-session average true range at the signal close, as % of the close.

## Designs (exactly four)

| ID | Entry | Stop | Target | Max sessions |
|---|---|---|---|---:|
| A | Next session open | 1.0 × ATR | 2 × stop | 10 |
| B | Next session open | 1.5 × ATR | 2 × stop | 15 |
| C | Next session open | 1.5 × ATR | 2 × stop | 20 |
| D | Breakout: next session trades above the signal day's high (+0.1%); fill at that price, or the open if it gaps above. No trade otherwise. | 1.5 × ATR | 2 × stop | 15 |

R = net result ÷ stop distance, so results are comparable across designs.

## Selection (discovery data only)

1. For each design, run the same forward selection as the 5% study: add conditions one at a time while non-overlapping average net R improves, keeping at least 300 discovery trades.
2. The **primary** candidate is the design + conditions with the highest discovery average net R.
3. Only the primary candidate's test result decides the verdict. The other three designs' test results are reported for transparency, not used to pick a winner.

## Decision rule (test period, primary candidate, non-overlapping trades)

**Pass** only if all hold:

- at least 100 test trades;
- average net R > 0 **and** the lower end of its 95% range > 0;
- average net R > 0 in at least two of the three test years (2024, 2025, 2026).

**Pass** means: freeze it as a named strategy version and forward-test on new sessions. It does not mean trade it with money.
**Fail** means: no candidate setup from this design family. Do not re-tune the same designs on the test period.
