# Paper entries with the ratcheting-stop exit: pre-registration

Committed **before** running. Follow-up to [`volume-rise-ratchet.md`](volume-rise-ratchet.md): the user's ratcheting-stop exit is applied to the 13 equity entries from [`paper151-plan.md`](paper151-plan.md). Entries, universe, ranking, trader rules (top 3 per day, ≤ 2 per industry, ≤ 15 open), costs and periods are exactly as in the "5% swing rule" run of that plan. Only the exit changes:

| Exit | Rule |
|---|---|
| Stop | −5.5% |
| Target | +8.5% |
| Ratchet | After a high of +3.5% the stop moves to the buy price; after +4.5% to +2.5%; after +7% to +4.75% (each from the next session) |
| Time | Close of session 15 |
| Gap | Skip if the next open is > 3% above the signal close |

Control: all universe stocks on the same days with the same exit (stocks with an industry label only for INDUSTRY_REVERSION and DUAL_MOMENTUM).

**Kept** = every harness check and both control checks pass on the test period (2024–2026), and the discovery-period excess over the control is > 0 (same rule as `paper151-plan.md`). 13 trials; kept → Auto Paper forward tracking only. Expectation stated in advance: the same entries beat random stocks by at most +0.12% per trade under the old exit, while this exit loses about 0.5% per trade on random stocks, so a pass is unlikely.

Run once: `npm run research:paper151 -- --ratchet`.
