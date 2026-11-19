import 'dotenv/config';
import { isUptrendDip } from '../uptrendDip';
import { runCli, SetupCard } from '../studyRunner';

/**
 * Harness check: the failed uptrend dip study (U1, 5-session hold) re-run
 * through evaluation harness v3. Not a new study; it confirms the harness
 * reaches the same verdict and adds the portfolio view.
 * Ranking (needed by the harness): deeper 5-session dip first.
 */
export const uptrendDipCheck: SetupCard = {
    id: 'harness-check-uptrend-dip',
    name: 'Harness check: uptrend dip (U1) under trader rules',
    plan: 'uptrend-dip-plan.md',
    thesis: 'Short-term reversal in stocks still above their 50-day average.',
    discoveryStart: '2021-01-05',
    testYears: ['2024', '2025', '2026'],
    signal: (bars, ind, i) => (isUptrendDip(bars, ind, i)
        ? { score: -(bars[i].close / bars[i - 5].close - 1), exit: { stopPct: null, targetPct: null, horizon: 5 } }
        : null),
};

if (require.main === module) {
    void runCli(uptrendDipCheck, 'harness-check', 'Re-run of a failed study to validate the harness; ranking by dip depth was added for the top-N rule.');
}
