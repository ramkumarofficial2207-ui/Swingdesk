import 'dotenv/config';
import prisma from '../../prismaClient';
import { ExitPlan } from '../harness';
import { momentumReturn } from '../momentumPullback';
import { runSetupStudy, SetupCard } from '../studyRunner';
import { strengthPerDay, TR_RULES, trendRidePullback } from './trendRide';
import { exitProfile } from './trendRide';
import { TEST_START } from '../studyData';

/**
 * Exploration (not pre-registered; the 2024–26 test years were already seen
 * in trend-ride). Same picks as trend ride, but: stop 1.5 × ATR, target +5%,
 * hold up to 20 sessions, no trailing exit.
 *   npm run research:trend-ride-hold20
 */

const RANK_ONLY: ExitPlan = { stopPct: null, targetPct: null, horizon: 1 };

export const hold20Card: SetupCard = {
    id: 'trend-ride-hold20',
    name: 'Trend ride picks, +5% target, 20-session hold (exploration)',
    plan: 'trend-ride-plan.md',
    thesis: 'Same picks as trend ride; give trades 20 sessions to reach +5% instead of a trailing exit that sold after about 5.',
    discoveryStart: '2021-01-05',
    testYears: ['2024', '2025', '2026'],
    rules: { topN: 3, maxPerSector: 2, maxPositions: 8, riskPerTrade: 0.01 },
    signal: (bars, ind, i, ctx) => {
        const strength = momentumReturn(bars, i);
        if (strength === null) return null;
        const check = trendRidePullback(bars, ind, i);
        if (!(check.passes && ctx.marketTrendUp?.(bars[i].date) === true)) return { score: strength, exit: RANK_ONLY, meta: { setup: 0 } };
        return {
            score: strength,
            exit: { stopPct: TR_RULES.stopAtr * check.atrPct, targetPct: 5, horizon: 20, maxGapUpPct: TR_RULES.maxGapUpPct, entryTrigger: bars[i].high },
            meta: { setup: 1 },
        };
    },
    perDay: strengthPerDay,
};

async function main(): Promise<void> {
    const result = await runSetupStudy(hold20Card, 'exploration', 'Not pre-registered: the test years were already seen in trend-ride. Treat as a hint for paper trading, not proof.');
    for (const [label, list] of [['discovery', result.trades.filter(t => t.signalDate < TEST_START)], ['test', result.trades.filter(t => t.signalDate >= TEST_START)]] as const) {
        const p = exitProfile(list);
        const hit = list.filter(t => t.outcome === 'TARGET');
        const sessions = (ts: typeof list) => ts.length ? (ts.reduce((s, t) => s + t.exitIndex - t.entryIndex + 1, 0) / ts.length).toFixed(1) : '—';
        console.log(`[Hold20] ${label}: n=${p.n} target=${hit.length} (${(100 * hit.length / Math.max(1, p.n)).toFixed(1)}%, avg ${sessions(hit)} sessions) stop=${p.byOutcome.STOP ?? 0} time=${p.byOutcome.TIME ?? 0} avgWin=${p.avgWinner.toFixed(2)} avgLoss=${p.avgLoser.toFixed(2)} avgHeld=${p.avgSessions.toFixed(1)}`);
    }
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[Hold20] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
