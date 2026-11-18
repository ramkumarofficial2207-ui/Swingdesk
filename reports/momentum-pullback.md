# Momentum pullback study

Generated: 2026-11-18T21:10:18.251Z

Pre-registered plan: [`momentum-pullback-plan.md`](momentum-pullback-plan.md) (committed before this run). Signals known at the close, filled at the next open; stop 1.5 × ATR, target 2 × stop, 10 sessions, 40 bps costs. Non-overlapping trades per stock.

Pullback signals found: 4,873; of which momentum leaders (top 20%): 1,132.

## Verdict: **FAIL**

Primary variant (better discovery result): **P1 — No market filter**.

| Pre-registered rule | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 482 | ✅ |
| Average net R above 0 | -0.109R | ❌ |
| Lower end of 95% range above 0 | -0.228R | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |

Per plan: do not trade it and do not re-tune these rules on the test period.

**Deviation from plan (disclosed):** the discovery period included 27 trades from late 2020 (the plan states discovery starts 2021-01-05). This only affects which variant is primary; both variants fail on the test period, so the verdict is unchanged.

## Both variants

| Variant | Period | Trades | Target first | Stop first | Expired | Avg net R (95% range) | +5% first (test) |
|---|---|---:|---:|---:|---:|---:|---:|
| P1: No market filter | Discovery | 400 | 25.8% | 39.8% | 34.5% | +0.060R ± 0.240 | |
| | **Test** | **482 | 17.4% | 46.5% | 36.1% | -0.109R ± 0.119** | 40.2% |
| P2: NIFTY > 50 > 200-day | Discovery | 258 | 27.9% | 42.2% | 29.8% | -0.002R ± 0.357 | |
| | **Test** | **224 | 18.8% | 50.0% | 31.3% | -0.139R ± 0.159** | 36.6% |

## P1 by year

| Year | Trades | Target first | Stop first | Expired | Avg net R (95% range) |
|---|---:|---:|---:|---:|---:|
| 2020 | 27 | 44.4% | 37.0% | 18.5% | -1.044R ± 3.135 |
| 2021 | 73 | 27.4% | 39.7% | 32.9% | +0.181R ± 0.298 |
| 2022 | 107 | 22.4% | 47.7% | 29.9% | -0.012R ± 0.239 |
| 2023 | 193 | 24.4% | 35.8% | 39.9% | +0.208R ± 0.169 |
| 2024 (test) | 127 | 20.5% | 51.2% | 28.3% | -0.062R ± 0.220 |
| 2025 (test) | 194 | 16.5% | 39.7% | 43.8% | -0.046R ± 0.160 |
| 2026 (test) | 161 | 16.1% | 50.9% | 32.9% | -0.221R ± 0.243 |

Research output, not investment advice.
