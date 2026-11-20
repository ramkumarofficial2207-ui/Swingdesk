# SwingDesk Phase 0 audit: ChatGPT's review checked against the code

Prepared 2026-11-20. Scope: every "suspected defect" in ChatGPT's handoff (`SwingDesk_Complete_Conversation_Handoff_for_Claude.md`) checked against the repository and the local database. No strategy rules, thresholds or reports were changed. Scratch scripts used: `scratch/niftyCheck*.ts`, `scratch/momCostCheck.ts`, `scratch/l2Attribution.ts`, `scratch/adjCheck.ts`, `scratch/gapScan.ts` (read-only).

Labels: **CONFIRMED BUG** · **DESIGN DEFICIENCY** · **NOT A BUG** · **UNVERIFIED**

## Summary

| ID | ChatGPT's suspicion | Verdict | Impact |
|---|---|---|---|
| A1 | Missing candles (not raised by ChatGPT) | **CONFIRMED BUG, FIXED** | 465 of 1,631 universe stocks had holes; short-swing verdicts unchanged, momentum weaker |
| A2 | −5.22% live-plan loss (P0-02) | **DESIGN DEFICIENCY**, explained | App stops average **9.1%** wide, not 2.5% |
| A3 | Momentum charges cost on unchanged holdings (P0-08) | **CONFIRMED** (as pre-registered, but unrealistic) | ~+0.2%/trade; does **not** honestly flip the verdict |
| A4 | NIFTY +2.1% CAGR is wrong (P0-03) | **NOT A BUG** | ChatGPT used a later end date |
| A5 | Same-day close vs same-day high impossible trigger (P0-04) | **NOT A BUG** | Trigger checks start the session after the signal |
| A6 | equity ÷ positions over-concentrates (P0-09) | **NOT A BUG** | Slot is equity ÷ max positions, capped by cash |
| A7 | Scanner vs backtest entry mismatch (P0-01) | **DESIGN DEFICIENCY**, partly confirmed | Two research paths score "the app's plan" differently |
| A8 | Flat 0.4% cost (P1-06) | **NOT A DRIVER** | Dhan delivery ≈ 0.30% + slippage at ₹20k; losses are far larger |
| A9 | First-match setup classifier (P1-01) | **DESIGN DEFICIENCY** (confirmed in `src/indicators.ts:1010`) | Matters for future research, not for the losses above |

---

## A1. CONFIRMED BUG: trade-to-trade (BE series) days are dropped, leaving holes in price history

**Where:** `src/eodMarketDataService.ts:163, 188, 235` and `src/dhanClient.ts:219` keep only `series === 'EQ'`. When NSE moves a stock to trade-to-trade (series BE/BZ, usually under ASM/GSM surveillance), its candles stop being stored until it returns to EQ.

**Evidence:** of 1,631 universe stocks with history, **465 have 949 holes of ≥ 5 sessions** since 2021 (by year: 209, 127, 128, 214, 163, 108). Examples: ADANIPOWER 2021-06-11 → 2021-09-20 (67 sessions missing), WOCKPHARMA 2024-03-04 → 2024-06-03 (57), DISHTV 2026-04-21 → 2026-08-11 (76), WEBELSOLAR 2024-12-30 → 2025-03-25. In 277 cases the stock was in the top-500 universe on the day before the hole.

**Why it matters:** the harness treats the next stored bar as the next session. A "5-session" trade that enters just before a hole exits **months later** at a price the trader could never have exited at. The universe filter also silently excludes surveillance stocks on those days, which is the right outcome for the wrong reason.

**Measured impact so far:** monthly momentum test has only 1 trade crossing a hole (SHAKTIPUMP, +8.3%); removing it changes nothing (CAGR 10.39% → 10.23%). Impact on the short-swing studies is **not yet measured**.

