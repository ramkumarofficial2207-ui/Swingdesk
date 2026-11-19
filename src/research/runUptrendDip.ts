import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../prismaClient';
import { loadAdjustedDailySeries } from '../adjustedCandles';
import { nonOverlapping, TradeLabel } from './fivePercentStudy';
import { computeSeriesIndicators } from './momentumPullback';
import { loadUniverse, TEST_START } from './studyData';
import { DipTrade, isUptrendDip, pctStats, PctStats, u1Trade, u2Trade } from './uptrendDip';

/**
 * npm run research:uptrend-dip
 * Implements reports/uptrend-dip-plan.md exactly. Writes reports/uptrend-dip.md.
 */

const DISCOVERY_START = '2021-01-05';
const DISCOVERY_END = '2023-12-29';
const TEST_YEARS = ['2024', '2025', '2026'];

interface Row { symbol: string; index: number; date: string; label: TradeLabel; netPct: number }

const fmt = (value: number, digits = 2) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
const cells = (s: PctStats) => s.n
    ? `${s.n.toLocaleString('en-IN')} | ${s.days.toLocaleString('en-IN')} | ${s.winRate.toFixed(1)}% | ${fmt(s.avg)} ± ${s.ci.toFixed(2)} | ${fmt(s.dayClustered)}`
    : '0 | 0 | — | — | —';

async function main(): Promise<void> {
    const universe = await loadUniverse();
    const u1: Row[] = [];
    const u2: Row[] = [];
    let signals = 0;
    for (const [symbol, eligible] of universe) {
        const bars = (await loadAdjustedDailySeries(symbol)).bars;
        if (bars.length < 60) continue;
        const ind = computeSeriesIndicators(bars);
        for (let i = 50; i < bars.length - 1; i += 1) {
            const date = bars[i].date;
            if (date < DISCOVERY_START || (date > DISCOVERY_END && date < TEST_START) || !eligible.has(date)) continue;
            if (!isUptrendDip(bars, ind, i)) continue;
            signals += 1;
            const push = (list: Row[], trade: DipTrade | null) => { if (trade) list.push({ symbol, index: i, date, label: trade.label, netPct: trade.netPct }); };
            push(u1, u1Trade(bars, i));
            push(u2, u2Trade(bars, ind, i));
        }
    }

    const variants = [
        { id: 'U1', label: 'Hold 5 sessions, no stop', rows: u1 },
        { id: 'U2', label: '1.5 × ATR stop, 2 × stop target, 10 sessions', rows: u2 },
    ].map(variant => {
        const kept = nonOverlapping(variant.rows);
        const years = [...new Set(kept.map(row => row.date.slice(0, 4)))].sort();
        const outcomes = (rows: Row[]) => ({
            target: rows.filter(row => row.label.outcome === 'TARGET').length,
            stop: rows.filter(row => row.label.outcome === 'STOP').length,
        });
        const test = kept.filter(row => row.date >= TEST_START);
        return {
            ...variant,
            discovery: pctStats(kept.filter(row => row.date < TEST_START)),
            test: pctStats(test),
            testOutcomes: outcomes(test),
            worst: test.length ? Math.min(...test.map(row => row.netPct)) : 0,
            yearly: years.map(year => ({ year, stats: pctStats(kept.filter(row => row.date.startsWith(year))) })),
        };
    });
    const primary = [...variants].sort((left, right) => right.discovery.avg - left.discovery.avg)[0];
    const positiveYears = primary.yearly.filter(item => TEST_YEARS.includes(item.year) && item.stats.n > 0 && item.stats.avg > 0).length;
    const checks = [
        { rule: 'At least 100 test trades', pass: primary.test.n >= 100, value: primary.test.n.toLocaleString('en-IN') },
        { rule: 'Average net return above 0', pass: primary.test.avg > 0, value: fmt(primary.test.avg) },
        { rule: 'Lower end of 95% range above 0', pass: primary.test.avg - primary.test.ci > 0, value: fmt(primary.test.avg - primary.test.ci) },
        { rule: 'Day-clustered average above 0', pass: primary.test.dayClustered > 0, value: fmt(primary.test.dayClustered) },
        { rule: 'Positive in at least 2 of 3 test years', pass: positiveYears >= 2, value: `${positiveYears} of 3` },
    ];
    const passed = checks.every(check => check.pass);
    const header = '| Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered avg |';
    const lines = [
        '# Uptrend dip study',
        '',
        `Generated: ${new Date().toISOString()}`,
        '',
        'Pre-registered plan: [`uptrend-dip-plan.md`](uptrend-dip-plan.md) (committed before this run). Signal at the close: down ≥ 3% today, down ≥ 5% over 5 sessions, close above the 50-day average. Entry at the next open; 0.4% round-trip costs; one trade per stock at a time.',
        '',
        `Signals in the universe (discovery + test): ${signals.toLocaleString('en-IN')}.`,
        '',
        `## Verdict: ${passed ? '**PASS**' : '**FAIL**'}`,
        '',
        `Primary variant (better discovery average): **${primary.id} — ${primary.label}**.`,
        '',
        '| Pre-registered rule | Result | Pass |',
        '|---|---:|:---:|',
        ...checks.map(check => `| ${check.rule} | ${check.value} | ${check.pass ? '✅' : '❌'} |`),
        '',
        passed
            ? 'Per plan: add "Uptrend Dip" as a scanner setup type, On trial for live paper tracking. Not a basis for real money until it earns Trusted.'
            : 'Per plan: do not trade it and do not re-tune these rules on the test period.',
        '',
        '## Both variants',
        '',
        `| Variant | Period ${header}`,
        '|---|---|---:|---:|---:|---:|---:|',
        ...variants.flatMap(variant => [
            `| ${variant.id}: ${variant.label} | Discovery | ${cells(variant.discovery)} |`,
            `| | **Test** | **${cells(variant.test)}** |`,
        ]),
        '',
        ...variants.filter(variant => variant.id === 'U2').map(variant => `U2 test exits: target first ${variant.testOutcomes.target}, stop first ${variant.testOutcomes.stop}, time exit ${variant.test.n - variant.testOutcomes.target - variant.testOutcomes.stop}.`),
        ...variants.map(variant => `${variant.id} worst single test trade: ${fmt(variant.worst)}.`),
        '',
        `## ${primary.id} by year`,
        '',
        `| Year ${header}`,
        '|---|---:|---:|---:|---:|---:|',
        ...primary.yearly.map(item => `| ${item.year}${TEST_YEARS.includes(item.year) ? ' (test)' : ''} | ${cells(item.stats)} |`),
        '',
        'Research output, not investment advice.',
        '',
    ];
    mkdirSync('reports', { recursive: true });
    const path = join('reports', 'uptrend-dip.md');
    writeFileSync(path, lines.join('\n'));
    console.log(`[Dip] Primary ${primary.id}: test n=${primary.test.n} avg=${fmt(primary.test.avg)} ±${primary.test.ci.toFixed(2)} → ${passed ? 'PASS' : 'FAIL'}. Report: ${path}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[Dip] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
