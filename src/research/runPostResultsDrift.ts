import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../prismaClient';
import { loadAdjustedDailySeries } from '../adjustedCandles';
import { nonOverlapping, simulateFrom, summarize, TradeLabel } from './fivePercentStudy';
import { computeSeriesIndicators } from './momentumPullback';
import { assessResultsSignal, eventIndex, PRD_RULES, resultsTrade } from './postResultsDrift';
import { loadUniverse, pct, r, statsCells, TEST_START } from './studyData';

/**
 * npm run research:post-results-drift
 * Implements reports/post-results-drift-plan.md exactly. Writes reports/post-results-drift.md.
 */

const DISCOVERY_START = '2021-01-05';
const TEST_YEARS = ['2024', '2025', '2026'];

interface EventTrade {
    symbol: string;
    index: number;
    date: string;
    trend: boolean;
    reaction: number;
    label: TradeLabel;
    reachedGoalFirst: boolean;
}

async function main(): Promise<void> {
    console.log('[Results] Loading universe and events…');
    const universe = await loadUniverse();
    const nifty = (await loadAdjustedDailySeries('NIFTY_50')).bars;
    const niftyClose = new Map(nifty.map(bar => [bar.date, bar.close]));
    const events = await prisma.resultsEvent.findMany({ select: { symbol: true, meetingDate: true }, orderBy: { meetingDate: 'asc' } });
    const bySymbol = new Map<string, string[]>();
    for (const event of events) {
        const list = bySymbol.get(event.symbol) ?? [];
        list.push(event.meetingDate.toISOString().slice(0, 10));
        bySymbol.set(event.symbol, list);
    }

    const counts = { events: 0, inUniverse: 0, signals: 0, skippedGap: 0 };
    const rejections: Record<string, number> = {};
    const trades: EventTrade[] = [];
    for (const [symbol, meetings] of bySymbol) {
        const eligible = universe.get(symbol);
        if (!eligible) continue;
        const bars = (await loadAdjustedDailySeries(symbol)).bars;
        if (bars.length < 80) continue;
        const dates = bars.map(bar => bar.date);
        const ind = computeSeriesIndicators(bars);
        for (const meeting of meetings) {
            counts.events += 1;
            const e = eventIndex(dates, meeting);
            if (e < 0 || e + 1 >= bars.length) continue;
            const signalDate = dates[e + 1];
            if (signalDate < DISCOVERY_START || !eligible.has(signalDate)) continue;
            counts.inUniverse += 1;
            const signal = assessResultsSignal(bars, ind, e, niftyClose);
            if (!signal) continue;
            if (!signal.passes) {
                for (const reason of signal.reasons) rejections[reason] = (rejections[reason] ?? 0) + 1;
                continue;
            }
            counts.signals += 1;
            const label = resultsTrade(bars, e, signal.atrPct);
            if (!label) {
                if (e + 2 < bars.length && bars[e + 2].open > bars[e + 1].close * (1 + PRD_RULES.maxGapUpPct / 100)) counts.skippedGap += 1;
                continue;
            }
            const stopPct = PRD_RULES.stopAtr * signal.atrPct;
            const goal = simulateFrom(bars, e + 2, bars[e + 2].open, stopPct, 5, PRD_RULES.horizon, PRD_RULES.costBps);
            trades.push({ symbol, index: e + 1, date: signalDate, trend: signal.aboveSma50BeforeEvent, reaction: signal.abnormalReactionPct, label, reachedGoalFirst: goal?.outcome === 'TARGET' });
        }
    }
    console.log(`[Results] ${counts.events} events; ${counts.inUniverse} in universe; ${counts.signals} signals; ${trades.length} trades`);

    const variants = [
        { id: 'D1', label: 'No extra rule', rows: trades },
        { id: 'D2', label: 'Above 50-day average before the event', rows: trades.filter(trade => trade.trend) },
    ].map(variant => {
        const kept = nonOverlapping(variant.rows);
        const discovery = kept.filter(trade => trade.date < TEST_START);
        const test = kept.filter(trade => trade.date >= TEST_START);
        const years = [...new Set(kept.map(trade => trade.date.slice(0, 4)))].sort();
        return {
            ...variant,
            discovery: summarize(discovery),
            test: summarize(test),
            goalRate: test.length ? (100 * test.filter(trade => trade.reachedGoalFirst).length) / test.length : null,
            yearly: years.map(year => ({ year, stats: summarize(kept.filter(trade => trade.date.startsWith(year))) })),
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
        '# Post-results drift study',
        '',
        `Generated: ${new Date().toISOString()}`,
        '',
        'Pre-registered plan: [`post-results-drift-plan.md`](post-results-drift-plan.md) (committed before this run). Signal at the close of E+1, entry at the open of E+2; stop 1.5 × ATR, target 2 × stop, 15 sessions, 40 bps costs.',
        '',
        `Results events: ${counts.events.toLocaleString('en-IN')}; with the signal day in the top-500 universe (from ${DISCOVERY_START}): ${counts.inUniverse.toLocaleString('en-IN')}; passing the signal rules: ${counts.signals.toLocaleString('en-IN')}; skipped for a >3% gap: ${counts.skippedGap}; traded: ${trades.length.toLocaleString('en-IN')}.`,
        `Rule failures among universe events (an event can fail several): ${Object.entries(rejections).map(([key, value]) => `${key} ${value.toLocaleString('en-IN')}`).join(', ')}.`,
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
            ? 'Per plan: add "Post-Results Drift" as a scanner setup type, On trial for live paper tracking. Not a basis for real money until it earns Trusted.'
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
        ...primary.yearly.map(item => `| ${item.year}${item.year >= TEST_START.slice(0, 4) ? ' (test)' : ''} | ${statsCells(item.stats)} |`),
        '',
        'Research output, not investment advice.',
        '',
    ];
    mkdirSync('reports', { recursive: true });
    const path = join('reports', 'post-results-drift.md');
    writeFileSync(path, lines.join('\n'));
    console.log(`[Results] Primary ${primary.id}: test n=${primary.test.n} avg=${r(primary.test.avgNetR)} ±${primary.test.ciNetR.toFixed(3)} → ${passed ? 'PASS' : 'FAIL'}. Report: ${path}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[Results] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
