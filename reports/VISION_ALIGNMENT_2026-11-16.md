# Apex Intelligence — vision alignment, 16 November 2026

Read the actual messages in [Architecture Blueprint Rewrite](https://chatgpt.com/c/6afae4f4-0d10-83e8-a56c-273b5dd0f20e) and [NSE Swing Research Schedule](https://chatgpt.com/c/6afaf83c-03bc-83ec-b4c5-09a05a46b7b3), then compared them with the local project and the preceding technical review.

**Assessment: the broad product direction is aligned; the current experiment and delivery priorities are only partially aligned.** The existing application can support the vision, but it does not yet establish that the user's intended strategy works.

**The user's stated vision**

- An NSE swing-trading research platform with staged screening of approximately 3,000 stocks, quantitative ranking, and AI analysis of only the strongest candidates.
- Actionable trade cards with timestamped prices, entry conditions, stop-loss, two targets, risk/reward, technical reasoning, and invalidation conditions.
- Stocks with approximately 5% potential per trade.
- Personal validation starting with INR 100,000 total capital; commercialization after demonstrating satisfactory results.
- An ambition of 300 winning trades. For evaluation, the recommendation is to track consecutive completed trades including losses, with missed and unfilled signals recorded separately. A count of winners alone cannot demonstrate net profitability.
- Low operating costs, reliable data, transparent scoring, and no promises of guaranteed returns.
- A later subscription product with 15 trading days of free access, authentication, Railway hosting, and a custom domain.
- The supplied blueprint proposes Python for quant calculations and OpenAI for primary AI reasoning, with Gemini optional. These are proposed implementation choices; changing languages/providers is not itself evidence of improved strategy performance.

**What matches and what differs**

| Vision | Inspected implementation | Assessment |
|---|---|---|
| Quantitative screening before expensive AI | Deterministic screening; default 30 candidates for deeper checks; optional LLM enrichment of top 10 | Strong architectural alignment |
| Approximately 3,000-symbol starting universe | Scanner defaults to 500 liquidity-ranked symbols and clamps its configured limit to 1,500 | Coverage differs; build explicit universe eligibility and coverage reporting before expansion |
| Timestamped actionable trade cards | Existing levels, T1/T2, watchlists, lifecycle dates, charts, and explanations | Useful foundation; correctness and consistency need the fixes in the technical review |
| Evaluate approximately +5% potential | Current swing targets depend on ATR/setup structure; V4 replay uses 2R partial and 3.5R final exits | Related swing logic, but not a dedicated test of the stated +5% objective |
| INR 100,000 total validation account | Global paper agent allocates INR 100,000 per trade and allows ten simultaneous positions | Material mismatch: it can model roughly INR 1,000,000 of exposure, not the intended account |
| Demonstrate repeatable results before selling | Backtests and ML gates exist; saved V4 has 22 executions and weak later-period results; several trade paths disagree | Validation infrastructure is incomplete and results do not yet establish the intended outcome |
| Python main quant engine | Core scanner/indicators/backtests are mainly TypeScript; Python hosts ML | Technology difference; preserve working deterministic code unless a measured need justifies migration |
| One primary OpenAI model, optional Gemini | Reviewed advisor uses Groq, Gemini, and Claude; no OpenAI integration was found in that path | Provider design differs; consolidate behind one interface and measure usefulness/cost |
| Transparent 0–100 setup quality | Several 0–10 confidence/edge scores plus other scoring scales | Unify definitions and display; do not relabel a score as a probability |
| Fifteen trading-day trial | Registration grants seven calendar days | Concrete later-stage product mismatch |
| Agent serving the research workflow | Scheduled scans, monitoring, grounded chat, alerts, and paper automation exist | Suitable components; workflow integration needs repair; customer auto-execution is a separate capability |

Evidence: `src/scanner.ts:651`, `:701`, `:1030`, `:1278`, `:1377`, `:1675`; `src/globalAgent.ts:6`; `src/index.ts:520`; `src/aiAdvisor.ts:1`; `src/preSurgeV4IntradayBacktest.ts:713`; `prisma/schema.prisma:34`.

**Changes to the earlier restart recommendation**

The original technical findings remain relevant. However, the four-week commercialization/pilot sequence should not be treated as the next release commitment. The retrieved vision places personal validation first. Retain essential account security and operational fixes, and defer paid-user expansion until the agreed evidence is available.

V4 is one candidate strategy, not the definition of Apex Intelligence. Repairing its persistence and confirmation defects is necessary if it is to be evaluated. Its success should not be assumed, and the project should retain a simple deterministic baseline for comparison.

Do not rewrite the whole backend to Python merely to match a blueprint prepared without inspecting this code. Preserve React, Express, PostgreSQL, and the useful quantitative modules. The important boundary is between observed data, deterministic qualification/risk rules, AI explanation, and audited outcomes.

**Recommended next milestone**

Build a reproducible evaluation answering: for the same timestamped entry conditions and an INR 100,000 total simulated account, which setups reach +5% from the actual simulated fill before the stop or time exit, and what happens to account equity after costs?

The +5% outcome should be measured separately from the existing ATR/R-multiple exit policies so their performance can be compared. The holding period, cost model, position limits, and account risk limits must be declared before evaluation. The earlier assistant suggested 5–15 sessions; that was a proposed experiment window, not an explicit fixed user requirement.

Record every opportunity's qualification, rejection, fill or missed-entry reason, entry time/price, maximum favorable/adverse excursion, target-before-stop result, holding duration, costs, and account effect. Respect available cash and overlapping positions. Generate results separately for each strategy/configuration version.

Then freeze the chosen rules and collect prospective paper outcomes. Use all completed trades, not a selected collection of winners; retain the original 300-trade ambition as an evidence-collection objective rather than a profitability guarantee. Any later personal live test and commercial release need their own explicit readiness decisions.

The research agent's first scope should be to refresh data, screen, explain, monitor conditions, maintain the journal, and report outcomes. A general multi-agent debate or automatic broker execution is not required to answer the central strategy question.
