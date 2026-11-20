# SwingDesk: full research report (for outside review)

Prepared 2026-11-20. Market: NSE India cash equities. All figures are research output, not investment advice.

**Purpose of this document:** a complete, self-contained description of what was built, which indicators and rules were used, how every idea was tested, and where and why each one failed, so an independent reviewer (for example another AI model) can look for mistakes, missed ideas, or a better approach.

---

## 1. The goal

A personal tool (not sold to anyone) that runs after the market closes and lists Indian stocks likely to give **about +5% within 2–5 trading sessions**. Orders are placed manually by the owner at a broker. The owner wants to "trust the system": a setup is only shown as tradeable if it has an honest backtest **and** a live paper record.

**The arithmetic the goal must beat** (used throughout):

- Typical plan: target +5%, stop −2.5%, round-trip costs about 0.4% (delivery trades: STT, stamp duty, exchange fees, GST, slippage).
- A winner nets about +4.6%; a loser about −2.9%.
- **Break-even hit rate ≈ 2.9 ÷ (4.6 + 2.9) ≈ 39%** (reach +5% before −2.5%).
- Measured base rate for an average top-500 stock: **24.4%** within 5 sessions, **28–32%** within 10 sessions.
- Best clue found in any study: **~33%**. No rule reached 39% on unseen data.

---

## 2. Data

| Data | Coverage | Source | Notes |
|---|---|---|---|
| Daily OHLCV candles | 2020-01-01 → today, ~3,470 NSE symbols (623 that stopped trading are included, so no survivorship bias) | NSE end-of-day files (UDiFF) + broker | Split/bonus adjusted. Includes turnover, total trades, **delivery quantity and delivery %** (3.19 million rows with delivery %). |
| Universe used in every study | **Daily top 500 company shares by 20-session average turnover** (ISIN starting `INE`, so no ETFs or funds), point in time | Computed | Recomputed every day, so it never uses future index membership. |
| NIFTY 50 index | 2020 → today | Same | Market regime (50- and 200-day averages) and benchmark. |
| Results (board meeting) dates | 2020 → 2026 | NSE board-meeting history | Dates only; no actual results numbers or estimates. |
| Bulk deals | 2021-01 → 2026-10-15 (gap 2026-10-16 → 11-18), daily from 2026-11-19 | NSE archives | 105,008 rows locally plus 9,103 in a backup. |
| Block deals | From 2026-11-19 only | NSE archives | No history available. |
| FII/DII daily flows | To 2026-10-15 | NSE report | The automatic fetch is now blocked by NSE. |
| Global markets | 2019-09 → today: copper, Brent crude, USD/INR, Nasdaq, S&P 500, gold | Yahoo chart API | Dated in each exchange's time zone. |
| Industry labels | Current Nifty 500 list only | NSE | **Bias:** stocks that left the index have no label (see lesson A11). |
| Intraday (5-minute) | Not stored | Broker (Dhan) API could supply some | Needed for any intraday idea. |
| Not available | Results numbers/estimates, analyst data, news with reliable timestamps, F&O open interest history, option prices | — | — |

---

## 3. Indicators computed by the scanner

Computed on daily candles (`src/indicators.ts`):

