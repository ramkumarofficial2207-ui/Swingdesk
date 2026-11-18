# Swing setup performance

Generated: 2026-11-18T19:03:06.071Z
Completed scans: 2; point-in-time Pre-Surge V2 replay signals: 14; setup observations: 30 (3 repeat sightings of the same stock and setup within 14 days removed); priced outcomes: 2.
The historical Pre-Surge V2 replay is a separate strategy cohort selected from the historical top-500 liquidity universe. It is not a replay of the current Nifty 500 scanner. Do not combine its expectancy with the live scanner to claim current-strategy performance.
Round-trip cost assumption: 40 basis points of traded value, including estimated fees and slippage.
Net expectancy: -0.05 R; maximum cumulative drawdown: 1.03 R; longest losing streak: 1.
**Evidence status: insufficient.** Fewer than 30 priced outcomes; this report cannot establish a repeatable edge.
Resolved targets/stops: 1; target hits: 0; target-hit share: 0.0%.

Uses only finalized daily candles after each scan date. Entry is assumed at the saved buy zone; a gap above entry is skipped. Same-day entry/stop and target/stop collisions are AMBIGUOUS because daily bars do not show event order. Open positions are marked at the tenth close. PENDING means fewer than ten later sessions. These are simulated setup outcomes, not broker fills.

## By setup type

| Setup | Found | Entered or ambiguous | Priced | Targets | Stops | Ambiguous | Net expectancy (R) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Bull Flag Breakout 🚩 | 7 | 0 | 0 | 0 | 0 | 0 | — |
| Deep Value Reversion 📉 | 1 | 0 | 0 | 0 | 0 | 0 | — |
| EMA50 Pullback | 1 | 0 | 0 | 0 | 0 | 0 | — |
| Leader Pullback Reclaim | 1 | 0 | 0 | 0 | 0 | 0 | — |
| Momentum Continuation | 2 | 0 | 0 | 0 | 0 | 0 | — |
| Pre-Surge Hybrid Base 🌱 | 1 | 0 | 0 | 0 | 0 | 0 | — |
| Pre-Surge V2 historical replay | 14 | 2 | 2 | 0 | 1 | 0 | -0.05 |
| Pullback Continuation | 3 | 0 | 0 | 0 | 0 | 0 | — |

## Setup ledger

