# Institutional bulk buys study: pre-registration (Phase 3)

Committed **before** running. The rules, variants and decision rule below may not be changed after seeing results. Evaluated with harness v3 ([`SETUP_DISCOVERY_ROADMAP.md`](../SETUP_DISCOVERY_ROADMAP.md) Part 3). Only event **counts** and buyer **names** were looked at to write this plan; no returns.

## Setup card

| Field | Rule |
|---|---|
| **Thesis** | A bulk deal is a trade of ≥ 0.5% of a company's shares in one day, published by NSE the same evening. When a long-only institution (mutual fund, insurer, pension or sovereign fund, foreign fund) buys that much in one day, it signals conviction. Such funds usually build positions over weeks, so their continued buying keeps lifting the price after the deal is public. |
| **Data** | `InstitutionalDeal`: NSE bulk deals 2021-01-01 → 2026-07-31 (105,008 rows; block deals excluded). Aug–Nov 2026 is missing (NSE's dated archive returns 404); the test period therefore ends with signals on 2026-07-31. |
| **Who counts as an institution** | Client name (upper case) matches `MUTUAL FUND\|\bMF\b\|LIFE INSURANCE\|INSURANCE COMPANY\|GENERAL INSURANCE\|ASSURANCE\|PENSION\|PROVIDENT FUND\|SOVEREIGN\|GOVERNMENT OF SINGAPORE\|MONETARY AUTHORITY\|ABU DHABI INVESTMENT AUTHORITY\|NORGES\|VANGUARD\|BLACKROCK\|FIDELITY\|ISHARES\|\bFUNDS?\b\|\bFD\b\|INDEXFD\|TRUSTEE` **and does not** match `ARBITRAGE\|SECURITIES\|BROKING\|BROKERS\|TRADING\|TRADETECH\|COMMODITIES\|FINANCIAL MARKETS\|CAPITAL MARKETS\|MARKETS LLP\|QUANT\|RESEARCH` (high-frequency and proprietary desks such as Graviton, HRTI and XTX dominate raw bulk buys and are market-makers, not investors). |
| **Event (day D, known that evening)** | For one institution and one stock on day D: buy value − sell value ≥ **₹5 crore** (net buyer). The stock must be in the universe on D. |
| **Universe** | Daily top 500 company shares by 20-session turnover (ISIN `INE…`), split/bonus adjusted. |
| **Ranking** | Total institutional net buy value in the stock on D (₹ crore), highest first. |
| **Entry** | Open of D + 1. Skip if that open is more than 3% above D's close. |
| **Exit** | Close of the 10th session (entry day = session 1). No stop, no target. |
| **Trader rules (harness defaults)** | Top 5 per day, at most 2 per industry, at most 5 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars, equity ÷ 5 per position. |

## Variants (exactly two)

| ID | Buyers |
|---|---|
| F1 | All institutions above |
| F2 | Active funds only: also excludes names matching `INDEX\|INDEXFD\|ETF\|ISHARES\|VANGUARD` (passive funds buy mechanically on index changes, not on conviction) |

**Primary** = the variant with the better **discovery day-clustered** average net return. Only the primary's test result decides.

## Control group

All universe stocks on the same signal day, entered at the next open with the same exit and gap rule.

## Periods

Discovery: signals 2021-01-05 → 2023-12-29. Test: signals 2024-01-01 → 2026-07-31. Test years: 2024, 2025, 2026 (January–July).

## Decision rule (test period, primary)

**Pass** only if all 11 checks pass: the 9 harness v3 checks (≥ 100 trades; average net > 0; lower end of 95% range > 0; day-clustered > 0; > 0 without the best 5 signal days; positive in ≥ 2 of 3 test years; portfolio net CAGR > 0; portfolio max drawdown ≤ 20%; beats NIFTY 50 CAGR or lower drawdown) **and** average excess > 0 and day-clustered excess > 0 vs the control group.

**Pass** → "Institutional Buy" becomes a scanner setup type, **On trial** for live paper tracking (the nightly bulk-deal sync now feeds it). **Fail** → no re-tuning on the test period; move to Phase 4 (company announcements and results numbers).