- **Trend:** EMA 20, EMA 50, 200-day moving average; trend stack (close > 20 > 50 > 200).
- **Momentum:** RSI(14), ADX, 3-month return, 3-month return vs NIFTY (relative strength), relative-strength acceleration, time-series momentum.
- **Volatility:** ATR(14), ATR as % of price, Bollinger Bands (20, 2σ), TTM Squeeze (Bollinger inside Keltner).
- **Volume:** volume ratio (today vs average), volume dry-up (10-day vs 50-day), pocket pivot, delivery % (stored, not used by the scanner's classifier).
- **Trend-following systems:** Supertrend, Ichimoku cloud.
- **Pattern detectors:** VCP (volatility contraction pattern, with quality and tightness), compression setup, High Tight Flag, Episodic Pivot (gap-up on volume), Bull Flag, 20-day breakout, 52-week high proximity.
- **Composite scores:** acceptance, absorption, persistence, breakout retention, failure risk, pre-move, leader score, confidence, hit probability (a hand-weighted mix of volatility, RSI, volume ratio, relative strength, VCP and compression).
- **Market regime:** NIFTY vs its 50/200-day averages; breadth.
- **ML (shadow only, never decides trades):** LightGBM and XGBoost rankers trained on scanner features.

## 4. Setup types the scanner produces

`identifySetupType` checks in this order and returns the first match:

1. Episodic Pivot (EP) Gap-Up
2. High Tight Flag (HTF)
3. Leader Pullback Reclaim
4. Second-Entry Retest
5. Earnings Reaction Continuation
6. Compression in Leaders
7. Bull Flag Breakout
8. Deep Value Reversion
9. **Pre-Surge Hybrid Base:** price within 2% of EMA20, volume ratio ≤ 0.85, RSI 40–70, EMA20 > EMA50 > 200-DMA, 3-month return beats NIFTY by ≥ 5%
10. Ichimoku Cloud Breakout (Ichimoku bullish and acceptance ≥ 6.5)
11. Supertrend Continuation (Supertrend bullish and acceptance ≥ 6.5)
12. Acceptance Breakout (acceptance ≥ 7 and breakout retention ≥ 6.5)
13. Squeeze Breakout (TTM squeeze now or yesterday, close above upper Bollinger, volume ratio ≥ 1.35)
14. VCP Breakout (VCP quality ≥ 7), then VCP Contraction
15. Compression Breakout (quality ≥ 6)
16. Momentum Continuation (within 3% of 52-week high, RSI ≥ 55)
17. Breakout Base (20-day breakout, within 3% of 3-month high, RSI ≥ 55)
18. EMA20 Pullback (within 2% of EMA20, EMA50 > 200-DMA)
19. EMA50 Pullback (within 2.5% of EMA50)
20. Pullback Continuation (everything else)

**Entry, stop and target** (`src/setupLevels.ts`, shared by the app and the backtests):

- Entry: just above the signal day's high (or the 5/10/20-day high, depending on type).
- Stop: below the recent 5–15-day low, EMA20, or 1.25–1.5 × ATR below entry, depending on type; capped at 2.5 × ATR.
- Target: entry + 2.6–4.0 × ATR, depending on type.

---

## 5. How ideas are tested (the method)

Built after early mistakes; every rule exists because something went wrong without it.

1. **Pre-registration:** the rules, at most two variants, and the pass/fail criteria are written and committed to git **before** any test-period result is seen. Nothing is re-tuned after seeing results.
2. **Periods:** discovery 2021-01-05 → 2023-12-29 (used to choose between the two variants); **test 2024-01-01 → latest** (decides pass/fail).
3. **No look-ahead:** signals use data up to the close; entry is the **next session's open**. (An early version triggered on the intraday high using the day's final volume. That made four losing setups look profitable; see section 7.)
4. **Costs:** 0.4% round trip on every trade.
5. **Trader rules (evaluation harness v3):** each signal day, rank candidates and take the top N (usually 5); at most 2 per industry; at most 5 open positions; no re-entry into a stock already held; exits only on tradeable bars (skips suspended days and single-price locked-circuit days); a gap through the stop exits at the open; a bar touching both stop and target counts as a stop.
6. **Statistics:**
   - average net return per trade with a 95% range;
   - **day-clustered average** (average each signal day first, then across days; signals cluster on crash days);
   - average **without the 5 best signal days**;
   - results by year and by market regime.
7. **Portfolio simulation:** daily mark-to-market, equity ÷ positions sizing, net CAGR and maximum drawdown versus NIFTY 50 buy-and-hold over the same dates.
8. **Control group:** the same entry and exit applied to all universe stocks on the same days, so a setup must beat the average stock, not just zero.
9. **Pass rule (all 11 must hold on the test period):**
   1. ≥ 100 trades;
   2. average net > 0;
   3. lower end of the 95% range > 0;
   4. day-clustered > 0;
   5. > 0 without the 5 best days;
   6. positive in ≥ 2 of 3 test years;
   7. portfolio CAGR > 0;
   8. portfolio max drawdown ≤ 20%;
   9. beats NIFTY CAGR or has a lower drawdown;
   10. average excess vs control > 0;
   11. day-clustered excess vs control > 0.
