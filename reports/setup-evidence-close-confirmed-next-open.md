# Setup evidence: sensitivity (CLOSE_CONFIRMED_NEXT_OPEN)

Generated: 2026-11-18T20:46:37.766Z · method `setup-evidence-v1` · trigger `CLOSE_CONFIRMED_NEXT_OPEN` · sensitivity run, stored status unchanged

Every scanner setup type, replayed with the **same entry, stop and target the app shows** and the app's execution rules. Status follows the pre-registered [trust rules](setup-trust-rules.md); only the 2024+ test period decides it.

"+5% first" is the share of trades that reached +5% before the stop from the same fill: your goal, reported for context.

## Status by setup type

| Setup type | Status | Test trades | Test avg net R (95% range) | Test target first | +5% first | Discovery avg net R |
|---|---|---:|---:|---:|---:|---:|
| High Tight Flag (HTF) 🚩 | ⚪ Research only | 446 | -0.031R ± 0.098 | 17.7% | 50.2% | -0.138R |
| Bull Flag Breakout 🚩 | ⚪ Research only | 157 | -0.058R ± 0.148 | 22.9% | 56.1% | -0.051R |
| Momentum Continuation | ⚪ Research only | 759 | -0.109R ± 0.059 | 20.2% | 39.3% | -0.012R |
| Second-Entry Retest | ⚪ Research only | 383 | -0.130R ± 0.080 | 19.1% | 44.9% | +0.024R |

Summary: 0 trusted, 0 on trial, 4 research only.

## Details

### High Tight Flag (HTF) 🚩 — ⚪ Research only

Signals 26,863; triggered 1,481; skipped as chasing 12,942; never triggered 12,440.

- Average result -0.03R is not positive
- 95% range includes zero or below
- Positive in 0 of 3 test years (needs 2)

| Period | Trades | Target first | Stop first | Expired | Avg net R (95% range) |
|---|---:|---:|---:|---:|---:|
| Discovery 2021–2023 | 449 | 16.0% | 30.7% | 53.2% | -0.138R ± 0.094 |
| 2024 (test) | 195 | 19.0% | 31.8% | 49.2% | -0.022R ± 0.153 |
| 2025 (test) | 135 | 17.0% | 31.1% | 51.9% | -0.040R ± 0.164 |
| 2026 (test) | 116 | 16.4% | 32.8% | 50.9% | -0.035R ± 0.198 |
| **Test total** | **446 | 17.7% | 31.8% | 50.4% | -0.031R ± 0.098** |

### Bull Flag Breakout 🚩 — ⚪ Research only

Signals 11,377; triggered 411; skipped as chasing 5,762; never triggered 5,204.

- Average result -0.06R is not positive
- 95% range includes zero or below
- Positive in 0 of 3 test years (needs 2)

| Period | Trades | Target first | Stop first | Expired | Avg net R (95% range) |
|---|---:|---:|---:|---:|---:|
| Discovery 2021–2023 | 173 | 20.2% | 26.6% | 53.2% | -0.051R ± 0.136 |
| 2024 (test) | 76 | 26.3% | 32.9% | 40.8% | -0.040R ± 0.231 |
| 2025 (test) | 43 | 20.9% | 20.9% | 58.1% | -0.011R ± 0.258 |
| 2026 (test) | 38 | 18.4% | 31.6% | 50.0% | -0.146R ± 0.279 |
| **Test total** | **157 | 22.9% | 29.3% | 47.8% | -0.058R ± 0.148** |

### Momentum Continuation — ⚪ Research only

Signals 32,725; triggered 2,726; skipped as chasing 16,609; never triggered 13,390.

- Average result -0.11R is not positive
- 95% range includes zero or below
- Positive in 0 of 3 test years (needs 2)

| Period | Trades | Target first | Stop first | Expired | Avg net R (95% range) |
|---|---:|---:|---:|---:|---:|
| Discovery 2021–2023 | 890 | 24.6% | 23.8% | 51.6% | -0.012R ± 0.055 |
| 2024 (test) | 377 | 21.0% | 26.3% | 52.8% | -0.049R ± 0.084 |
| 2025 (test) | 178 | 20.8% | 24.2% | 55.1% | -0.123R ± 0.119 |
| 2026 (test) | 204 | 18.1% | 32.4% | 49.5% | -0.206R ± 0.111 |
| **Test total** | **759 | 20.2% | 27.4% | 52.4% | -0.109R ± 0.059** |

### Second-Entry Retest — ⚪ Research only

Signals 9,274; triggered 1,007; skipped as chasing 4,477; never triggered 3,790.

- Average result -0.13R is not positive
- 95% range includes zero or below
- Positive in 0 of 3 test years (needs 2)

| Period | Trades | Target first | Stop first | Expired | Avg net R (95% range) |
|---|---:|---:|---:|---:|---:|
| Discovery 2021–2023 | 494 | 24.5% | 18.4% | 57.1% | +0.024R ± 0.068 |
| 2024 (test) | 149 | 18.1% | 26.2% | 55.7% | -0.095R ± 0.130 |
| 2025 (test) | 103 | 18.4% | 20.4% | 61.2% | -0.120R ± 0.150 |
| 2026 (test) | 131 | 20.6% | 28.2% | 51.1% | -0.177R ± 0.138 |
| **Test total** | **383 | 19.1% | 25.3% | 55.6% | -0.130R ± 0.080** |

Research output, not investment advice. The replay tests each setup type without the scanner's extra ranking filters, and does not model earnings dates.
