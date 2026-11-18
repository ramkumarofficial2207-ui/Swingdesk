import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../prismaClient';
import { loadAdjustedDailySeries } from '../adjustedCandles';
import { nonOverlapping, OutcomeStats, simulateFrom, summarize, TradeLabel } from './fivePercentStudy';
import { computeSeriesIndicators, momentumReturn, MP_RULES, pullbackSignal, topThreshold } from './momentumPullback';
import { loadNiftyContext, loadUniverse, pct, r, statsCells, TEST_START } from './studyData';

/**
 * npm run research:momentum-pullback
 * Implements reports/momentum-pullback-plan.md exactly. Writes reports/momentum-pullback.md.
 */

interface Candidate {
    symbol: string;
    index: number;
    date: string;
    momentum: number;
    niftyGreen: boolean;
    label: TradeLabel;
    reachedGoalFirst: boolean;
}

const TEST_YEARS = ['2024', '2025', '2026'];

async function main(): Promise<void> {
    console.log('[Momentum] Loading universe…');
    const universe = await loadUniverse();
    const nifty = await loadNiftyContext();
    const momentumByDate = new Map<string, number[]>();
    const candidates: Candidate[] = [];

    let processed = 0;
    for (const [symbol, eligibleDates] of universe) {
        const bars = (await loadAdjustedDailySeries(symbol)).bars;
        const ind = computeSeriesIndicators(bars);
        for (let i = 200; i < bars.length - 1; i += 1) {
            const date = bars[i].date;
            if (!eligibleDates.has(date)) continue;
            const momentum = momentumReturn(bars, i);
            if (momentum === null) continue;
            const list = momentumByDate.get(date) ?? [];
            list.push(momentum);
            momentumByDate.set(date, list);
            const check = pullbackSignal(bars, ind, i);
            if (!check.passes) continue;
            const stopPct = MP_RULES.stopAtr * check.atrPct;
            const entry = bars[i + 1].open;
            const label = simulateFrom(bars, i + 1, entry, stopPct, MP_RULES.targetR * stopPct, MP_RULES.horizon, MP_RULES.costBps);
            if (!label) continue;
            const goal = simulateFrom(bars, i + 1, entry, stopPct, 5, MP_RULES.horizon, MP_RULES.costBps);
            candidates.push({ symbol, index: i, date, momentum, niftyGreen: nifty.get(date)?.green ?? false, label, reachedGoalFirst: goal?.outcome === 'TARGET' });
        }
        processed += 1;
        if (processed % 300 === 0) console.log(`[Momentum] ${processed}/${universe.size} symbols, ${candidates.length} pullback signals`);
    }

    const thresholds = new Map([...momentumByDate].map(([date, values]) => [date, topThreshold(values, MP_RULES.topFraction)]));
    const leaders = candidates.filter(candidate => candidate.momentum >= (thresholds.get(candidate.date) ?? Infinity));

    const variants = [
        { id: 'P1', label: 'No market filter', rows: leaders },
        { id: 'P2', label: 'NIFTY > 50 > 200-day', rows: leaders.filter(candidate => candidate.niftyGreen) },
    ].map(variant => {
        const trades = nonOverlapping(variant.rows);
        const discovery = trades.filter(trade => trade.date < TEST_START);
        const test = trades.filter(trade => trade.date >= TEST_START);
        const years = [...new Set(trades.map(trade => trade.date.slice(0, 4)))].sort();
        return {
            ...variant,
            discovery: summarize(discovery),
            test: summarize(test),
            goalRate: test.length ? (100 * test.filter(trade => trade.reachedGoalFirst).length) / test.length : null,
            yearly: years.map(year => ({ year, stats: summarize(trades.filter(trade => trade.date.startsWith(year))) })),
        };
    });

    const primary = [...variants].sort((left, right) => right.discovery.avgNetR - left.discovery.avgNetR)[0];
    const positiveTestYears = primary.yearly.filter(item => TEST_YEARS.includes(item.year) && item.stats.n > 0 && item.stats.avgNetR > 0).length;
    const checks = [
        { rule: 'At least 100 test trades', pass: primary.test.n >= 100, value: String(primary.test.n) },
        { rule: 'Average net R above 0', pass: primary.test.avgNetR > 0, value: r(primary.test.avgNetR) },
        { rule: 'Lower end of 95% range above 0', pass: primary.test.avgNetR - primary.test.ciNetR > 0, value: r(primary.test.avgNetR - primary.test.ciNetR) },
        { rule: 'Positive in at least 2 of 3 test years', pass: positiveTestYears >= 2, value: `${positiveTestYears} of 3` },
    ];
    const passed = checks.every(check => check.pass);
    const header = 'Trades | Target first | Stop first | Expired | Avg net R (95% range)';
    const lines = [
        '# Momentum pullback study',
        '',
        `Generated: ${new Date().toISOString()}`,
        '',
        'Pre-registered plan: [`momentum-pullback-plan.md`](momentum-pullback-plan.md) (committed before this run). Signals known at the close, filled at the next open; stop 1.5 × ATR, target 2 × stop, 10 sessions, 40 bps costs. Non-overlapping trades per stock.',
        '',
        `Pullback signals found: ${candidates.length.toLocaleString('en-IN')}; of which momentum leaders (top 20%): ${leaders.length.toLocaleString('en-IN')}.`,
        '',
        `## Verdict: ${passed ? '**PASS**' : '**FAIL**'}`,
        '',
        `Primary variant (better discovery result): **${primary.id} — ${primary.label}**.`,
        '',
        '| Pre-registered rule | Result | Pass |',
        '|---|---:|:---:|',
        ...checks.map(check => `| ${check.rule} | ${check.value} | ${check.pass ? '✅' : '❌'} |`),
        '',
        passed
            ? 'Per plan: add this as a scanner setup type and put it On trial for live paper tracking. Not a basis for real money until it earns Trusted.'
            : 'Per plan: do not trade it and do not re-tune these rules on the test period.',
        '',
        '## Both variants',
        '',
        `| Variant | Period | ${header} | +5% first (test) |`,
        '|---|---|---:|---:|---:|---:|---:|---:|',
        ...variants.flatMap(variant => [
            `| ${variant.id}: ${variant.label} | Discovery | ${statsCells(variant.discovery)} | |`,
            `| | **Test** | **${statsCells(variant.test)}** | ${variant.goalRate === null ? '—' : pct(variant.goalRate)} |`,
        ]),
        '',
        `## ${primary.id} by year`,
        '',
        `| Year | ${header} |`,
        '|---|---:|---:|---:|---:|---:|',
        ...primary.yearly.map(item => `| ${item.year}${item.year >= TEST_START.slice(0, 4) ? ' (test)' : ''} | ${statsCells(item.stats as OutcomeStats)} |`),
        '',
        'Research output, not investment advice.',
        '',
    ];
    mkdirSync('reports', { recursive: true });
    const path = join('reports', 'momentum-pullback.md');
    writeFileSync(path, lines.join('\n'));
    console.log(`[Momentum] Primary ${primary.id}: test n=${primary.test.n} avg=${r(primary.test.avgNetR)} ±${primary.test.ciNetR.toFixed(3)} → ${passed ? 'PASS' : 'FAIL'}. Report: ${path}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[Momentum] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
