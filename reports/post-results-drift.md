# Post-results drift study

Generated: 2026-11-19T13:16:27.935Z

Pre-registered plan: [`post-results-drift-plan.md`](post-results-drift-plan.md) (committed before this run). Signal at the close of E+1, entry at the open of E+2; stop 1.5 × ATR, target 2 × stop, 15 sessions, 40 bps costs.

Results events: 34,254; with the signal day in the top-500 universe (from 2021-01-05): 12,003; passing the signal rules: 1,167; skipped for a >3% gap: 45; traded: 1,082.
Rule failures among universe events (an event can fail several): reaction 9,951, close 7,111, volume 4,642, atr 1,328.

## Verdict: **FAIL**

Primary variant (better discovery result): **D2 — Above 50-day average before the event**.

| Pre-registered rule | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 394 | ✅ |
| Average net R above 0 | -0.015R | ❌ |
| Lower end of 95% range above 0 | -0.143R | ❌ |
| Positive in at least 2 of 3 test years | 1 of 3 | ❌ |

Per plan: do not trade it and do not re-tune these rules on the test period.

## Both variants

| Variant | Period | Trades | Target first | Stop first | Expired | Avg net R (95% range) | +5% first (test) |
|---|---|---:|---:|---:|---:|---:|---:|
| D1: No extra rule | Discovery | 466 | 30.9% | 43.8% | 25.3% | +0.192R ± 0.120 | |
| | **Test** | **613 | 24.0% | 51.1% | 25.0% | -0.016R ± 0.103** | 49.3% |
| D2: Above 50-day average before the event | Discovery | 326 | 35.3% | 39.9% | 24.8% | +0.320R ± 0.147 | |
| | **Test** | **394 | 23.6% | 51.0% | 25.4% | -0.015R ± 0.128** | 49.5% |

## D2 by year

| Year | Trades | Target first | Stop first | Expired | Avg net R (95% range) |
|---|---:|---:|---:|---:|---:|
| 2021 | 114 | 38.6% | 41.2% | 20.2% | +0.348R ± 0.253 |
| 2022 | 83 | 33.7% | 47.0% | 19.3% | +0.194R ± 0.298 |
| 2023 | 129 | 33.3% | 34.1% | 32.6% | +0.376R ± 0.226 |
| 2024 (test) | 116 | 30.2% | 53.4% | 16.4% | +0.083R ± 0.259 |
| 2025 (test) | 137 | 19.7% | 49.6% | 30.7% | -0.066R ± 0.204 |
| 2026 (test) | 141 | 22.0% | 50.4% | 27.7% | -0.047R ± 0.210 |

Research output, not investment advice.
