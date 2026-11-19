# Global and commodity cues study: pre-registration (Phase 2)

Committed **before** running. The rules, variants and decision rule below may not be changed after seeing results. Evaluated with harness v3 ([`SETUP_DISCOVERY_ROADMAP.md`](../SETUP_DISCOVERY_ROADMAP.md) Part 3). No returns from these rules have been looked at.

## Setup card

| Field | Rule |
|---|---|
| **Thesis** | A sharp overnight move in a cost input or export driver changes the profits of specific Indian sectors (e.g. copper hit a 7-month low and AC makers rallied on 2026-11-19). Analysts and funds re-price the affected sectors over several days, not only at the next open, so beneficiary sectors keep outperforming the market for about a week. Long only. |
| **Data** | Daily closes from 2019-09 (`GlobalMarketDaily`, Yahoo chart API): COMEX copper (`HG=F`), Brent crude (`BZ=F`), USD/INR (`INR=X`), Nasdaq Composite (`^IXIC`). Each bar is dated in its exchange's time zone. |
| **Shock size** | For series S on its date D: r = ln(close_D / previous close); z = r ÷ standard deviation of the 60 daily log returns before D. Needs 60 prior returns. |
| **Timing (no look-ahead)** | A series bar dated D closes before 05:30 IST on D + 1 (US and London closes). It is assigned to the Indian session i with date(i) ≤ D < date(i + 1). **Entry at the open of session i + 1**, after the shock is known. The part of the move that happened during India's session D is already in that close; we only claim the drift after the next open. |
| **Cue → beneficiaries** | **C1** copper z ≤ −threshold → industry *Consumer Durables*. **C2** Brent z ≤ −threshold → industry *Automobile and Auto Components*, industry *Consumer Durables* (paints), and BPCL, HINDPETRO, IOC (refiners/marketers), INDIGO (airline). **C3** USD/INR z ≥ +threshold (rupee weaker) → industries *Information Technology* and *Healthcare* (exporters). **C4** Nasdaq z ≥ +threshold → industry *Information Technology*. Industry labels from the current Nifty 500 list. |
| **Candidates** | Every universe stock that is a beneficiary of at least one cue firing for session i. |
| **Universe** | Daily top 500 company shares by 20-session turnover (ISIN `INE…`), split/bonus adjusted. |
| **Ranking** | 20-session average turnover (close × volume), highest first (sector proxies, not single-stock bets). |
| **Entry** | Open of session i + 1. Skip if that open is more than 3% above session i's close. |
| **Exit** | Close of the 5th session (entry day = session 1). No stop, no target. |
| **Trader rules (harness defaults)** | Top 5 per day, at most 2 per industry, at most 5 open positions, no re-entry while held, 0.4% round-trip costs, exits only on tradeable bars, equity ÷ 5 per position. |

## Variants (exactly two)

| ID | Threshold |
|---|---|
| G1 | \|z\| ≥ 1.5 |
| G2 | \|z\| ≥ 2.0 (bigger shocks only) |

**Primary** = the variant with the better **discovery day-clustered** average net return. Only the primary's test result decides.

## Control group

Beneficiary lists use today's Nifty 500 labels (lesson A11). Every trade is compared with **all labelled universe stocks** entered on the same day with the same exit and gap rule.

## Periods

Discovery: signals 2021-01-05 → 2023-12-29. Test: signals 2024-01-01 → latest complete exit.

## Decision rule (test period, primary)

**Pass** only if all 11 checks pass: the 9 harness v3 checks (≥ 100 trades; average net > 0; lower end of 95% range > 0; day-clustered > 0; > 0 without the best 5 signal days; positive in ≥ 2 of 3 test years; portfolio net CAGR > 0; portfolio max drawdown ≤ 20%; beats NIFTY 50 CAGR or lower drawdown) **and** average excess > 0 and day-clustered excess > 0 vs the control group.

A per-cue breakdown (C1–C4) is reported for information only; it does not change the verdict, and no cue may be dropped or re-tuned after seeing it.

**Pass** → "Global Cue" becomes a scanner setup type, **On trial** for live paper tracking (≥ 30 signal days). **Fail** → no re-tuning on the test period; move to Phase 3 (institutional flow), which first needs the bulk/block deal feed repaired.
