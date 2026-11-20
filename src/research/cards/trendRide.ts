import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../../prismaClient';
import { PriceBar } from '../../corporateActions';
import { Candidate, ExitPlan, HarnessTrade } from '../harness';
import { momentumReturn, SeriesIndicators, topThreshold } from '../momentumPullback';
import { runSetupStudy, SetupCard, StudyResult } from '../studyRunner';
import { TEST_START } from '../studyData';

/**
 * Trend ride (reports/trend-ride-plan.md): strongest stocks, bought on a
 * pullback to the 20-day average, held for weeks with a trailing exit.
 *   npm run research:trend-ride
 */

export const TR_RULES = {
    topFraction: 0.1,
    minAtrPct: 2,
    maxAtrPct: 4,
    pullbackWindow: 10,
    minPullbackPct: 3,
    maxPullbackPct: 8,
    nearAverageAtr: 1,
    stopAtr: 1.5,
    trailSma: 20,
    horizon: 40,
    maxGapUpPct: 3,
    partialAtR: 2,
    partialFraction: 0.5,
} as const;

/** Placeholder exit for stock-days that only take part in the strength ranking. */
const RANK_ONLY: ExitPlan = { stopPct: null, targetPct: null, horizon: 1 };

/** Trend, volatility and pullback at the close of i (strength rank and market are checked elsewhere). */
export function trendRidePullback(bars: PriceBar[], ind: SeriesIndicators, i: number): { passes: boolean; atrPct: number } {
    const fail = { passes: false, atrPct: NaN };
    if (i < 200 || i < TR_RULES.pullbackWindow) return fail;
    const { close, low } = bars[i];
    const atr = ind.atr14[i];
    if (!(close > 0) || !(atr > 0) || !(ind.sma200[i] > 0) || !(ind.sma20[i] > 0)) return fail;
    const atrPct = (atr / close) * 100;
    if (atrPct < TR_RULES.minAtrPct || atrPct > TR_RULES.maxAtrPct) return { passes: false, atrPct };
    const uptrend = close > ind.sma50[i] && ind.sma50[i] > ind.sma200[i];
    let recentHigh = -Infinity;
    for (let k = i - TR_RULES.pullbackWindow; k < i; k += 1) recentHigh = Math.max(recentHigh, bars[k].close);
    const pullbackPct = (recentHigh / close - 1) * 100;
    const dipped = pullbackPct >= TR_RULES.minPullbackPct && pullbackPct <= TR_RULES.maxPullbackPct;
    const nearAverage = low <= ind.sma20[i] + TR_RULES.nearAverageAtr * atr;
    return { passes: uptrend && dipped && nearAverage, atrPct };
}

export function trendRideExit(bars: PriceBar[], i: number, atrPct: number, withPartial: boolean): ExitPlan {
    return {
        stopPct: TR_RULES.stopAtr * atrPct,
        targetPct: null,
        horizon: TR_RULES.horizon,
        maxGapUpPct: TR_RULES.maxGapUpPct,
        entryTrigger: bars[i].high,
        trailSma: TR_RULES.trailSma,
        ...(withPartial ? { partial: { atR: TR_RULES.partialAtR, fraction: TR_RULES.partialFraction } } : {}),
    };
}

/** Keep setups whose strength is in the top 10% of the whole day's universe (setups and rank-only rows). */
export function strengthPerDay(_date: string, candidates: Candidate[]): Candidate[] {
    const threshold = topThreshold(candidates.map(candidate => candidate.score), TR_RULES.topFraction);
    return candidates.filter(candidate => candidate.meta?.setup === 1 && candidate.score >= threshold);
}

export interface ExitProfile {
    n: number;
    avgWinner: number;
    avgLoser: number;
    avgSessions: number;
    byOutcome: Record<string, number>;
    partialFilledPct: number | null;
}

export function exitProfile(trades: HarnessTrade[]): ExitProfile {
    const mean = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);
    const byOutcome: Record<string, number> = {};
    for (const trade of trades) byOutcome[trade.outcome] = (byOutcome[trade.outcome] ?? 0) + 1;
    const withPartial = trades.filter(trade => trade.partialFilled !== undefined);
    return {
        n: trades.length,
        avgWinner: mean(trades.filter(t => t.netPct > 0).map(t => t.netPct)),
        avgLoser: mean(trades.filter(t => t.netPct <= 0).map(t => t.netPct)),
        avgSessions: mean(trades.map(t => t.exitIndex - t.entryIndex + 1)),
        byOutcome,
        partialFilledPct: withPartial.length ? (100 * withPartial.filter(t => t.partialFilled).length) / withPartial.length : null,
    };
}

