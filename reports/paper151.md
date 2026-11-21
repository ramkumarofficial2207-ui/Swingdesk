# "151 Trading Strategies": equity baselines on NSE data

Generated: 2026-11-21T11:02:55.593Z · evaluation harness v3 · pre-registered plan: [`paper151-plan.md`](paper151-plan.md) · 26 trials in this run

"Kept" = every harness check passes on the test period (2024–2026), the test edge over the control group is positive (average and per day), and the discovery-period edge over the control is positive too.

| § | Strategy | Rule | Test trades | Test avg net | Test per-day avg | Excess vs control (test) | Excess vs control (discovery) | Checks | Kept |
|---|---|---|---:|---:|---:|---:|---:|:---:|:---:|
| 3.1 | [Price momentum (12-1)](paper151-momentum-own.md) | own | 1511 | +0.33% | +0.31% | +0.22% | +1.15% | ❌ | no |
| 3.1 | [Price momentum (12-1)](paper151-momentum-swing.md) | 5% swing | 2133 | -0.46% | -0.46% | +0.12% | -0.26% | ❌ | no |
| 3.4 | [Low-volatility anomaly](paper151-low-vol-own.md) | own | 183 | +0.74% | +0.72% | +0.92% | -5.23% | ❌ | no |
| 3.4 | [Low-volatility anomaly](paper151-low-vol-swing.md) | 5% swing | 1479 | -0.46% | -0.39% | +0.07% | +0.23% | ❌ | no |
| 3.7 | [Residual momentum](paper151-residual-momentum-own.md) | own | 1399 | +0.07% | +0.07% | -0.02% | +0.36% | ❌ | no |
| 3.7 | [Residual momentum](paper151-residual-momentum-swing.md) | 5% swing | 2119 | -0.46% | -0.46% | +0.11% | -0.01% | ❌ | no |
| 3.6 | [Multifactor (rank average)](paper151-multifactor-own.md) | own | 1403 | -0.18% | -0.20% | -0.29% | -0.18% | ❌ | no |
| 3.6 | [Multifactor (rank average)](paper151-multifactor-swing.md) | 5% swing | 1927 | -0.46% | -0.49% | +0.08% | +0.06% | ❌ | no |
| 3.9 | [Industry-neutral mean-reversion](paper151-industry-reversion-own.md) | own | 3534 | -0.14% | -0.14% | +0.14% | +0.32% | ❌ | no |
| 3.9 | [Industry-neutral mean-reversion](paper151-industry-reversion-swing.md) | 5% swing | 2121 | -0.69% | -0.69% | -0.16% | -0.01% | ❌ | no |
| 4.4 | [Internal bar strength](paper151-ibs-own.md) | own | 3555 | -0.56% | -0.56% | -0.02% | +0.04% | ❌ | no |
| 4.4 | [Internal bar strength](paper151-ibs-swing.md) | 5% swing | 2077 | -0.47% | -0.49% | +0.09% | -0.28% | ❌ | no |
| 3.11 | [Single moving average](paper151-ma-single-own.md) | own | 1179 | -0.30% | -0.38% | -0.20% | -0.70% | ❌ | no |
| 3.11 | [Single moving average](paper151-ma-single-swing.md) | 5% swing | 1893 | -0.66% | -0.69% | -0.10% | -0.00% | ❌ | no |
| 3.12 | [Two moving averages](paper151-ma-two-own.md) | own | 1518 | -0.38% | -0.43% | -0.55% | -0.97% | ❌ | no |
| 3.12 | [Two moving averages](paper151-ma-two-swing.md) | 5% swing | 1763 | -0.58% | -0.55% | +0.02% | +0.12% | ❌ | no |
| 3.13 | [Three moving averages](paper151-ma-three-own.md) | own | 1571 | -0.40% | -0.51% | -0.64% | -0.96% | ❌ | no |
| 3.13 | [Three moving averages](paper151-ma-three-swing.md) | 5% swing | 1964 | -0.57% | -0.59% | -0.03% | +0.04% | ❌ | no |
| 3.14 | [Pivot support/resistance](paper151-pivot-own.md) | own | 2426 | -0.30% | -0.29% | +0.02% | -0.51% | ❌ | no |
| 3.14 | [Pivot support/resistance](paper151-pivot-swing.md) | 5% swing | 1927 | -0.61% | -0.66% | -0.06% | +0.00% | ❌ | no |
| 3.15 | [Donchian channel](paper151-donchian-own.md) | own | 468 | +0.79% | +0.89% | +0.45% | -0.76% | ❌ | no |
| 3.15 | [Donchian channel](paper151-donchian-swing.md) | 5% swing | 1866 | -0.69% | -0.69% | -0.13% | -0.13% | ❌ | no |
| 3.17 | [Single-stock k-nearest neighbours](paper151-knn-own.md) | own | 1407 | +0.21% | +0.33% | +0.42% | +0.33% | ❌ | no |
| 3.17 | [Single-stock k-nearest neighbours](paper151-knn-swing.md) | 5% swing | 2133 | -0.56% | -0.56% | +0.01% | -0.25% | ❌ | no |
| 4.1.2 | [Dual-momentum sector rotation](paper151-dual-momentum-own.md) | own | 835 | -0.27% | +0.09% | -0.57% | +2.01% | ❌ | no |
| 4.1.2 | [Dual-momentum sector rotation](paper151-dual-momentum-swing.md) | 5% swing | 635 | -0.67% | -0.68% | -0.19% | +0.01% | ❌ | no |

Nothing kept. Per plan, no strategy from the paper is added to the app as a signal; the code stays as a reusable baseline library.

With 26 trials, about one false pass is expected by chance at the usual 5% level; that is why a kept strategy still has to earn its record forward on paper.

Research output, not investment advice.
