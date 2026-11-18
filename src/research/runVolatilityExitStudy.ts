import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../prismaClient';
import { loadAdjustedDailySeries } from '../adjustedCandles';
import {
    computeFeatures,
    CONDITIONS,
    ExitDesign,
    greedySelect,
    labelDesignTrade,
    matchesAll,
    MIN_HISTORY,
    nonOverlapping,
    OutcomeStats,
    StockFeatures,
    StudyRow,
    summarize,
    TradeLabel,
    VOLATILITY_DESIGNS,
} from './fivePercentStudy';
import { conditionNames, loadNiftyContext, loadUniverse, MIN_DISCOVERY_TRADES, pct, r, statsCells, TEST_START, UNIVERSE_SIZE } from './studyData';

/**
 * npm run research:volatility-exits
 *
 * Implements reports/volatility-exit-study-plan.md exactly: four exit designs
 * with ATR-scaled stops, selection on discovery only, one primary candidate
 * judged on the test period by the pre-registered decision rule.
 */

interface BaseRow {
    symbol: string;
    date: string;
    index: number;
    features: StockFeatures;
    market: { niftyGreen: boolean; breadthPct: number };
    labels: Array<TradeLabel | null>;
    unverifiedAfter: string[];
}

const TEST_YEARS = ['2024', '2025', '2026'];
const MIN_TEST_TRADES = 100;

function rowsForDesign(base: BaseRow[], designIndex: number, bars: Map<string, string[]>): StudyRow[] {
    const rows: StudyRow[] = [];
    for (const row of base) {
        const label = row.labels[designIndex];
        if (!label) continue;
        const dates = bars.get(row.symbol)!;
        const windowEnd = dates[label.exitIndex];
        rows.push({
            symbol: row.symbol, date: row.date, index: row.index, features: row.features, market: row.market, label,
            touchesUnverifiedJump: row.unverifiedAfter.some(jump => jump > row.date && jump <= windowEnd),
        });
    }
    return rows;
}

