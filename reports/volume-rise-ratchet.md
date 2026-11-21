# Rising volume before the move + ratcheting stop

Generated: 2026-11-21T11:16:24.718Z · evaluation harness v3 · pre-registered plan: [`volume-rise-ratchet-plan.md`](volume-rise-ratchet-plan.md)

## Verdict: **FAIL**

Primary (best discovery per-day average): **V3** — V1 + price up 0–3% over the 3 sessions (move not started yet). Full checks in [`volume-ratchet-v3.md`](volume-ratchet-v3.md).

## Step A: does rising volume come before the gainers?

Gainer = closes ≥ 5% higher 5 sessions later. Clue = volume rising 3 sessions in a row with the last ≥ 1.5× its 20-day average, seen at the close before.

| Period | Stock-days | Share that became gainers | Days with the clue | Share of those that became gainers | Lift |
|---|---:|---:|---:|---:|---:|
| Discovery 2021–23 | 4,59,250 | 18.2% | 29,906 | 20.2% | 1.11× |
| Test 2024–26 | 3,47,329 | 15.6% | 21,231 | 17.6% | 1.13× |

Lift above 1 means gainers are more common after the clue. It does not say whether the move is up only: big down-moves can follow too (Step B decides with real trades).

## Step B: real trades

Exit: stop −5.5%, target +8.5%; after a high of +3.5% the stop moves to the buy price, after +4.5% to +2.5%, after +7% to +4.75% (from the next session); sell at the close of session 15. 0.4% costs.

| Entry | Discovery trades | Discovery per-day avg | Test trades | Test win rate | Test avg net | Test per-day avg | Excess vs control (test) | All checks |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| V1 | 2059 | -0.40% | 2013 | 39.1% | -1.02% | -1.06% | -0.46% | ❌ |
| V2 | 2093 | -0.44% | 2018 | 40.7% | -0.90% | -0.94% | -0.34% | ❌ |
| V3 (primary) | 1560 | -0.25% | 1506 | 42.0% | -0.89% | -0.99% | -0.37% | ❌ |
| V4 | 2073 | -0.34% | 1982 | 42.2% | -0.76% | -0.76% | -0.19% | ❌ |
| V3 with the old +5/−2.5 exit | 1946 | -0.50% | 1888 | 28.7% | -0.83% | -0.81% | -0.26% | ❌ |

Research output, not investment advice.
