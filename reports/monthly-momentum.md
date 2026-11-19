# Monthly momentum study (final test)

Generated: 2026-11-19T15:28:52.805Z · evaluation harness v3 · pre-registered plan: [`monthly-momentum-plan.md`](monthly-momentum-plan.md)

## Verdict: **FAIL**

Primary (better discovery per-month average): **M1**. Full checks in [`monthly-momentum-m1.md`](monthly-momentum-m1.md).

| Variant | Discovery trades | Discovery per-month avg | Discovery excess vs control | Test trades | Test avg | Test per-month avg | Test excess vs control | All checks |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| [M1](monthly-momentum-m1.md) | 514 | +2.62% | +0.80% | 473 | +1.08% | +1.31% | +1.04% | ❌ |
| [M2](monthly-momentum-m2.md) | 430 | +1.30% | +0.97% | 304 | +1.11% | +1.43% | +0.69% | ❌ |

Per plan: no re-tuning on the test period. The agreed stopping rule applies: prediction work stops.

Note: the control group holds 21 sessions from each rebalance day; basket positions hold until the next month-end (19–23 sessions).

Research output, not investment advice.