async function main(): Promise<void> {
    console.log('[VolExit] Loading point-in-time universe…');
    const universe = await loadUniverse();
    const nifty = await loadNiftyContext();
    const maxHorizon = Math.max(...VOLATILITY_DESIGNS.map(design => design.horizon));

    const base: BaseRow[] = [];
    const symbolDates = new Map<string, string[]>();
    let processed = 0;
    for (const [symbol, eligibleDates] of universe) {
        const series = await loadAdjustedDailySeries(symbol);
        const bars = series.bars;
        symbolDates.set(symbol, bars.map(bar => bar.date));
        for (let i = MIN_HISTORY; i < bars.length - 1; i += 1) {
            const date = bars[i].date;
            if (!eligibleDates.has(date)) continue;
            const market = nifty.get(date);
            if (!market) continue;
            const features = computeFeatures(bars, i, market.return63);
            if (!features) continue;
            base.push({
                symbol, date, index: i, features,
                market: { niftyGreen: market.green, breadthPct: 0 },
                labels: VOLATILITY_DESIGNS.map(design => labelDesignTrade(bars, i, features.atrPct, design)),
                unverifiedAfter: series.unverifiedJumpDates.filter(jump => jump > date),
            });
        }
        processed += 1;
        if (processed % 200 === 0) console.log(`[VolExit] ${processed}/${universe.size} symbols, ${base.length.toLocaleString('en-IN')} stock-days`);
    }

    // Breadth over the whole day's universe, including days too recent to label.
    const breadth = new Map<string, { above: number; total: number }>();
    for (const row of base) {
        const item = breadth.get(row.date) ?? { above: 0, total: 0 };
        item.total += 1;
        if (row.features.aboveSma50) item.above += 1;
        breadth.set(row.date, item);
    }
    for (const row of base) {
        const item = breadth.get(row.date)!;
        row.market.breadthPct = (100 * item.above) / item.total;
    }
    const lastDiscoveryDate = base.filter(row => row.date < TEST_START).map(row => row.date).sort().at(-1);
    const firstDate = base.map(row => row.date).sort()[0];
    console.log(`[VolExit] ${base.length.toLocaleString('en-IN')} stock-days; max horizon ${maxHorizon}`);

    interface DesignResult {
        design: ExitDesign;
        baseDiscovery: OutcomeStats;
        baseTest: OutcomeStats;
        steps: ReturnType<typeof greedySelect>;
        discovery: OutcomeStats;
        test: OutcomeStats;
        testClean: OutcomeStats;
        yearly: Array<{ year: string; stats: OutcomeStats }>;
        conditionTable: Array<{ label: string; d: OutcomeStats; t: OutcomeStats }>;
    }

    const results: DesignResult[] = VOLATILITY_DESIGNS.map((design, designIndex) => {
        const rows = rowsForDesign(base, designIndex, symbolDates);
        const discoveryRows = rows.filter(row => row.date < TEST_START);
        const testRows = rows.filter(row => row.date >= TEST_START);
        const steps = greedySelect(discoveryRows, CONDITIONS, 4, MIN_DISCOVERY_TRADES);
        const chosen = steps.at(-1)?.conditions ?? [];
        const selectedTest = nonOverlapping(testRows.filter(row => matchesAll(row, chosen)));
        const years = [...new Set(rows.map(row => row.date.slice(0, 4)))].sort();
        console.log(`[VolExit] Design ${design.id}: ${rows.length.toLocaleString('en-IN')} trades labelled; selected ${chosen.map(c => c.id).join('+') || 'none'}`);
        return {
            design,
            baseDiscovery: summarize(nonOverlapping(discoveryRows)),
            baseTest: summarize(nonOverlapping(testRows)),
            steps,
            discovery: summarize(nonOverlapping(discoveryRows.filter(row => matchesAll(row, chosen)))),
            test: summarize(selectedTest),
            testClean: summarize(selectedTest.filter(row => !row.touchesUnverifiedJump)),
            yearly: years.map(year => ({ year, stats: summarize(nonOverlapping(rows.filter(row => row.date.startsWith(year) && matchesAll(row, chosen)))) })),
            conditionTable: CONDITIONS.map(condition => ({
                label: condition.label,
                d: summarize(nonOverlapping(discoveryRows.filter(condition.test))),
                t: summarize(nonOverlapping(testRows.filter(condition.test))),
            })),
        };
    });

    // Primary candidate: best discovery average net R after selection (pre-registered).
    const primary = [...results].sort((left, right) => right.discovery.avgNetR - left.discovery.avgNetR)[0];
    const primaryConditions = primary.steps.at(-1)?.conditions ?? [];
    const positiveTestYears = primary.yearly.filter(item => TEST_YEARS.includes(item.year) && item.stats.n > 0 && item.stats.avgNetR > 0).length;
    const checks = [
        { rule: `At least ${MIN_TEST_TRADES} test trades`, pass: primary.test.n >= MIN_TEST_TRADES, value: String(primary.test.n) },
        { rule: 'Average net R above 0', pass: primary.test.avgNetR > 0, value: r(primary.test.avgNetR) },
        { rule: 'Lower end of 95% range above 0', pass: primary.test.avgNetR - primary.test.ciNetR > 0, value: r(primary.test.avgNetR - primary.test.ciNetR) },
        { rule: 'Positive in at least 2 of 3 test years', pass: positiveTestYears >= 2, value: `${positiveTestYears} of 3` },
    ];
    const passed = checks.every(check => check.pass);
    const header = 'Trades | Target first | Stop first | Expired | Avg net R (95% range)';

    const lines = [
        '# Volatility-scaled exit study',
        '',
        `Generated: ${new Date().toISOString()}`,
        '',
        'Pre-registered plan: [`volatility-exit-study-plan.md`](volatility-exit-study-plan.md) (committed before this run). Same universe, conditions, costs and conservative ordering as the [5% study](five-percent-study.md); stops are sized to each stock\'s ATR and the target is 2× the stop.',
        '',
        `Discovery ${firstDate} → ${lastDiscoveryDate}; test ${TEST_START} onward. All trade counts are non-overlapping (one open trade per stock). R = net result ÷ stop distance; a 2:1 design needs the target first on roughly 35–38% of trades to break even after costs.`,
        '',
        `## Verdict: ${passed ? '**PASS**' : '**FAIL**'}`,
        '',
        `Primary candidate (best discovery result): **Design ${primary.design.id}** — ${primary.design.label}${primaryConditions.length ? `, with **${conditionNames(primaryConditions)}**` : ', no conditions'}.`,
        '',
        '| Pre-registered rule | Result | Pass |',
        '|---|---:|:---:|',
        ...checks.map(check => `| ${check.rule} | ${check.value} | ${check.pass ? '✅' : '❌'} |`),
        '',
        passed
            ? 'Next step per plan: freeze this as a named strategy version and forward-test on new sessions. Not a basis for trading money yet.'
            : 'Per plan: no candidate setup from this design family. Do not re-tune these designs on the test period.',
        '',
        '## All designs',
        '',
        'Only the primary candidate decides the verdict; the others are shown for transparency.',
        '',
        `| Design | Selected conditions (discovery) | Period | ${header} |`,
        '|---|---|---|---:|---:|---:|---:|---:|',
        ...results.flatMap(result => {
            const names = conditionNames(result.steps.at(-1)?.conditions ?? []) || 'none';
            return [
                `| ${result.design.id}: ${result.design.label} | — (every stock-day) | Discovery | ${statsCells(result.baseDiscovery)} |`,
                `| | | Test | ${statsCells(result.baseTest)} |`,
                `| | ${names} | Discovery | ${statsCells(result.discovery)} |`,
                `| | | **Test** | **${statsCells(result.test)}** |`,
                `| | | Test excl. unexplained jumps | ${statsCells(result.testClean)} |`,
            ];
        }),
        '',
        `## Primary candidate by year (Design ${primary.design.id})`,
        '',
        `| Year | ${header} |`,
        '|---|---:|---:|---:|---:|---:|',
        ...primary.yearly.map(item => `| ${item.year}${item.year >= TEST_START.slice(0, 4) ? ' (test)' : ''} | ${statsCells(item.stats)} |`),
        '',
        `## Each condition on its own, Design ${primary.design.id} (non-overlapping)`,
        '',
        '| Condition | Discovery trades | Discovery target first | Discovery avg R | Test trades | Test target first | Test avg R |',
        '|---|---:|---:|---:|---:|---:|---:|',
        ...primary.conditionTable.map(item => `| ${item.label} | ${item.d.n.toLocaleString('en-IN')} | ${pct(item.d.targetPct)} | ${r(item.d.avgNetR)} | ${item.t.n.toLocaleString('en-IN')} | ${pct(item.t.targetPct)} | ${r(item.t.avgNetR)} |`),
        '',
        `Universe: daily top ${UNIVERSE_SIZE} company shares by turnover. Research output, not investment advice.`,
        '',
    ];
    mkdirSync('reports', { recursive: true });
    const path = join('reports', 'volatility-exit-study.md');
    writeFileSync(path, lines.join('\n'));
    console.log(`[VolExit] Primary ${primary.design.id} ${conditionNames(primaryConditions) || '(no conditions)'}: test n=${primary.test.n} avg=${r(primary.test.avgNetR)} ±${primary.test.ciNetR.toFixed(3)} → ${passed ? 'PASS' : 'FAIL'}. Report: ${path}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[VolExit] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
