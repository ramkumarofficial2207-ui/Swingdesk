# Setup discovery roadmap

**Goal (do not deviate):** find at least one swing setup that earns **Trusted**, meaning it passes a pre-registered historical test **and** a live paper record. Everything below serves that goal. A feature that doesn't help find or prove a setup waits.

Written 2026-11-19, after 7 failed pre-registered studies. Research output, not investment advice.

---

## Part 1 — Lessons learned

Each lesson becomes a rule in the build. ✅ = already handled, 🔧 = must fix, 🆕 = new rule.

### A. Testing honestly

| # | Lesson | Where we learned it | Rule from now on |
|---|---|---|---|
| A1 | Using information not yet known (same-day final volume for an intraday trigger) made 4 losing setups look good. | Setup evidence v1 → v2 (#29) | ✅ Signals at the close, entry at the next open. 🔧 `mlHistoricalReplay.resolveHistoricalOutcome` still uses the trigger day's full volume (look-ahead), so fix it before any ML is reused. |
| A2 | Discovery results are optimistic when many ideas are tried (the uptrend dip was picked from ~25 looks). | Next-day clue scan | 🆕 **Trial registry:** every idea tried, including discarded ones, is logged with its discovery result. The report states how many ideas were tried. |
| A3 | **Averaging all trades hides clustering.** The uptrend dip made +0.53% per trade, but the typical day lost 0.58%; a few crash days carried it. | Uptrend dip | 🆕 Every study must pass **day-clustered** and **portfolio-level** checks (see Part 3), not just the average trade. |
| A4 | The 2024–26 test period has now been used 7 times. Each use leaks a little. | All studies | 🆕 2024–26 stays the historical test, but **the final judge is live forward paper trading**, which no one has seen. Nothing becomes Trusted on history alone. |
| A5 | Short checks (3 days, 1 week) are luck. | Forward check, weekly check | 🆕 Live verdicts need **at least 30 signal days**. Daily and weekly results are logged, never acted on. |
| A6 | Picking winners and asking what they had in common (selection on the outcome) misleads. | Recent gainers | 🆕 Always measure the reverse: of all stocks showing the clue, how many won, and did buying them all make money after costs? |
| A7 | Compare against the market, not zero. On 19 Nov the average stock rose 1%, and the picks matched it. | Backcheck | 🆕 Every result is shown next to the average universe stock and NIFTY 50 over the same days. |
| A8 | The history is short (2020–2026): one long bull market with few real bear phases. | Data coverage check | 🆕 Results are reported by year **and** by market regime (NIFTY trend up / down / sideways). A setup that only works in one regime must say so and carry a regime filter. |
| A9 | Point-in-time universe matters. | Data check: 623 stocks that stopped trading are included | ✅ Studies use the daily top-500 by turnover (no survivorship). 🔧 `recentGainers` uses today's Nifty 500 list (descriptive only; label it). |
| A10 | Pre-registration works. It stopped 7 losing ideas before they reached real money. | All studies | ✅ Keep it: plan committed before the test run, deviations disclosed. |

### B. Trading realism

| # | Lesson | Rule |
|---|---|---|
| B1 | Costs (~0.4% per round trip) are larger than most edges. Weekly trading costs ~20% a year. | 🆕 Report gross **and** net, plus turnover. Prefer setups whose average gross move is at least 3× costs. |
| B2 | Some trades can't be exited: suspensions (KERNEX, 3 months), lower circuit locks (RMDRIP). | 🆕 Mark **untradeable days** (no trading, or the bar is a single locked price). Exits wait for the first tradeable bar, and these trades are reported separately. Skip stocks with circuit-band limits ≤ 5% if the setup needs fast exits. |
| B3 | Gaps through stops are real. | ✅ A gap through the stop exits at the open; a bar touching both levels counts as a stop. |
| B4 | Stops can hurt reversal setups (U2 was worse than U1). | 🆕 The exit design is part of the hypothesis and is pre-registered with **at most 2 variants**. |
| B5 | Correlated picks are one bet (6 of 10 surge picks were autos and appliances). | 🆕 Sector cap: at most 2 positions per industry. Portfolio results are computed with this cap. |
| B6 | Real traders don't take every signal; they **rank and pick a few**. | 🆕 Every setup ranks its daily candidates and takes the **top N (≤ 5)**. Studies test the ranked top N, not "all signals". |
| B7 | Position sizing decides survival. | 🆕 Fixed-risk sizing (e.g. 1% of capital at risk per trade), max 5 open positions, max 25% of capital in one sector. The portfolio simulation uses these rules. |

### C. Information

| # | Lesson | Rule |
|---|---|---|
| C1 | Chart-only clues predict **how much** a stock moves, not **which way**. | 🆕 Stop searching single-stock chart patterns. New hypotheses need a **non-chart reason** (flows, news, sector or macro). |
| C2 | Big moves come from outside the chart. 7 of 19 Nov's top 10 moved on copper and crude prices (sector-wide), plus exchange notices. | 🆕 Add global, commodity, sector, flow and announcement data (Part 2). |
| C3 | Sectors move together. "≥ 4 same-industry stocks in today's top 30" was one of the few clues positive after costs (+0.20% ± 0.07 over 5 days, discovery). | First study: sector momentum. |
| C4 | Data feeds die silently: bulk/block deals stopped on 31 July and nobody noticed. | 🆕 **Data freshness monitor:** every feed has an expected update time and alerts when it's stale. |
| C5 | Moves happen during the session (19 Nov top gainers opened flat). | A later phase may add the first 30 minutes of intraday data; the evening-only design stays first. |

### D. Process

| # | Lesson | Rule |
|---|---|---|
| D1 | The idea → plan → test → verdict loop takes about one session per idea and works. | Standardize it as a pipeline (Part 3) so each idea costs less. |
| D2 | After-the-fact explanations ("why did it move?") generate good hypotheses. | 🆕 Weekly **mover review**: top gainers and losers, the reason found in news/data, tagged by cause type. Repeated cause types become hypotheses. |
| D3 | Pending housekeeping can block work. | 🔧 Open the PR for `research/next-day-movers`; review the 57 Dependabot alerts on `main`. |

---

## Part 2 — What a trader's setup must specify

Every setup is written as a **setup card** before testing:

| Field | Example |
|---|---|
| Thesis (why it should work, non-chart reason) | "Sector-wide buying continues for days as funds rotate in." |
| Universe | Top 500 by 20-day turnover, ISIN `INE…` |
| Market regime filter | NIFTY 50 above its 50-day average, or none |
| Signal (known at the close) | Exact rules |
| Ranking (pick the top N) | e.g. by relative strength within the sector |
| Entry | Next open; skip if it gaps more than X% |
| Stop / target / time exit | Exact rules (≤ 2 variants) |
| Position size | 1% risk; max 5 positions; ≤ 2 per sector |
| No-trade conditions | Results within 2 days, circuit-locked, F&O ban, etc. |
| Pass criteria | Part 3 |

---

## Part 3 — Evaluation standard (v3)

A setup passes the historical stage only if, on the **2024–26 test period**:

1. ≥ 100 trades (ranked top N, sector cap applied).
2. Average net return per trade > 0, and the lower end of its 95% range > 0.
3. **Day-clustered** average > 0.
4. **Portfolio simulation** (sizing rules from B7, starting capital fixed): positive net CAGR, max drawdown ≤ 20%, and beats NIFTY 50 buy-and-hold **or** has a clearly lower drawdown.
5. Positive in ≥ 2 of 3 test years.
6. Not dependent on a handful of days: removing the best 5 signal days keeps the average > 0.
7. Reported by regime; the trial count from the registry is stated.

Then **live stage:** On trial → paper-tracked every evening automatically → **Trusted** after ≥ 30 live trades over ≥ 30 signal days with net > 0 and day-clustered > 0. Demoted automatically if the last 30 fall ≤ 0.

---

## Part 4 — The agentic system

A desk of agents, each with one job. Agents **propose and run**; the human approves plans and money decisions. No agent places orders.

```
            ┌──────────────── evening, after the close ────────────────┐
 Data agent ──► Context agent ──► Scanner agent ──► Paper agent ──► Report / chat
  (ingest +     (regime, sector    (only On-trial /   (freeze lists,     (what was found,
   freshness)    heat, global cues) Trusted setups)    score, promote)    why, evidence)
            └──────────────────────────────────────────────────────────┘
                                         ▲
 Weekly: Mover-review agent ──► Research agent ──► Validator ──► (human approves) ──► On trial
         (why stocks moved)     (hypothesis +      (Part 3 harness,
                                 setup card +       no tuning on test)
                                 pre-registration)
```

| Agent | Does | Built from |
|---|---|---|
| **Data agent** | Ingests EOD candles, results, bulk/block deals, commodities and global markets, delivery %, announcements; checks each feed's freshness and alerts. | Existing EOD ingestion + new feeds |
| **Context agent** | Each evening: market regime, sector heat map, overnight global and commodity moves mapped to sectors. | New |
| **Scanner agent** | Runs only setups that are On trial or Trusted; ranks and caps by sector; shows research-only setups separately and clearly labelled. | Existing scanner + trust layer |
| **Paper agent** | Freezes each evening's list before the open, scores it, promotes or demotes. | Existing paper tracker + forward check |
| **Mover-review agent** | Weekly: top gainers and losers, the likely cause (data + news search), tagged by cause type; feeds the research agent. | New (LLM summarises news; it never decides trades) |
| **Research agent** | Turns repeated cause types into a setup card and a pre-registration; runs discovery; hands off to the validator. | Existing research scripts, standardized |
| **Validator** | One harness implementing Part 3 for any setup card; writes the report and registry entry. | Generalize current study runners |

---

## Part 5 — Phases (in order)

| Phase | Work | Done when |
|---|---|---|
| **0. Foundation** | Evaluation harness v3 (Part 3: ranking, sector cap, portfolio sim, day-clustered, best-5-days removal, regime split); trial registry; untradeable-day handling; fix ML look-ahead; data freshness monitor; nightly forward check scheduled; merge `research/next-day-movers`. | Harness re-runs the uptrend dip and gives the same FAIL, now also with portfolio results. |
| **1. Sector momentum** | Setup card + pre-registration → test. Uses existing data. | Verdict published. |
| **2. Global and commodity cues** | Daily history 2020+ for copper, crude, USD/INR, US indices, gold; map to sectors; context agent; setup card → test. | Verdict published. |
| **3. Institutional flow** | Fix the bulk/block deal feed (stale since 31 July); backfill; setup card → test. | Verdict published. |
| **4. Announcements and results numbers** | NSE announcements with timestamps, classified (order win, approval, guidance…); results beat/miss; setup card → test. | Verdict published. |
| **5. Combine and go live** | Survivors ranked together into one evening list; portfolio sim; On trial → live paper ≥ 30 signal days. | First **Trusted** setup, or the stopping rule applies. |

Mover-review runs weekly from Phase 0 onward and adds hypotheses to the queue.

### Phase 0 status (2026-11-19, branch `feature/phase0-foundation`)

| Item | Status |
|---|---|
| Evaluation harness v3 (`src/research/harness.ts`, `studyRunner.ts`; setup cards in `src/research/cards/`) | ✅ Done. Re-run of the uptrend dip reproduces FAIL; portfolio view: +40.6% CAGR in discovery, −22.8% CAGR with a 60% drawdown in test ([report](reports/harness-check-uptrend-dip.md)). |
| Trial registry (`reports/trial-registry.json`) | ✅ Backfilled with all 8 studies so far (the scanner replay alone covered 21 setup types) |
| Untradeable-day handling (suspension, single locked price) | ✅ In the harness |
| ML replay look-ahead | ✅ Fixed: close-confirmed trigger, next-open fill |
| Data freshness monitor (`npm run data:freshness`) | ✅ Done. Found bulk/block deals, institutional flow snapshot and FII/DII flows all stale since 2026-07-31. |
| Nightly forward check after the post-market scan (`npm run nightly:research`) | ✅ Done |
| Merge `research/next-day-movers` and this branch via PR | ⏳ Waiting for approval |
| Review the 57 Dependabot alerts on `main` | ⏳ Not started |
| Weekly mover-review agent | ⏳ Next, alongside Phase 1 |
| Industry labels for stocks no longer in the Nifty 500 | ⚠️ Limitation: they count as their own sector, so the sector cap can't group them |

### Phase 1 result (2026-11-19): sector momentum ❌ FAIL

[Report](reports/sector-momentum.md). Primary S2 (NIFTY above its 50-day average): test −0.57% per trade, day-clustered −0.54%, 0 of 3 test years positive, portfolio −15.0% CAGR with a 44% drawdown. S1 also failed.

**New lesson (A11):** the control group showed that most of the exploration's "+0.20% over 5 days" came from using today's Nifty 500 industry labels: stocks that are in today's list did better in the past. Against the control, S1 beat other labelled stocks by only +0.03% even in discovery. **Every study that uses today's membership lists needs a control group.**

### Phase 2 result (2026-11-19): global and commodity cues ❌ FAIL

[Report](reports/global-cues.md). New data feed: copper, Brent, USD/INR, Nasdaq, S&P 500 and gold from 2019 (`GlobalMarketDaily`, nightly top-up, freshness-monitored). Primary G1 (|z| ≥ 1.5): test −0.11% per trade, day-clustered −0.38%, portfolio −3.6% CAGR with a 33% drawdown vs NIFTY +5.7%. G2 also failed.

Per cue (information only): **copper falls → consumer durables** was positive in both periods (discovery +0.37%, 61 trades; test +0.68%, day-clustered +0.57%, 46 trades). **Rupee weakens → IT and pharma** was clearly negative in both (−0.78%, −0.83%). Promoting one cue after seeing test results is the A2/A4 trap, so neither changes the verdict. The copper cue can only be judged on **new live data** (forward paper), never on 2021–26 again.

### Phase 3 result (2026-11-19): institutional bulk buys ❌ FAIL

[Report](reports/institutional-buys.md). Feed repair first: the 16:10 institutional cron is disabled in personal mode, which is why deals and flows stopped on 2026-07-31; the nightly step now syncs bulk deals, **block deals (new)** and the FII/DII report. NSE's dated bulk archive returns 404 and its API blocks scripts, so Aug–Nov 2026 needs a manual CSV import; the FII/DII request times out.

Most raw bulk "buys" in liquid stocks come from high-frequency and proprietary desks (Graviton, HRTI, XTX…), so only long-only institutions were counted. Primary F2 (active funds): test −0.90% per trade, day-clustered −1.07%, 0 of 3 test years positive, portfolio −10.5% CAGR. Against the control group these stocks did **worse** than the average stock by about 1–1.6% over 10 sessions in **both** periods. A likely reason: a fund's bulk buy is often the other side of a large seller exiting (promoter or private equity), and that supply keeps weighing on the price. That is a reason to be careful after such deals, not a long setup.

### Final test (2026-11-19): monthly momentum ❌ FAIL by the pre-registered standard, but the first near miss

[Report](reports/monthly-momentum.md). A basket of the 15 strongest stocks (risk-adjusted 12-1 momentum), rebalanced monthly, with costs charged on every holding every month. Primary M1 (always invested) **passed 8 of 11 checks**:

- Test 2024–26: portfolio **+10.4% CAGR vs NIFTY +2.1%** over the same dates; +1.04% a month above the equal-weight "buy everything" control; 2 of 3 test years positive. Discovery 2021–23: +31.4% CAGR vs NIFTY +16.9%.
- Failed: lower end of the 95% range −0.17% (44 test months are too few to be sure); −0.20% without the 5 best months; **max drawdown 30.1%** (limit 20%). M2 (NIFTY above its 200-day average) kept the drawdown to 17.2% but failed the same two certainty checks.

Unlike every earlier study, the direction held in both periods and against the control. What is missing is **certainty and a tolerable drawdown**, not an edge in the average. Under A4, the only honest next evidence is **new live months**, never a re-tune on 2021–26.

**Stopping rule (agreed in advance):** if Phases 1–4 all fail, prediction work stops and SwingDesk becomes a discipline and journaling tool (sizing, stops, journal, paper record). This prevents endless searching, which is itself a source of false discoveries (A2).

**Honest expectation:** no guarantee. A realistic success is a small positive average edge across many trades with controlled drawdown, not +5% every week.