**Fix applied (branch `fix/trade-to-trade-candles`, commit 2a5666c):** `DailyCandle.series` column; parsers keep BE/BZ rows; the research universe and live scanner still pick EQ days only; `market:backfill --trade-to-trade-only` re-imported **395,091** BE/BZ rows from the cached archive. Holes: **949 → 42**, and **0** of the remaining fall on a universe-eligible day (they are genuine suspensions such as RCOM, FRETAIL, RELCAPITAL, which the harness already treats as delayed exits, so `simulateTrade` was not changed).

**Before/after, identical rules:**

| Study (test 2024–26) | Before | After | Verdict |
|---|---:|---:|---|
| Scanner replay, 21 setup types | 0 trusted, 0 on trial | 0 trusted, 0 on trial | unchanged; every type moved ≤ 0.02R |
| Fixed +5%/−2.5% (selected rule) | −0.387R (365 trades) | −0.380R (359) | still fails |
| Monthly momentum M1: avg/trade | +1.08% | **+0.74%** | weaker |
| Monthly momentum M1: 95% low end / without best 5 | −0.17% / −0.20% | **−0.50% / −1.12%** | further from passing |
| Monthly momentum M1: CAGR / max DD | 10.4% / 30.1% | **6.1% / 37.3%** (NIFTY 2.1%) | weaker |
| Momentum with turnover-only costs (A3) | +1.28%, low end +0.03% | +0.94%, low end −0.30% | fails clearly |

The "near miss" was partly a data artifact: with continuous history, stocks that had been in trade-to-trade get honest 12-month momentum scores, and the basket changes. Monthly momentum still beats NIFTY on CAGR but fails 4 checks instead of 3.

## A2. The −5.22% live-plan loss: explained, and it is a design problem rather than a code bug

46 trades (Aug to Oct 2026, from the Railway backup), re-derived trade by trade with `scratch/l2Attribution.ts`:

| Item | Value |
|---|---:|
| App's planned stop distance from entry, average (max) | **9.1%** (15.9%) |
| Stop distance from the actual fill, average | **12.3%** |
| App's planned target, average | 14.4% |
| Fill above the app's entry price (chasing), average | +3.75% |
| Exits: target / stop / time | 8 / 14 / 24 |
| Average result: target / stop / time | +5.0% / **−12.7%** / −4.3% |
| Contribution to the −5.22%: stops / time exits / targets | −3.87 / −2.22 / +0.87 |
| Stops that gapped below the stop price | 1 (−0.23% extra) |

**Cause:** `computeSetupLevels` in `src/setupLevels.ts:51-61` sets the stop to `Math.min(...)`, which picks the **widest** of several candidates, capped only at 2.5 × ATR. For the volatile small and mid caps the scanner favours, that cap is 9–16%. A −2.5% stop was never part of the app's actual levels. One stop costs about 2.5 winners.

Second cause: the scoring script has **no maximum-entry check**, so it bought on average 3.75% above the planned entry (the close-confirmed trigger had already run 3.4% past it).

The market also fell (the average top-500 stock lost 1.28% per 5-session hold on the same days), but the picks did 3.59% worse than that.

## A3. Monthly momentum: costs on unchanged holdings

**Confirmed:** each holding exits at the month-end close and re-enters at the next open, so the **50.3%** of test positions that simply stay in the basket pay a full extra 0.4%. This was written into the pre-registered plan, but it is not how a real portfolio trades.

| Version (test 2024–26) | Avg/trade | 95% low end | Without best 5 | CAGR | Max DD |
|---|---:|---:|---:|---:|---:|
| As tested | +1.08% | −0.17% | −0.20% | 10.4% | 30.1% |
| Carry costs refunded | +1.28% | **+0.03%** | **+0.01%** | 13.0% | 29.5% |

**Why this does not change the verdict:** (1) the two checks only clear by 0.01–0.03 points, which is noise; (2) the change is made after the 2024–26 results were seen; (3) the "sell at close, rebuy at open" rule also skips carried stocks that gap up more than 3%, which flatters the result in the other direction. A correct hold-through simulation needs A1 fixed first (holes corrupt the overnight prices). Drawdown (30%) still fails either way.

**Fix:** charge only actual turnover and hold carried positions through the month boundary. Version it as a new card (`monthly-momentum-v2`), so it cannot claim the old test period as unseen evidence.

