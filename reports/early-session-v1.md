# Early-session study, Track A (v1 rules)

Generated: 2026-11-20T15:12:47.671Z · plan: [`early-session-plan.md`](early-session-plan.md) · 718 sessions to 2026-11-19, 2 skipped for data coverage below 80% · costs 0.2% round trip.

## Verdict: **FAIL**

| Rule (test period) | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 16 | ❌ |
| Average net above 0 | -0.312% | ❌ |
| Lower end of 95% range above 0 | -0.770% | ❌ |
| Day-clustered average above 0 | -0.320% | ❌ |
| Positive without the 5 best days | -0.762% | ❌ |
| Positive in 2025 | -0.431% | ❌ |
| Positive in 2026 | -0.194% | ❌ |
| Beats all three controls (average excess above 0) | -0.049% / +0.006% / +0.002% | ❌ |
| Portfolio max drawdown ≤ 15% | 1.0% | ✅ |

## Discovery 2023-12 → 2024-12

| Group | Trades | Days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| v1 rules (volume + sector + breakout), top 5 a day | 8 | 8 | 25.0% | -0.372% ± 0.548 | -0.372% | -1.115% |
| Control 1: volume + breakout, any sector | 236 | 139 | 38.6% | -0.227% ± 0.129 | -0.196% | -0.273% |
| Control 2: clustered sector + breakout, any volume | 70 | 38 | 24.3% | -0.399% ± 0.195 | -0.413% | -0.507% |
| Control 3: every opening-range breakout | 3,400 | 241 | 35.1% | -0.252% ± 0.031 | -0.226% | -0.256% |

v1 exits: target 1, stop 4, time 3. Portfolio (0.5% risk a trade, ≤ 20% a position): total -0.595%, max drawdown 0.8% over 8 trading days.

| v1 excess vs | Trades | Avg excess | Day-clustered excess |
|---|---:|---:|---:|
| Control 1: volume + breakout, any sector | 8 | -0.055% | -0.055% |
| Control 2: clustered sector + breakout, any volume | 8 | -0.024% | -0.024% |
| Control 3: every opening-range breakout | 8 | -0.104% | -0.104% |

## **Test 2025 → 2026**

| Group | Trades | Days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| v1 rules (volume + sector + breakout), top 5 a day | 16 | 15 | 31.3% | -0.312% ± 0.457 | -0.320% | -0.762% |
| Control 1: volume + breakout, any sector | 392 | 226 | 38.8% | -0.191% ± 0.096 | -0.152% | -0.214% |
| Control 2: clustered sector + breakout, any volume | 135 | 74 | 31.9% | -0.370% ± 0.149 | -0.302% | -0.437% |
| Control 3: every opening-range breakout | 5,898 | 437 | 36.8% | -0.234% ± 0.023 | -0.214% | -0.236% |

v1 exits: target 0, stop 6, time 10. Portfolio (0.5% risk a trade, ≤ 20% a position): total -0.997%, max drawdown 1.0% over 15 trading days.

| v1 excess vs | Trades | Avg excess | Day-clustered excess |
|---|---:|---:|---:|
| Control 1: volume + breakout, any sector | 16 | -0.049% | -0.052% |
| Control 2: clustered sector + breakout, any volume | 16 | +0.006% | +0.007% |
| Control 3: every opening-range breakout | 16 | +0.002% | -0.014% |

## v1 by year

| Group | Trades | Days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |
|---|---:|---:|---:|---:|---:|---:|
| 2024 | 8 | 8 | 25.0% | -0.372% ± 0.548 | -0.372% | -1.115% |
| 2025 | 8 | 7 | 25.0% | -0.431% ± 0.655 | -0.464% | -1.367% |
| 2026 | 8 | 8 | 37.5% | -0.194% ± 0.673 | -0.194% | -1.261% |

Known limit: Dhan has no history for stocks that stopped trading, so absolute returns are optimistic; the controls share that bias. Research output, not investment advice.