10. **Trust levels:** Research only → On trial (passes the historical test; paper-tracked live) → Trusted (≥ 30 live paper trades with a positive average). Only Trusted would ever be considered for real money.
11. **Trial registry:** every idea tried, including exploration, is logged, so the number of attempts is visible (more attempts mean more chance of a lucky false positive).

---

## 6. Everything tested, with results

Test period 2024–26 unless stated. R = net result ÷ initial risk (entry − stop).

| # | Idea | What exactly | Test result | Verdict |
|---|---|---|---|---|
| 1 | **All 20 scanner setup types** | The app's own entry, stop and target; close-confirmed trigger (close above entry on ≥ 1.5× volume), next-open fill, 10-session limit | Every type ≤ about 0 R. Largest: Pullback Continuation 5,207 trades −0.145R; EMA50 Pullback 1,722 −0.197R; EMA20 Pullback 1,549 −0.136R; Momentum Continuation 759 −0.109R; Pre-Surge Base 773 −0.193R. Only VCP Breakout was positive (+0.065R ± 0.489, 42 trades: too few, range far below zero) | ❌ 0 trusted, 0 on trial |
| 2 | **Fixed +5% target / −2.5% stop** with conditions chosen by greedy search (15 conditions: ATR bands, trend stack, relative strength, tight base, near 52-week high, volume dry-up, breakout on volume, strong close, pullback to EMA20, market green, breadth, extension) | Next-open entry, 10 sessions | Baseline every stock-day −0.228R; best discovery combination +0.207R → test **−0.387R** | ❌ |
| 3 | **ATR-scaled exits**, 4 designs × condition search | Stops 1–1.5 ATR, target 2× stop, 10–20 sessions | Primary (ATR < 1.5% + volume dry-up, breakout entry): discovery +0.224R → test **−0.425R**, 0 of 3 years positive | ❌ |
| 4 | **Momentum pullback** | Top-20% 6-month momentum, uptrend, dip to 20-day average, resumption day | Test **−0.109R** (482 trades), 0 of 3 years | ❌ |
| 5 | **Post-results drift** | ≥ 5% reaction vs NIFTY on 2× volume around the results date; enter 2 days after | Discovery +0.320R → test **−0.015R** | ❌ |
| 6 | **Next-day clue scan** (exploration, 2021–23 only) | 16 clues known at the close + 9 combinations | Volume, big up days and results dates make a stock 2–4× more likely to be a next-day top-10 gainer, but buying them at the next open **loses after costs**: they predict move size, not direction | Exploration |
| 7 | **Uptrend dip** (short-term reversal) | Down ≥ 3% today, ≥ 5% in 5 days, above 50-day average; hold 5 days | Pooled test +0.53% per trade, but **day-clustered −0.58%**: gains came from a few crash-rebound days (2024-02-12, 2024-06-04). Under trader rules: portfolio **−22.8% CAGR, 60% drawdown** (discovery had shown +40.6% CAGR) | ❌ |
| 8 | **Sector momentum** | Industry with ≥ 4 stocks in the day's top 30 gainers; buy its most liquid names; 5 days | Test **−0.57%** per trade, portfolio −15.0% CAGR. Control group showed the exploration's +0.20% came from **industry-label bias** | ❌ |
| 9 | **Global and commodity cues** | Overnight shock (\|z\| ≥ 1.5 vs 60-day volatility) in copper↓ (consumer durables), Brent↓ (autos, paints, refiners, airline), USD/INR↑ (IT, pharma), Nasdaq↑ (IT); 5 days | Test **−0.11%** per trade, portfolio −3.6% CAGR. Per cue (information only): copper↓ → durables positive in both periods (+0.37%, +0.68%, but only 46 test trades); rupee weakening → IT/pharma negative in both | ❌ |
| 10 | **Institutional bulk buys** | Net buy ≥ ₹5 crore by long-only institutions (mutual funds, insurers, pension or sovereign funds; high-frequency desks excluded); 10 days | Test **−0.90%** per trade; **worse than the average stock by 1–1.6% in both periods** (likely the other side of large sellers exiting) | ❌ |
| 11 | **Monthly momentum** (not a short swing) | 15 strongest stocks by risk-adjusted 12-1 momentum, ≤ 4 per industry, rebalanced monthly, costs charged on every holding every month | **Passed 8 of 11.** Test portfolio **+10.4% CAGR vs NIFTY +2.1%**; discovery +31.4% vs +16.9%; beats control in both periods. Failed: 95% range low end −0.17%, without best 5 months −0.20%, **max drawdown 30%** (variant with NIFTY > 200-day filter: drawdown 17%, but failed the same two certainty checks) | ⚠️ Near miss |
| 12 | **The scanner's own live picks** (Aug–Oct 2026, recorded live in the production database) | 354 setups; scoring rules committed before looking | Buy next open, hold 5: **−1.53%** per trade (301 trades), 0.47% worse than the average stock. App's own plan (close trigger, own stop/target): **−5.22%** (46 trades) | ❌ |
| — | **Forward paper lists** | Uptrend-dip and volume-surge lists frozen nightly before the open | Running; too few days to judge | Ongoing |

