# Project restart review — 16 November 2026

Follow-up: the user's earlier vision was subsequently retrieved from their other chats. It prioritizes personal validation of approximately 5% swing opportunities with INR 100,000 total capital before commercialization. See `reports/VISION_ALIGNMENT_2026-11-16.md` for the comparison and revised sequencing; the invited-pilot timing below is superseded by that evidence-first milestone.

The project is a substantial research and paper-trading application with an unfinished SaaS and execution layer. Its biggest weakness is the gap between strategy evidence, the rules running in different code paths, and the product claims those paths can support. Preserve the useful foundations and repair those connections before expanding the feature set.

This review inspected local TypeScript/React/Python source, Prisma models and migrations, deployment configuration, tests, and saved evaluation artifacts. Production configuration, deployed code, database contents, customer usage, broker accounts, and existing commercial agreements were not inspected. Deployment claims in older handoff documents are therefore historical notes, not verified current status.

**Verification performed**

| Check | Result |
|---|---|
| `npm test -- --reporter=dot` | 25 files, 83 tests passed |
| Backend `npm run build` | Passed, including Prisma generation and TypeScript compilation |
| Frontend `npm run build` in `apex-intelligence` | Passed; main JS bundle 930.87 kB, 267.81 kB gzip; Vite warned about chunk size |
| Python service tests | Could not import the service: local Python 3.14 lacks NumPy; this is an environment gap, not evidence of a failed model assertion |
| Small isolated reproductions against compiled modules | Confirmed flat-bar V4 rejection, zero-risk sizing returning one share, and OAuth state accepted as an API bearer token |
| Git status | Working directory was not recognized as a Git repository; `.git/HEAD` was absent, while `.git/.git_bkp` contains Git metadata |

No application source was changed. Builds regenerated local output. No server, scheduled scanner, payment flow, broker order, database migration, or external notification was started. Saved backtest metrics were inspected, not rerun.

**Foundations worth keeping**

- React UI, strict TypeScript backend, PostgreSQL/Prisma migrations, authentication, per-user watchlists and portfolio CRUD, and server-side subscription checks already exist.
- Password hashing, JWT issuer/audience validation, request validation, CORS restrictions, payment signature checks, and ownership regression tests are useful existing controls.
- Durable scan jobs, finalized EOD market data, same-time RVOL, maximum-entry checks, explicit setup/plan/attempt/event records, and broker-token encryption are the right building blocks.
- ML artifacts have versions, calibration, chronological evaluation, and promotion gates. The recorded models correctly remain in shadow mode after failing their gate.
- The chat service has grounded data paths and explicit unsupported-request handling. These are a better starting point than an unrestricted trading chatbot.

**1. Highest business priority: establish whether the strategy has a repeatable edge**

The saved V4 result is much weaker than the positive headline in the handoff suggests:

| V4 period | Executed plans | Average net return per plan | Profit factor |
|---|---:|---:|---:|
| Through 2024, development | 16 | +2.986% | 2.199 |
| 2025 onward, diagnostic validation | 6 | -3.159% | 0.100 |
| Combined | 22 | +1.310% | 1.473 |

The report explicitly says the chronological split is not an untouched holdout. Six later-period trades are too few to estimate future performance reliably, and their observed result is poor. The combined average does not establish a deployable edge. The report's 26.39% equal-trade realized drawdown is also not a capital-constrained account drawdown.

The preceding V3 report likewise deteriorated in its later split: 30 executions, -0.736% average, 0.412 profit factor. Separately, the ML evaluation records a conditional LightGBM holdout Precision@5 of about 45.09%, below its 55% promotion gate, and `eligible: false`. Precision@5 is a ranking metric and should not be presented as the portfolio win rate.

Sources: `reports/backtests/presurge_v4_intraday_full_2021_2026_result.md:27`, its JSON methodology and splits, the corresponding V3 report, and `python_ml/artifacts/evaluation.json:53`.

Improve this by selecting one strategy, freezing its exact configuration, and collecting future outcomes without repeatedly tuning against the evaluation period. Record strategy/configuration/data hashes and all rejected, missed, expired, filled, and closed cases. Compare against a simple deterministic baseline using costs, cash allocation, overlapping positions, mark-to-market drawdown, and uncertainty around the estimates. Add explicit treatment of corporate actions, historical membership/delistings, data gaps, and unavailable fills. A fixed number of paper-trading days alone is not evidence of profitability.

