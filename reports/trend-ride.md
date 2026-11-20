# Trend ride study

Generated: 2026-11-20T17:32:31.159Z · evaluation harness v3 · pre-registered plan: [`trend-ride-plan.md`](trend-ride-plan.md)

## Verdict: **FAIL**

Primary (better discovery day-clustered average): **T1**. Full checks in [`trend-ride-t1.md`](trend-ride-t1.md).

| Variant | Discovery trades | Discovery avg | Discovery day-clustered | Test trades | Test avg | Test day-clustered | Test win rate | All checks |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| [T1](trend-ride-t1.md) | 233 | +0.82% | +0.82% | 231 | -0.44% | -0.44% | 28.1% | ❌ |
| [T2](trend-ride-t2.md) | 233 | +0.52% | +0.52% | 231 | -0.30% | -0.28% | 29.9% | ❌ |

## Trade shape (descriptive, not pass rules)

| Variant / period | Trades | Avg winner | Avg loser | Avg sessions held | Exits: stop / trail / time | Half sold at +2R |
|---|---:|---:|---:|---:|---|---:|
| T1 discovery | 233 | +9.58% | -2.65% | 7.6 | 24 / 202 / 7 | — |
| T1 **test** | 231 | +4.68% | -2.44% | 5.5 | 25 / 205 / 1 | — |
| T2 discovery | 233 | +7.59% | -2.58% | 7.6 | 28 / 198 / 7 | 18.0% |
| T2 **test** | 231 | +4.74% | -2.45% | 5.4 | 31 / 199 / 1 | 13.4% |

Per plan: do not trade it and do not re-tune these rules on the test period.

Research output, not investment advice.