---

## 7. Where and why it fails (lessons)

1. **Look-ahead bias:** using the day's final volume to decide an intraday trigger made 4 setups look profitable: Bull Flag +0.17R, High Tight Flag +0.09R, Momentum Continuation +0.08R, Second-Entry Retest +0.07R. With price only, or a close-confirmed trigger and next-open fill, all were negative.
2. **Costs dominate:** most raw edges are smaller than 0.4% per round trip. Trading weekly costs ~20% a year.
3. **Clues predict volatility, not direction:** volume spikes, big moves and results dates mark stocks that will move a lot, both ways.
4. **Clustered signals mislead:** averaging all trades hid that a few crash days carried the dip strategy; per-day averaging exposed it.
5. **Discovery results are optimistic:** many ideas were tried; the best discovery result usually shrinks or flips on the test period.
6. **Membership-list bias (A11):** using today's Nifty 500 industry labels on 2021 data favours stocks that later succeeded; a control group is required.
7. **Selection on the outcome:** studying only past top gainers finds features that losers share too.
8. **Short samples are luck:** 3 days or 1 week of picks says nothing; live verdicts need ≥ 30 signal days.
9. **Untradeable exits:** suspensions and locked lower circuits create −50% to −95% outcomes.
10. **Moves come from outside the chart:** on 2026-11-19, 7 of the top 10 gainers moved on copper and crude prices or exchange notices, and opened flat (the move happened during the session).
11. **Data feeds can die silently:** bulk deals and FII/DII flows stopped for months because a scheduled job was disabled in personal mode.

---

## 8. What has not been tested yet

1. **Delivery %:** high delivery share as a sign of genuine buying. Data is already complete for 2020–26.
2. **Early-morning volume:** first 15–30 minutes of relative volume, intraday hold. Intraday costs are about 0.1–0.15% versus 0.4%, which lowers the break-even rate. Needs intraday history.
3. **Results numbers:** beat or miss versus estimates; no data source.
4. **Company announcements:** order wins, approvals; NSE's API blocks scripts, no history.
5. **F&O data:** open interest build-up, option selling; no historical option prices.
6. **The owner's own discretionary picks** tracked against the paper tracker.
7. **Monthly momentum live:** needs about 12 live months.

---

## 9. Questions for the reviewer

1. Is there a flaw in the testing method that would make good strategies look bad? For example: too strict (≥ 100 trades, 11 checks, ≤ 20% drawdown), wrong costs, the next-open entry, or the top-5 / 2-per-sector cap.
2. Is the break-even arithmetic in section 1 correct for Indian delivery trades in 2026?
3. Given the data available (section 2), which untested idea has the best chance, and how would you define it precisely enough to pre-register?
4. Is a +5% in 2–3 sessions goal realistic for a retail trader in liquid NSE stocks, and what evidence supports your answer?
5. For monthly momentum (near miss), what would you change **before** a live paper test without overfitting to the 2024–26 results already seen?
6. Are there known, published edges for Indian equities at a 2–10 day horizon that this work missed?