## A4. NIFTY benchmark +2.1%: correct

Test portfolio dates are 2024-02-01 → 2026-10-30. NIFTY 50 opened at 21,780.65 and closed at 23,053.10, which is +5.8% over 678 sessions, or **+2.1% a year**. ChatGPT's 5.7% used 2026-11-19 (25,514), after a +10.7% rally in November that falls outside the test. The data is continuous; the only weekend bar (2025-02-01) is the real Budget-day session. Minor caveat: this is the price index. Total return (with dividends, ~1.2%/yr) would be about +3.3%; still far below +10.4%.

## A5. Same-day trigger: not a bug

`advanceScannerSignal` (`src/research/setupEvidence.ts:78`) starts at `signalIndex + 1`. The close-confirmed version fills at the open of the session after the trigger. `scoreLiveSetups.ts` starts at the first session after the setup was created. No same-bar look-ahead.

## A6. Portfolio sizing: not a bug

`simulatePortfolio` (`src/research/harness.ts`) sizes each position at `min(equity ÷ maxPositions, risk-based size, cash)`. When only one signal appears, it gets one slot, not the whole account.

## A7. Entry definitions: partly confirmed

- The trust layer (`setupEvidence.ts`) skips a fill above `calculateMaxBreakoutEntry`. The live scoring (`scoreLiveSetups.ts`) does not, and it uses a different window (5) and hold (10). Both are labelled "the app's plan".
- None of the research paths tests the scanner's literal **stop-buy order** (fill when the next session trades through the entry), because that needs the full-day volume (look-ahead) or intraday data.
- ChatGPT's three-mode split (next open / stop entry / close-confirmed then next open) is the right fix: one shared `ExecutionSpec` used by the scanner card, the trust layer and every study.

## A8. Costs: approximately right

Dhan delivery at a ₹20,000 position: STT 0.2% (both sides), stamp 0.015%, exchange plus SEBI plus GST ≈ 0.01%, DP ₹12.5 + GST ≈ 0.074%, for about **0.30%** before slippage. 0.4% including slippage is reasonable. ChatGPT's sensitivity table (0.15–0.6%) is worth adding, but no failed study was negative only because of costs: losses per trade are 1–5%.

---

## What this changes, as a trader would read it

1. **The scanner's levels do not match your goal.** You want +5% / −2.5%. The app hands out ~9% stops and ~14% targets on volatile stocks. That is a different trade, and live it lost badly. Before any new idea, the scanner should only show setups whose structural stop is within your risk budget, and drop the rest.
2. **The data has a real hole** (A1) that touches about a quarter of the universe. Fix it and re-run the existing studies **unchanged** before trusting any old number, positive or negative.
3. **No hidden bug turns the old strategies profitable.** The benchmark, trigger timing and sizing checked out. The −5.22% is explained by wide stops and chasing, not by a calculation error.
4. **Monthly momentum is weaker than reported.** On corrected data it fails 4 of 11 checks (CAGR 6.1%, drawdown 37%). It still beats NIFTY, but no longer looks like a near miss.

## Proposed fix order (each on its own branch, re-running the same unchanged studies after)

1. **A1 data fix:** store BE/BZ candles with a series flag, and add missing-session handling in the harness (with tests). Re-run the scanner replay, the fixed 5% study and monthly momentum, and publish before/after on identical rules.
2. **Shared `ExecutionSpec`** (three named entry modes and a max-entry check everywhere) used by `setupEvidence`, `scoreLiveSetups` and the cards. Fixture tests for the case list in ChatGPT §5.
3. **Risk-budget gate on scanner cards:** hide any setup whose stop is wider than a chosen maximum (for example 2.5–4%), marked as a display rule, not a new edge claim.
4. **Monthly momentum v2 card** (turnover-only costs, hold-through) as a new pre-registered version, then forward paper tracking only.
5. Later and separately pre-registered: independent setup flags instead of first-match, delivery-% study, and 5-minute replay of the 354 live setups.

Research output, not investment advice.
