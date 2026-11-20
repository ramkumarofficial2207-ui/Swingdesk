# Accumulation then breakout

Generated: 2026-11-20T18:59:12.939Z · evaluation harness v3 · pre-registered plan: [`accumulation-breakout-plan.md`](accumulation-breakout-plan.md)

## Verdict: **FAIL**

Primary (better discovery day-clustered average of A and B): **B**. Full checks in [`accumulation-b.md`](accumulation-b.md).

| Variant | Discovery trades | Discovery avg | Discovery day-clustered | Discovery excess vs random | Test trades | Test avg | Test day-clustered | Test excess vs random | All checks |
|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| [A](accumulation-a.md) | 153 | -0.49% | -0.46% | -0.19% | 107 | -0.76% | -0.59% | -0.11% | ❌ |
| [B](accumulation-b.md) | 64 | -0.05% | +0.16% | -0.14% | 41 | -0.37% | -0.30% | +0.32% | ❌ |
| [W](accumulation-w.md) (measurement) | 527 | -0.23% | -0.31% | -0.11% | 349 | -0.67% | -0.37% | +0.13% | — |
| [R](accumulation-r.md) (measurement) | 1,31,011 | -0.41% | -0.43% | -0.14% | 1,23,565 | -0.53% | -0.62% | -0.04% | — |

## Does the watchlist beat random stocks? (+5% / −2.5% / 15 sessions)

| Group / period | Trades | Hit +5% first | Stopped | Time exit | Avg winner | Avg loser | Avg days |
|---|---:|---:|---:|---:|---:|---:|---:|
| Random (all stocks), discovery | 1,31,011 | 32.8% | 66.0% | 1.2% | +4.60% | -2.94% | 2.9 |
| Random (all stocks), **test** | 1,23,565 | 31.4% | 67.5% | 1.1% | +4.63% | -2.96% | 2.9 |
| Watchlist (all days), discovery | 527 | 34.3% | 62.6% | 3.0% | +4.51% | -2.87% | 4.1 |
| Watchlist (all days), **test** | 349 | 29.2% | 68.2% | 2.6% | +4.49% | -3.01% | 4.0 |
| A: early dip, discovery | 153 | 30.7% | 65.4% | 3.9% | +4.47% | -2.83% | 4.3 |
| A: early dip, **test** | 107 | 29.9% | 68.2% | 1.9% | +4.50% | -3.10% | 3.9 |
| B: first surge, discovery | 64 | 35.9% | 57.8% | 6.3% | +4.19% | -2.94% | 4.7 |
| B: first surge, **test** | 41 | 29.3% | 65.9% | 4.9% | +4.52% | -2.90% | 4.6 |

Watchlist size: 776 signal days with at least one stock, 2.3 stocks on average, largest 14.

With +5% / −2.5% and 0.4% costs, a strategy needs about 40% of trades hitting +5% to break even.

Per plan: do not trade it and do not re-tune on the test period. If W beats R while A and B fail, the stock selection works and the entry timing is the problem.

Research output, not investment advice.