**2. Immediate engineering priority: repair the V4 path before collecting more evidence**

Three independent problems are visible:

- The swing scanner constructs `preSurgeV3`, and storage writes `PRE_SURGE_V3_SHADOW` plus `setup.preSurgeV3`. The V4 observer requires a shadow plan whose version is `PRE_SURGE_V4`. The normal scanner-to-storage path does not supply it. See `src/scanner.ts:1456` and `src/scanStorage.ts:37`.
- The V4 observer passes `stockVwap: price` and a fabricated bar with open/high/low/close all equal. The close-location calculation returns 0.5 for that bar, while the normal V4 rule requires 0.75. An isolated reproduction rejected the flat bar and accepted a real qualifying bar with otherwise comparable inputs. See `src/setupLifecycleMonitor.ts:284` and `src/preSurgeV4Strategy.ts:123`.
- `MAX_DISTRIBUTION_DAYS` is 1, but eligibility uses equality, requiring exactly one distribution day. Meanwhile scoring rewards zero distribution days, and the comment describes a maximum. This is an internal policy contradiction, not a reason to optimize the threshold against the holdout. See `src/preSurgeV4Strategy.ts:19`, `:210`, and `:232`.

The generated Markdown report also hard-codes old rules: score 82, base range 6%, sector RS 3%, accumulation 65. Current source and JSON methodology use score 80, base range 8%, sector RS 1%, and source accumulation 60. Generate descriptions from the same configuration used by the evaluator.

Acceptance: a fixture must travel through qualification, persistence, completed-candle confirmation, shadow entry, and exit accounting. Replaying the same market events through backtest and paper paths must produce the same decisions. Persist real 15-minute bars and VWAP inputs. Verify actual V4 events and outcomes in staging before trusting the handoff's statement that V4 is collecting them.

**3. Unify the meaning of a trade and the track record**

`syncScanToGlobalTrackRecord` accepts scanner BUY/confidence or ML BUY labels and creates an OPEN trade at scanner LTP. It does not require a confirmed TradeAttempt or the maximum-entry/RVOL checks. `scanCoordinator` invokes it after non-manual scans when automation is enabled, including post-market qualification. See `src/globalAgent.ts:143` and `src/scanCoordinator.ts:320`.

This means the system portfolio can describe a different strategy from the lifecycle monitor. Its trade cannot currently be traced through a schema relation to the corresponding TradeAttempt. `Trade` also lacks an explicit execution mode and broker order/fill identifiers.

The global agent books partial exits by creating a CLOSED row and then separately reducing the original quantity. A failure between those writes, overlapping workers, or retries can corrupt accounting. The global track-record endpoint counts CLOSED rows, so partial legs can be counted as separate trades. Cost treatment also differs: global-agent closes use turnover friction, manual portfolio closes calculate gross P&L, and the V4 replay uses a fixed round-trip cost.

Acceptance: use one canonical confirmed-entry event; maintain parent position, fills, exit legs, fees, and cash separately; make transitions transactional and idempotent. Label research outcomes, simulated fills, user-entered trades, and broker-confirmed fills explicitly. Derive statistics from a documented ledger and unit of analysis.

**4. Complete the user/account boundary before expanding the SaaS agent**

Per-user portfolio CRUD and watchlists are implemented, so this is not a completely single-user application. The automation layer is still mostly a system account with fixed limits: ten positions and INR 100,000 per trade in `src/globalAgent.ts:6`.

The intraday risk governor reads every user's OPEN trades without a user filter, then uses the combined sectors to generate risk flags. Another customer's holdings can therefore influence shared scanner output. See `src/riskGovernor.ts:22` and its call at `src/scanner.ts:2104`. Shared market scans are appropriate; personal portfolio constraints should be applied separately for the authenticated account.

`BrokerConfig` is modeled per user, but the reviewed runtime broker selection uses environment credentials and the Dhan token manager stores a server-owned session. That is useful for the platform data feed; it does not complete customer-specific trading authorization and reconciliation.

