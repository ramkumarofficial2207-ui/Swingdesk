# Setup evidence: sensitivity (PRICE_ONLY)

Generated: 2026-11-18T20:46:37.748Z · method `setup-evidence-v1` · trigger `PRICE_ONLY` · sensitivity run, stored status unchanged

Every scanner setup type, replayed with the **same entry, stop and target the app shows** and the app's execution rules. Status follows the pre-registered [trust rules](setup-trust-rules.md); only the 2024+ test period decides it.

"+5% first" is the share of trades that reached +5% before the stop from the same fill: your goal, reported for context.

## Status by setup type

| Setup type | Status | Test trades | Test avg net R (95% range) | Test target first | +5% first | Discovery avg net R |
|---|---|---:|---:|---:|---:|---:|
| Second-Entry Retest | ⚪ Research only | 2,131 | -0.067R ± 0.036 | 18.0% | 45.2% | +0.016R |
| Momentum Continuation | ⚪ Research only | 3,807 | -0.072R ± 0.028 | 17.7% | 42.3% | +0.021R |
| Bull Flag Breakout 🚩 | ⚪ Research only | 1,962 | -0.120R ± 0.041 | 15.5% | 50.8% | +0.004R |
| High Tight Flag (HTF) 🚩 | ⚪ Research only | 3,458 | -0.172R ± 0.035 | 12.7% | 44.4% | -0.049R |

Summary: 0 trusted, 0 on trial, 4 research only.

## Details

### Second-Entry Retest — ⚪ Research only

Signals 9,272; triggered 7,674; skipped as chasing 275; never triggered 1,323.

- Average result -0.07R is not positive
- 95% range includes zero or below
- Positive in 0 of 3 test years (needs 2)

| Period | Trades | Target first | Stop first | Expired | Avg net R (95% range) |
|---|---:|---:|---:|---:|---:|
| Discovery 2021–2023 | 2,696 | 22.8% | 22.4% | 54.8% | +0.016R ± 0.032 |
| 2024 (test) | 899 | 19.2% | 26.7% | 54.1% | -0.068R ± 0.057 |
| 2025 (test) | 606 | 15.5% | 24.6% | 59.9% | -0.081R ± 0.064 |
| 2026 (test) | 626 | 18.5% | 24.0% | 57.5% | -0.052R ± 0.065 |
| **Test total** | **2,131 | 18.0% | 25.3% | 56.7% | -0.067R ± 0.036** |

### Momentum Continuation — ⚪ Research only

Signals 32,719; triggered 27,154; skipped as chasing 574; never triggered 4,991.

- Average result -0.07R is not positive
- 95% range includes zero or below
- Positive in 0 of 3 test years (needs 2)

| Period | Trades | Target first | Stop first | Expired | Avg net R (95% range) |
|---|---:|---:|---:|---:|---:|
| Discovery 2021–2023 | 4,313 | 23.5% | 25.6% | 50.9% | +0.021R ± 0.027 |
| 2024 (test) | 1,978 | 19.3% | 30.6% | 50.1% | -0.061R ± 0.040 |
| 2025 (test) | 831 | 14.1% | 25.3% | 60.6% | -0.107R ± 0.056 |
| 2026 (test) | 998 | 17.6% | 28.2% | 54.2% | -0.063R ± 0.054 |
| **Test total** | **3,807 | 17.7% | 28.8% | 53.5% | -0.072R ± 0.028** |

### Bull Flag Breakout 🚩 — ⚪ Research only

Signals 11,370; triggered 8,844; skipped as chasing 447; never triggered 2,079.

- Average result -0.12R is not positive
- 95% range includes zero or below
- Positive in 0 of 3 test years (needs 2)

| Period | Trades | Target first | Stop first | Expired | Avg net R (95% range) |
|---|---:|---:|---:|---:|---:|
| Discovery 2021–2023 | 2,001 | 18.1% | 25.5% | 56.4% | +0.004R ± 0.042 |
| 2024 (test) | 830 | 18.0% | 34.2% | 47.8% | -0.135R ± 0.067 |
| 2025 (test) | 464 | 12.9% | 29.1% | 58.0% | -0.137R ± 0.082 |
| 2026 (test) | 668 | 14.4% | 23.8% | 61.8% | -0.091R ± 0.064 |
| **Test total** | **1,962 | 15.5% | 29.5% | 55.0% | -0.120R ± 0.041** |

### High Tight Flag (HTF) 🚩 — ⚪ Research only

Signals 26,825; triggered 21,702; skipped as chasing 309; never triggered 4,814.

- Average result -0.17R is not positive
- 95% range includes zero or below
- Positive in 0 of 3 test years (needs 2)

| Period | Trades | Target first | Stop first | Expired | Avg net R (95% range) |
|---|---:|---:|---:|---:|---:|
| Discovery 2021–2023 | 3,442 | 12.8% | 31.1% | 56.1% | -0.049R ± 0.034 |
| 2024 (test) | 1,345 | 12.6% | 33.6% | 53.8% | -0.096R ± 0.055 |
| 2025 (test) | 1,114 | 11.8% | 42.9% | 45.2% | -0.253R ± 0.062 |
| 2026 (test) | 999 | 13.7% | 38.7% | 47.5% | -0.184R ± 0.066 |
| **Test total** | **3,458 | 12.7% | 38.1% | 49.2% | -0.172R ± 0.035** |

Research output, not investment advice. The replay tests each setup type without the scanner's extra ranking filters, and does not model earnings dates.
