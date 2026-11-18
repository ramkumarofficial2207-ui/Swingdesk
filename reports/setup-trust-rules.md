# Setup trust rules: pre-registration

Committed **before** the first evidence run. These rules decide which scanner setups SwingDesk presents as tradeable. They may only be changed in a new version of this document, never to rescue a setup after seeing its results.

## What is tested

Every setup type the live scanner can produce (`identifySetupType`), with the **same entry, stop and target the app shows** (`src/setupLevels.ts`, shared with the scanner).

Replay rules mirror the app's execution rules:

| Rule | Value | Source in app |
|---|---|---|
| Universe | Daily top 500 company shares by 20-session turnover | Same as research studies |
| Prices | Split/bonus adjusted; indicators from the last 300 sessions | `loadAdjustedDailySeries` |
| Plan validity | 10 sessions after the signal | `DEFAULT_PLAN_SESSIONS` |
| Trigger | Session high reaches the entry price on volume ≥ 1.5× the prior 20-session average | Live trigger RVOL 1.5 |
| No chasing | No trade if the session opens above `min(entry × 1.02, entry + 0.5 × ATR)` | `calculateMaxBreakoutEntry` |
| Fill | Entry price, or the open if it gapped above entry but below the maximum | |
| Exit | Stop or target; a bar touching both is a stop; a gap through the stop exits at the open; otherwise the close of session 10 after fill | |
| Costs | 40 bps round trip | Same as research studies |

R = net result ÷ (fill − stop). Trades are non-overlapping per stock and setup type. The +5%-before-stop rate is also reported, because that is the user's goal, but it does not decide status.

Known gaps: the live scanner applies extra quality filters and ranking before showing a setup; the replay tests the setup type itself. Earnings dates are not modelled.

## Discovery and test periods

Discovery 2021–2023, test 2024 onward, as in the earlier studies. Status is decided on the **test period only**; discovery is reported for context.

## Status

| Status | Rule |
|---|---|
| ⚪ **Research only** | Default. Any test rule below fails, or the setup has fewer than 100 test trades. Not to be traded. |
| 🟡 **On trial** | Test period: ≥ 100 trades, average net R > 0, lower end of the 95% range > 0, and positive in at least 2 of 3 test years. Eligible for paper tracking only. |
| 🟢 **Trusted** | On trial **and** at least 30 live paper trades recorded *after* it became On trial, with average net R > 0. Only Trusted setups are candidates for real money. |

A Trusted or On-trial setup is demoted to Research only if a later evidence run fails the On-trial rule, or if its live record over the most recent 30 trades has average net R ≤ 0.