| Scan date | Stock | Setup | Entry | Stop | Target | Score | Bars | Entry day | Exit day | Outcome | Net R |
|---|---|---|---:|---:|---:|---:|---:|---|---|---|---:|
| 2025-01-08 | BLS | Pre-Surge V2 historical replay | 522.30 | 469.55 | 606.65 | 95.6 | 10/10 | — | — | NOT_TRIGGERED | — |
| 2025-01-08 | ACE | Pre-Surge V2 historical replay | 1571.35 | 1428.10 | 1814.40 | 95 | 10/10 | — | — | NOT_TRIGGERED | — |
| 2025-01-08 | KAYNES | Pre-Surge V2 historical replay | 7698.35 | 6860.30 | 9163.00 | 94.7 | 10/10 | — | — | NOT_TRIGGERED | — |
| 2025-01-08 | KFINTECH | Pre-Surge V2 historical replay | 1563.60 | 1396.70 | 1968.55 | 94.4 | 10/10 | — | — | NOT_TRIGGERED | — |
| 2025-01-08 | WOCKPHARMA | Pre-Surge V2 historical replay | 1584.55 | 1416.00 | 1854.25 | 93.7 | 10/10 | — | — | NOT_TRIGGERED | — |
| 2025-01-08 | LEMONTREE | Pre-Surge V2 historical replay | 162.55 | 147.25 | 187.05 | 87.9 | 10/10 | — | — | NOT_TRIGGERED | — |
| 2025-01-08 | EDELWEISS | Pre-Surge V2 historical replay | 129.75 | 116.50 | 153.10 | 87.8 | 10/10 | — | — | NOT_TRIGGERED | — |
| 2025-01-08 | AVALON | Pre-Surge V2 historical replay | 1005.75 | 907.00 | 1258.40 | 84.9 | 10/10 | — | — | NOT_TRIGGERED | — |
| 2025-01-15 | VIJAYA | Pre-Surge V2 historical replay | 1276.25 | 1117.70 | 1529.95 | 97.8 | 10/10 | — | — | NOT_TRIGGERED | — |
| 2025-01-15 | FSL | Pre-Surge V2 historical replay | 414.40 | 365.05 | 493.35 | 95.9 | 10/10 | — | — | NOT_TRIGGERED | — |
| 2025-01-15 | LLOYDSENGG | Pre-Surge V2 historical replay | 90.00 | 78.35 | 109.55 | 95.2 | 10/10 | — | — | NOT_TRIGGERED | — |
| 2025-01-15 | AARTIPHARM | Pre-Surge V2 historical replay | 694.15 | 636.50 | 829.25 | 89.1 | 10/10 | — | — | NOT_TRIGGERED | — |
| 2025-01-15 | BAJFINANCE | Pre-Surge V2 historical replay | 7395.40 | 7038.20 | 8138.90 | 87.1 | 10/10 | 2025-01-20 | 2025-01-29 | OPEN_AT_HORIZON | 0.93 |
| 2025-01-15 | JISLJALEQS | Pre-Surge V2 historical replay | 78.70 | 69.80 | 94.20 | 85.7 | 10/10 | 2025-01-20 | 2025-01-27 | STOP | -1.03 |
| 2026-11-18 | IIFL | Momentum Continuation | 682.70 | 624.40 | 752.65 | 6.8 | 0/10 | — | — | PENDING | — |
| 2026-11-18 | RAYMOND | Momentum Continuation | 1225.20 | 1060.05 | 1423.40 | 6.4 | 0/10 | — | — | PENDING | — |
| 2026-11-18 | LOTUSDEV | Bull Flag Breakout 🚩 | 241.75 | 213.60 | 275.55 | 5.2 | 0/10 | — | — | PENDING | — |
| 2026-11-18 | FILATEX | Bull Flag Breakout 🚩 | 111.10 | 94.95 | 130.50 | 5.2 | 0/10 | — | — | PENDING | — |
| 2026-11-18 | SHILPAMED | Bull Flag Breakout 🚩 | 943.65 | 830.60 | 1079.30 | 5.2 | 0/10 | — | — | PENDING | — |
| 2026-11-18 | ATHERENERG | Bull Flag Breakout 🚩 | 1957.35 | 1720.90 | 2241.05 | 5.2 | 0/10 | — | — | PENDING | — |
| 2026-11-18 | CUPID | Bull Flag Breakout 🚩 | 369.95 | 326.60 | 422.00 | 4.8 | 0/10 | — | — | PENDING | — |
| 2026-11-18 | SUBROS | Pullback Continuation | 715.70 | 608.75 | 844.05 | 3.4 | 0/10 | — | — | PENDING | — |
| 2026-11-18 | VESUVIUS | Deep Value Reversion 📉 | 384.35 | 334.60 | 454.30 | 3 | 0/10 | — | — | PENDING | — |
| 2026-11-18 | KALYANKJIL | Pullback Continuation | 688.10 | 602.30 | 791.05 | 10 | 0/10 | — | — | PENDING | — |
| 2026-11-18 | AEGISLOG | EMA50 Pullback | 1218.90 | 1164.95 | 1463.40 | 9.8 | 0/10 | — | — | PENDING | — |
| 2026-11-18 | PVRINOX | Leader Pullback Reclaim | 1741.55 | 1539.20 | 1968.20 | 9.8 | 0/10 | — | — | PENDING | — |
| 2026-11-18 | AEGISVOPAK | Pre-Surge Hybrid Base 🌱 | 300.25 | 277.95 | 349.45 | 8.5 | 0/10 | — | — | PENDING | — |
| 2026-11-18 | WELSPUNLIV | Pullback Continuation | 264.20 | 232.05 | 302.80 | 7.5 | 0/10 | — | — | PENDING | — |
| 2026-11-18 | SANSERA | Bull Flag Breakout 🚩 | 4653.55 | 4168.95 | 5235.10 | 5.2 | 0/10 | — | — | PENDING | — |
| 2026-11-18 | LAURUSLABS | Bull Flag Breakout 🚩 | 2364.95 | 2168.80 | 2600.30 | 5.2 | 0/10 | — | — | PENDING | — |
