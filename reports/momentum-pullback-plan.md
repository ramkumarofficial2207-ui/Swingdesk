# Momentum pullback study: pre-registration

Committed **before** running. The rules, variants and decision rule below may not be changed after seeing results.

## Idea

Stocks that have risen the most over the past months tend to keep outperforming for a while (cross-sectional momentum, widely documented, including for Indian equities). Instead of buying breakouts (which failed in [setup-evidence](setup-evidence.md) once look-ahead was removed), buy a **strong stock after a short dip, when it resumes upward**, with a stop sized to its normal daily range and a roughly +5% target.

## Fixed inputs

- Universe: daily top 500 company shares by 20-session turnover (ISIN `INE…`), split/bonus adjusted (same as all studies).
- Discovery 2021-01-05 → 2023-12-29; test 2024-01-01 onward; 40 bps round-trip costs.
- Conservative ordering: a gap through the stop exits at the open; a bar touching both levels is a stop.
- All signals are known at the close and filled at the **next session's open** (no look-ahead; how an evening trader works).

## Signal (all at the signal-day close)

1. **Momentum leader:** 126-session return, skipping the most recent 5 sessions, ranks in the **top 20%** of that day's universe.
2. **Uptrend:** close > 50-day average > 200-day average.
3. **Pullback:** within the last 10 sessions the close was at least 2 × ATR above the 20-day average, and on the signal day's previous session the close was within 1 × ATR of the 20-day average (a real dip to support, not a stall at highs).
4. **Resumption:** the signal day closes above the previous session's high.

## Trade

Entry: next session's open. Stop: 1.5 × ATR(14) below entry. Target: 2 × the stop distance. Exit at the close of session 10 otherwise. ATR as a % of price is required to be between 1% and 4% (so the target is roughly +3% to +12%; +5% for a typical 1.7% ATR).

## Variants (exactly two)

| ID | Market filter |
|---|---|
| P1 | None |
| P2 | NIFTY 50 close > 50-day average > 200-day average on the signal day |

The **primary** variant is the one with the better discovery average net R. Only the primary's test result decides the verdict; the other is reported for transparency.

## Decision rule (test period, primary, non-overlapping trades per stock)

**Pass** only if all hold: ≥ 100 test trades; average net R > 0; lower end of its 95% range > 0; positive in at least 2 of the 3 test years (2024, 2025, 2026).

**Pass** → add as a setup type in the scanner and put it **On trial** for live paper tracking. **Fail** → do not trade it and do not re-tune these rules on the test period.
