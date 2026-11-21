# "151 Trading Strategies": equity baselines on NSE data

Generated: 2026-11-21T11:28:20.432Z · evaluation harness v3 · pre-registered plan: [`paper151-ratchet-plan.md`](paper151-ratchet-plan.md) · 13 trials in this run

"Kept" = every harness check passes on the test period (2024–2026), the test edge over the control group is positive (average and per day), and the discovery-period edge over the control is positive too.

| § | Strategy | Rule | Test trades | Test avg net | Test per-day avg | Excess vs control (test) | Excess vs control (discovery) | Checks | Kept |
|---|---|---|---:|---:|---:|---:|---:|:---:|:---:|
| 3.1 | [Price momentum (12-1)](paper151-momentum-ratchet.md) | ratchet | 2085 | -0.43% | -0.40% | +0.14% | -0.14% | ❌ | no |
| 3.4 | [Low-volatility anomaly](paper151-low-vol-ratchet.md) | ratchet | 970 | -0.29% | -0.35% | +0.15% | +0.28% | ❌ | no |
| 3.7 | [Residual momentum](paper151-residual-momentum-ratchet.md) | ratchet | 1828 | -0.25% | -0.19% | +0.29% | +0.04% | ❌ | no |
| 3.6 | [Multifactor (rank average)](paper151-multifactor-ratchet.md) | ratchet | 1372 | -0.19% | -0.23% | +0.27% | +0.26% | ❌ | no |
| 3.9 | [Industry-neutral mean-reversion](paper151-industry-reversion-ratchet.md) | ratchet | 1788 | -0.50% | -0.55% | -0.10% | -0.02% | ❌ | no |
| 4.4 | [Internal bar strength](paper151-ibs-ratchet.md) | ratchet | 1747 | -0.65% | -0.71% | -0.13% | -0.29% | ❌ | no |
| 3.11 | [Single moving average](paper151-ma-single-ratchet.md) | ratchet | 1415 | -0.69% | -0.76% | -0.18% | -0.20% | ❌ | no |
| 3.12 | [Two moving averages](paper151-ma-two-ratchet.md) | ratchet | 1433 | -0.58% | -0.52% | +0.02% | +0.06% | ❌ | no |
| 3.13 | [Three moving averages](paper151-ma-three-ratchet.md) | ratchet | 1540 | -0.28% | -0.32% | +0.17% | +0.05% | ❌ | no |
| 3.14 | [Pivot support/resistance](paper151-pivot-ratchet.md) | ratchet | 1433 | -0.46% | -0.51% | +0.06% | -0.14% | ❌ | no |
| 3.15 | [Donchian channel](paper151-donchian-ratchet.md) | ratchet | 1326 | -0.54% | -0.81% | -0.04% | -0.21% | ❌ | no |
| 3.17 | [Single-stock k-nearest neighbours](paper151-knn-ratchet.md) | ratchet | 2074 | -0.57% | -0.58% | +0.01% | -0.14% | ❌ | no |
| 4.1.2 | [Dual-momentum sector rotation](paper151-dual-momentum-ratchet.md) | ratchet | 409 | -0.77% | -0.93% | -0.45% | +0.40% | ❌ | no |

Nothing kept. Per plan, no strategy from the paper is added to the app as a signal; the code stays as a reusable baseline library.

With 13 trials, about one false pass is expected by chance at the usual 5% level; that is why a kept strategy still has to earn its record forward on paper.

Research output, not investment advice.