function card(id: 'T1' | 'T2'): SetupCard {
    return {
        id: `trend-ride-${id.toLowerCase()}`,
        name: `Trend ride ${id}${id === 'T2' ? ' (half off at +2R, then stop to entry)' : ' (trailing exit only)'}`,
        plan: 'trend-ride-plan.md',
        thesis: 'The strongest stocks keep outperforming for months; buy them on a pullback to the 20-day average and let winners run with a trailing exit instead of a fixed target.',
        discoveryStart: '2021-01-05',
        testYears: ['2024', '2025', '2026'],
        rules: { topN: 3, maxPerSector: 2, maxPositions: 8, riskPerTrade: 0.01 },
        signal: (bars, ind, i, ctx) => {
            const strength = momentumReturn(bars, i);
            if (strength === null) return null;
            const check = trendRidePullback(bars, ind, i);
            const setup = check.passes && ctx.marketTrendUp?.(bars[i].date) === true;
            return setup
                ? { score: strength, exit: trendRideExit(bars, i, check.atrPct, id === 'T2'), meta: { setup: 1 } }
                : { score: strength, exit: RANK_ONLY, meta: { setup: 0 } };
        },
        perDay: strengthPerDay,
    };
}

const fmt = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
const profileRow = (label: string, p: ExitProfile) => p.n
    ? `| ${label} | ${p.n} | ${fmt(p.avgWinner)} | ${fmt(p.avgLoser)} | ${p.avgSessions.toFixed(1)} | ${['STOP', 'TRAIL', 'TIME'].map(k => p.byOutcome[k] ?? 0).join(' / ')} | ${p.partialFilledPct === null ? '—' : `${p.partialFilledPct.toFixed(1)}%`} |`
    : `| ${label} | 0 | — | — | — | — | — |`;

async function main(): Promise<void> {
    const results: Array<{ id: string; result: StudyResult }> = [];
    for (const id of ['T1', 'T2'] as const) results.push({ id, result: await runSetupStudy(card(id)) });
    const primary = [...results].sort((a, b) => b.result.discovery.dayClustered - a.result.discovery.dayClustered)[0];
    const lines = [
        '# Trend ride study',
        '',
        `Generated: ${new Date().toISOString()} · evaluation harness v3 · pre-registered plan: [\`trend-ride-plan.md\`](trend-ride-plan.md)`,
        '',
        `## Verdict: ${primary.result.passed ? '**PASS**' : '**FAIL**'}`,
        '',
        `Primary (better discovery day-clustered average): **${primary.id}**. Full checks in [\`trend-ride-${primary.id.toLowerCase()}.md\`](trend-ride-${primary.id.toLowerCase()}.md).`,
        '',
        '| Variant | Discovery trades | Discovery avg | Discovery day-clustered | Test trades | Test avg | Test day-clustered | Test win rate | All checks |',
        '|---|---:|---:|---:|---:|---:|---:|---:|:---:|',
        ...results.map(({ id, result }) => `| [${id}](trend-ride-${id.toLowerCase()}.md) | ${result.discovery.n} | ${fmt(result.discovery.avg)} | ${fmt(result.discovery.dayClustered)} | ${result.test.n} | ${fmt(result.test.avg)} | ${fmt(result.test.dayClustered)} | ${result.test.winRate.toFixed(1)}% | ${result.passed ? '✅' : '❌'} |`),
        '',
        '## Trade shape (descriptive, not pass rules)',
        '',
        '| Variant / period | Trades | Avg winner | Avg loser | Avg sessions held | Exits: stop / trail / time | Half sold at +2R |',
        '|---|---:|---:|---:|---:|---|---:|',
        ...results.flatMap(({ id, result }) => [
            profileRow(`${id} discovery`, exitProfile(result.trades.filter(t => t.signalDate < TEST_START))),
            profileRow(`${id} **test**`, exitProfile(result.trades.filter(t => t.signalDate >= TEST_START))),
        ]),
        '',
        primary.result.passed
            ? 'Per plan: add "Trend Ride" as a scanner setup type, On trial for live paper tracking (≥ 30 signal days before Trusted).'
            : 'Per plan: do not trade it and do not re-tune these rules on the test period.',
        '',
        'Research output, not investment advice.',
        '',
    ];
    writeFileSync(join('reports', 'trend-ride.md'), lines.join('\n'));
    console.log(`[TrendRide] Primary ${primary.id} → ${primary.result.passed ? 'PASS' : 'FAIL'}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[TrendRide] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
