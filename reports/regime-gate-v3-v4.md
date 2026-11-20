# Regime gate on Pre-Surge V3 and V4

2026-11-20. Gate rules from [`docs/TRADING_DESK_ARCHITECTURE.md`](../docs/TRADING_DESK_ARCHITECTURE.md) (committed before this check): GREEN = NIFTY above its 50-day average and ≥ 50% of the point-in-time top 500 above theirs; RED = NIFTY below its 200-day average or < 35%; otherwise AMBER. The regime is taken at the signal day's close (known in the evening). Trades are the executed plans from the existing V3/V4 backtests (`src/preSurgeV3IntradayBacktest.ts`, `src/preSurgeV4IntradayBacktest.ts`, re-run 2026-11-20; they match the 30 Aug results exactly). Script: `scratch/regimeGateV3V4.ts`.

| Strategy | Trades | Avg net | Win rate | Total | Without best 3 |
|---|---:|---:|---:|---:|---:|
| V3, all signals | 103 | +0.20% | 34% | +20.6% | −0.22% |
| **V3, GREEN only** | 80 | **+0.40%** | 34% | +31.9% | −0.11% |
| V3, AMBER | 11 | −0.20% | 45% | −2.2% | −2.12% |
| V3, RED | 12 | −0.75% | 25% | −9.0% | −2.10% |
| V4, all signals | 22 | +1.31% | 45% | +28.8% | −0.96% |
| **V4, GREEN only** | 15 | **+3.10%** | 47% | +46.5% | −0.04% |
| V4, AMBER | 4 | −3.96% | 25% | −15.8% | — |
| V4, RED | 3 | −0.60% | 67% | −1.8% | — |

By period:

| Strategy | 2021–2024 GREEN only | 2021–2024 all | 2025–2026 GREEN only | 2025–2026 all |
|---|---:|---:|---:|---:|
| V3 | +0.87% (58) | +0.59% (73) | **−0.85% (22)** | −0.74% (30) |
| V4 | +4.25% (12) | +2.99% (16) | **−1.50% (3)** | −3.16% (6) |

## Reading

- **The gate helps:** it removes the AMBER and RED trades, which lost money for both strategies, and doubles the average per trade for V3 and V4.
- **It does not fix 2025–2026:** trades taken in GREEN markets still lost in 2025–26 (V3 −0.85% over 22 trades, a 9% win rate). The recent weakness is not only about market conditions.
- **Still fragile:** without the 3 best trades, both are about zero even with the gate.
- Samples are small (V4: 15 trades in five years). Caveats: one look at the gate on already-studied data, regime computed from raw (unadjusted) closes, and backtests ending March 2026.

Verdict: keep the gate as a **risk filter** (it avoids losing conditions), not as proof of an edge. V3/V4 stay research only.