Acceptance: distinguish the platform market-data account from each customer's broker execution account. Add account-scoped consent, permissions, execution mode, available cash, existing exposure, risk limits, and audit records. Test two users with conflicting portfolios and independent broker sessions.

The separate `positionSizer` helper also forces at least one share when calculated size is zero. An isolated check returned one share for zero risk and for a zero regime multiplier. No external caller of this helper was found in `src`, so treat it as a latent bug to repair before reuse, not a verified current production order defect.

**5. Finish live execution as a separate milestone**

A Kite GTT adapter exists, but the reviewed scanner path does not establish a complete order lifecycle. `src/positionManager.ts:17` explicitly says live exit-order execution is not implemented. `positionManager.ts` and `triggerMonitor.ts` were not found wired into the current startup path; do not treat their presence as an operational feature.

Before customer automation, implement durable order intents, client idempotency keys, broker acknowledgements, partial fills, rejection/cancellation handling, protective exits, restart recovery, and broker-to-ledger reconciliation. Add stale-price rejection, capital reservation, per-account and platform stop controls, and a user-visible record of every attempted action. Treat an ambiguous broker timeout as an unknown order state requiring reconciliation, not permission to resend blindly.

Use the assistant for explanations and proposals. Deterministic checks should decide whether an order is permitted; a language-model answer must not bypass those checks. Expand autonomy gradually from research and alerts to explicit user-approved execution and only then bounded automation.

**6. Repair account security before public onboarding**

- `requireAuth` accepts the same issuer/audience and user/email claims used by the Kite OAuth state token, without checking token purpose. A locally generated OAuth state was accepted as a bearer access token. Give access tokens and OAuth state distinct audiences/types and validate them. See `src/authMiddleware.ts:32` and `:66`.
- Registration issues a token immediately for the supplied email, while admin access depends on the email allowlist. If an allowlisted address has not been provisioned, a public registrant could claim it without email verification. Provision admin roles securely and verify identity; do not derive privilege from an unverified registration field. See `src/index.ts:484` and `src/authMiddleware.ts:50`.
- Access tokens last 30 days and logout only acknowledges deletion on the client. Add revocable sessions and account recovery; the inspected routes do not provide password reset or email/mobile verification. The MPIN flow also needs account-aware brute-force protection beyond a per-IP limiter.
- Frontend bearer tokens are stored in localStorage. Reduce exposure through an explicit session design and browser protections; assess HttpOnly cookies with CSRF protection for the web client rather than moving storage without considering the full flow.
- The Python ML service permits requests when `ML_SERVICE_TOKEN` is unset. Require authentication at production startup or enforce private network access. Production exposure/configuration was not verified.

The existing security controls should be extended, not discarded. These findings concern trust boundaries and lifecycle behavior that passing helper tests do not cover.

**7. Make background work durable and recoverable**

ScanJob persistence is valuable, but `startMarketScan` does a separate active-job lookup and create without an atomic database claim. Concurrent requests/replicas can both observe no active job. The in-memory Map is not a cross-process lock. See `src/scanCoordinator.ts:389`.

Schedulers are registered in API processes. Events/SSE subscribers are process-local. Edge calibration and news use local JSON files; edge restoration reads only the latest 300 setup rows and substitutes UNKNOWN/default context. On an ephemeral deployment or with multiple replicas, users can receive different histories and calibration. See `src/agentEvents.ts:54`, `src/edgeAnalyticsService.ts:6`, `:334`, and `src/newsIntel/store.ts:5`.

Keep the current application as a modular monolith initially. Give workers an explicit role, claim jobs atomically in PostgreSQL, and add leases/heartbeats plus idempotent retries. Persist decision context and notification delivery attempts. Add monitoring for last successful EOD session, stale ticks, scan duration/failure, missing shadow outcomes, expired credentials, and broker/ledger mismatches. Test backup restoration and process termination during a job. A database-only readiness endpoint does not establish market-data or worker health.

**8. Test the business workflows and simplify maintenance**

The 83 passing tests are a useful base, but no coverage for V4, scan-coordinator concurrency, lifecycle-monitor persistence, or payment-service lifecycle was found in `tests`. Add meaningful integration tests for confirmed entry through exit, duplicate events, restarts, two-user isolation, payment replay/refund, and unavailable data. Add one browser flow covering signup/login, setup inspection, watchlist, paper journal, and expired access.

No repository CI workflow was found. CI should run TypeScript tests, both builds, Python service tests in the supported Python version, and migration checks against a disposable database.

`scanner.ts` is 2,107 lines, `index.ts` 2,066, and `dataService.ts` 1,972. Extract route modules, shared contracts, provider adapters, and pure strategy evaluators incrementally. Keep one authoritative startup guide and one strategy registry. Resolve the Git metadata problem and compare against the trusted remote before making new implementation changes; preserve the backup metadata and local work.

Use the Python 3.11 environment specified by `Dockerfile.ml` or an equivalent project environment. Avoid relying on whichever global Python happens to be installed. Split heavy frontend pages/charts with dynamic imports after correctness work.

**9. Narrow the product and finish the paid-user lifecycle**

The repository covers swing trading, intraday, institutional flows, several LLM providers, multiple ML rankers, news intelligence, and broker adapters. This creates more operating and validation work than the current evidence supports.

A proposed first release is: an Indian-equity swing research assistant that presents a small explainable shortlist, explicit entry conditions, risk calculations, dated data sources, alerts, and a transparent journal. Validate that workflow with a small invited cohort. Useful measures are time to first useful setup, alert usefulness, repeat weekly use, retention, and cost per active user.

Razorpay order creation, signature verification, and entitlement activation exist. The inspected implementation handles captured/paid events but does not provide a complete recurring billing, refund/revocation, invoice, recovery, and support lifecycle. Explicitly document whether plans are prepaid access or recurring subscriptions. Add account-level usage quotas and cost measurement; in-memory per-IP limits are insufficient for subscription fairness and cost attribution.

The configured INR 2,999 monthly and INR 24,999 annual prices are implementation choices, not evidence of willingness to pay. Validate them against actual user value and the cost of data, AI, hosting, payment processing, and support.

**10. Resolve data and regulatory requirements alongside development**

Commercial access and redistribution rights need to be checked for every data source. NSE's policy requires an agreement defining intended usage, and section 7.3 restricts redistribution to the agreement's terms. Its restrictions also warrant checking the exact proposed paper/simulation feature with the provider. Access through a personal broker API does not itself establish SaaS redistribution rights. Source: [NSE Data Usage and Sharing Policy](https://nsearchives.nseindia.com/web/sites/default/files/inline-files/NSE_Data_Sharing%26Usage_Policy.pdf).

Customer broker automation must be designed around the applicable broker/exchange retail-algo requirements. SEBI's September 2025 circular sets out implementation of the February 2025 framework and its April 2026 applicability date for brokers. Confirm current operational requirements with the intended broker and have the proposed research/advice/execution business model reviewed by qualified Indian counsel. The exact obligations depend on what is sold and how orders are generated. Source: [SEBI circular of 30 September 2025](https://www.sebi.gov.in/sebi_data/attachdocs/sep-2025/1759232056254.pdf).

**Suggested four-week restart sequence**

| Period | Work | Evidence of completion |
|---|---|---|
| Week 1 | Preserve/recover the repository baseline; set up the supported environments; fix V4 persistence, candle inputs, distribution-day semantics, and report configuration; address admin/OAuth trust boundaries | Reproducible builds and tests; one V4 fixture passes through the actual storage/monitor path; access-token tests reject OAuth state |
| Week 2 | Unify confirmed entries and paper accounting; distinguish trade modes; make partial exits atomic; isolate personal risk | One ledger explains every paper position; duplicate events cannot add exposure; two-user tests pass |
| Week 3 | Add atomic job ownership, durable decision context, alert delivery records, operational health, backup/restore checks, and CI | Restart and concurrent-worker tests pass; stale data blocks dependent actions; restore demonstrated |
| Week 4 | Polish the narrow research workflow; complete account recovery and billing semantics; start an invited pilot after resolving applicable commercial requirements | Users can complete the core workflow; product-use and cost metrics available; clear support path |

Collect prospective strategy evidence from the point the corrected pipeline is frozen. That validation may take substantially longer than four weeks. Keep ML and automatic broker execution unpromoted until their own technical and evidence gates are satisfied.

The first implementation task should be repairing the V4 end-to-end path and its evidence trail. It is concrete, exposes the integration gaps, and makes every later research or product decision more trustworthy.
