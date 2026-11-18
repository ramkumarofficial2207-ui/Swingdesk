import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../prismaClient';
import { loadAdjustedDailySeries } from '../adjustedCandles';
import {
    computeFeatures,
    CONDITIONS,
    Condition,
    DEFAULT_PARAMS,
    greedySelect,
    labelTrade,
    matchesAll,
    MIN_HISTORY,
    nonOverlapping,
    OutcomeStats,
    StudyRow,
    summarize,
} from './fivePercentStudy';

/**
 * npm run research:five-pct
 *
 * Universe: on each date, the 500 most-traded company shares (ISIN INE…) by
 * 20-session average turnover, so stocks that later fell away are included.
 * Discovery 2020–2023, test 2024 onward. Writes reports/five-percent-study.md.
 */

const UNIVERSE_SIZE = 500;
const TEST_START = '2024-01-01';
const MIN_DISCOVERY_TRADES = 300;

function dateKey(value: Date): string {
    return value.toISOString().slice(0, 10);
}

async function loadUniverse(): Promise<Map<string, Set<string>>> {
    const rows = await prisma.$queryRaw<Array<{ symbol: string; d: Date }>>`
        WITH t AS (
            SELECT c.symbol, c."tradingDate" AS d,
                   AVG(c."turnoverCr") OVER w AS t20,
                   COUNT(c."turnoverCr") OVER w AS cnt
            FROM "DailyCandle" c
            JOIN "MarketInstrument" m ON m.symbol = c.symbol
            WHERE c."isFinal" = true AND m.isin LIKE 'INE%'
            WINDOW w AS (PARTITION BY c.symbol ORDER BY c."tradingDate" ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)
        ),
        r AS (SELECT symbol, d, RANK() OVER (PARTITION BY d ORDER BY t20 DESC) AS rk FROM t WHERE cnt = 20)
        SELECT symbol, d FROM r WHERE rk <= ${UNIVERSE_SIZE}`;
    const bySymbol = new Map<string, Set<string>>();
    for (const row of rows) {
        const dates = bySymbol.get(row.symbol) ?? new Set<string>();
        dates.add(dateKey(row.d));
        bySymbol.set(row.symbol, dates);
    }
    return bySymbol;
}

async function loadNiftyContext(): Promise<Map<string, { green: boolean; return63: number }>> {
    const rows = await prisma.dailyCandle.findMany({
        where: { symbol: 'NIFTY_50', isFinal: true },
        orderBy: { tradingDate: 'asc' },
        select: { tradingDate: true, close: true },
    });
    const closes = rows.map(row => row.close);
    const context = new Map<string, { green: boolean; return63: number }>();
    for (let index = 200; index < rows.length; index += 1) {
        const average = (period: number) => closes.slice(index - period + 1, index + 1).reduce((sum, value) => sum + value, 0) / period;
        const sma50 = average(50);
        const sma200 = average(200);
        context.set(dateKey(rows[index].tradingDate), {
            green: closes[index] > sma50 && sma50 > sma200,
            return63: (closes[index] / closes[index - 63] - 1) * 100,
        });
    }
    return context;
}

function pct(value: number): string {
    return `${value.toFixed(1)}%`;
}

function r(value: number): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(3)}R`;
}

function statsCells(stats: OutcomeStats): string {
    if (!stats.n) return '0 | — | — | — | —';
    return `${stats.n.toLocaleString('en-IN')} | ${pct(stats.targetPct)} | ${pct(stats.stopPct)} | ${pct(stats.expiredPct)} | ${r(stats.avgNetR)} ± ${stats.ciNetR.toFixed(3)}`;
}

function conditionNames(conditions: Condition[]): string {
    return conditions.map(condition => condition.label).join(' + ');
}

async function main(): Promise<void> {
    const params = DEFAULT_PARAMS;
    console.log('[5%] Loading point-in-time universe…');
    const universe = await loadUniverse();
    const nifty = await loadNiftyContext();
    console.log(`[5%] ${universe.size} symbols ever in the top ${UNIVERSE_SIZE}; ${nifty.size} NIFTY sessions`);

    const rows: StudyRow[] = [];
    let processed = 0;
    for (const [symbol, eligibleDates] of universe) {
        const series = await loadAdjustedDailySeries(symbol);
        const bars = series.bars;
        const unverified = series.unverifiedJumpDates;
        for (let i = MIN_HISTORY; i < bars.length - params.horizon; i += 1) {
            const date = bars[i].date;
            if (!eligibleDates.has(date)) continue;
            const market = nifty.get(date);
            if (!market) continue;
            const features = computeFeatures(bars, i, market.return63);
            const label = labelTrade(bars, i, params);
            if (!features || !label) continue;
            const windowEnd = bars[label.exitIndex].date;
            const touchesUnverifiedJump = unverified.some(jump => jump > date && jump <= windowEnd);
            rows.push({ symbol, date, index: i, features, label, touchesUnverifiedJump, market: { niftyGreen: market.green, breadthPct: 0 } });
        }
        processed += 1;
        if (processed % 100 === 0) console.log(`[5%] ${processed}/${universe.size} symbols, ${rows.length.toLocaleString('en-IN')} stock-days`);
    }

    // Breadth: share of each day's universe above its 50-day average.
    const breadth = new Map<string, { above: number; total: number }>();
    for (const row of rows) {
        const item = breadth.get(row.date) ?? { above: 0, total: 0 };
        item.total += 1;
        if (row.features.aboveSma50) item.above += 1;
        breadth.set(row.date, item);
    }
    for (const row of rows) {
        const item = breadth.get(row.date)!;
        row.market.breadthPct = (100 * item.above) / item.total;
    }

    const discovery = rows.filter(row => row.date < TEST_START);
    const test = rows.filter(row => row.date >= TEST_START);
    const dates = [...new Set(rows.map(row => row.date))].sort();
    console.log(`[5%] ${rows.length.toLocaleString('en-IN')} labelled stock-days (${discovery.length.toLocaleString('en-IN')} discovery, ${test.length.toLocaleString('en-IN')} test)`);

    const conditionRows = CONDITIONS.map(condition => {
        const d = summarize(discovery.filter(condition.test));
        const t = summarize(test.filter(condition.test));
        return { condition, d, t };
    });
    const baseD = summarize(discovery);
    const baseT = summarize(test);

    const steps = greedySelect(discovery, CONDITIONS, 4, MIN_DISCOVERY_TRADES);
    const finalConditions = steps.at(-1)?.conditions ?? [];
    const finalDiscovery = summarize(nonOverlapping(discovery.filter(row => matchesAll(row, finalConditions))));
    const finalTestRows = nonOverlapping(test.filter(row => matchesAll(row, finalConditions)));
    const finalTest = summarize(finalTestRows);
    const finalTestClean = summarize(finalTestRows.filter(row => !row.touchesUnverifiedJump));

    // Year-by-year stability of the selected combination (non-overlapping).
    const years = [...new Set(rows.map(row => row.date.slice(0, 4)))].sort();
    const yearly = years.map(year => ({
        year,
        stats: summarize(nonOverlapping(rows.filter(row => row.date.startsWith(year) && matchesAll(row, finalConditions)))),
    }));

    const breakEvenHit = ((1 + params.costBps / 100 / params.stopPct) / (params.targetPct / params.stopPct + 1)) * 100;
    const verdict = finalConditions.length === 0
        ? 'No condition improved on the discovery baseline; there is no candidate setup to test.'
        : finalTest.n < 50
            ? `Insufficient evidence: only ${finalTest.n} non-overlapping test trades.`
            : finalTest.avgNetR - finalTest.ciNetR > 0
                ? 'The selected setup kept a positive net expectancy on unseen dates, with the 95% range above zero. It is a candidate for a frozen forward test, not yet a proven edge.'
                : finalTest.avgNetR > 0
                    ? 'The selected setup was positive on unseen dates, but the 95% range includes zero; the edge is not established.'
                    : 'The selected setup did not hold up on unseen dates (net expectancy ≤ 0). Do not trade it.';

    const header = '| Trades | Hit +5% first | Hit stop first | Expired | Avg net R (95% range) |';
    const lines = [
        '# 5% move study',
        '',
        `Generated: ${new Date().toISOString()}`,
        '',
        '**Question:** after a signal at the close, how often does a stock reach **+5%** before **−2.5%** within **10 sessions**, and which conditions make that more likely?',
        '',
        '## Method',
        '',
        `- Universe: on each date, the ${UNIVERSE_SIZE} most-traded company shares by 20-session average turnover (ETFs excluded by ISIN). Stocks that later dropped out are included.`,
        '- Prices adjusted for splits and bonuses (`loadAdjustedDailySeries`). Features use only data up to the signal date.',
        `- Entry at the next session's open. Target +${params.targetPct}%, stop −${params.stopPct}%, exit at the close of session ${params.horizon} otherwise.`,
        '- A gap through the stop exits at the open. A day touching both levels counts as a stop (daily bars hide the order).',
        `- Costs: ${params.costBps} bps round trip. 1R = ${params.stopPct}% of entry. A pure target/stop trader needs to hit the target first on about ${breakEvenHit.toFixed(0)}% of trades to break even.`,
        `- **Discovery:** ${dates[0]} to ${dates.filter(date => date < TEST_START).at(-1)} (conditions chosen here). **Test:** ${TEST_START} to ${dates.at(-1)} (evaluated once).`,
        '- Not modelled: results dates (no reliable history), sector strength, intraday order of highs and lows, liquidity limits on position size.',
        '',
        '## Baseline: every stock-day in the universe',
        '',
        '| Period | Trades | Hit +5% first | Hit stop first | Expired | Avg net R (95% range) |',
        '|---|---:|---:|---:|---:|---:|',
        `| Discovery | ${statsCells(baseD)} |`,
        `| Test | ${statsCells(baseT)} |`,
        '',
        '## Each condition on its own (all qualifying stock-days)',
        '',
        'Overlapping stock-days are counted here, so ranges are narrower than for real, non-overlapping trades. Use this table to see direction, not size.',
        '',
        '| Condition | Discovery trades | Discovery hit +5% | Discovery avg R | Test trades | Test hit +5% | Test avg R |',
        '|---|---:|---:|---:|---:|---:|---:|',
        ...conditionRows.map(({ condition, d, t }) =>
            `| ${condition.label} | ${d.n.toLocaleString('en-IN')} | ${pct(d.targetPct)} | ${r(d.avgNetR)} | ${t.n.toLocaleString('en-IN')} | ${pct(t.targetPct)} | ${r(t.avgNetR)} |`),
        '',
        '## Combination chosen on discovery data only',
        '',
        `Forward selection: add the condition that most improves non-overlapping average net R, keeping at least ${MIN_DISCOVERY_TRADES} discovery trades.`,
        '',
        '| Step | Conditions | ' + header.slice(2),
        '|---|---|---:|---:|---:|---:|---:|',
        ...steps.map((step, index) => `| ${index + 1} | ${conditionNames(step.conditions)} | ${statsCells(step.discovery)} |`),
        '',
        '## Result on unseen dates (non-overlapping trades)',
        '',
        `Setup: **${finalConditions.length ? conditionNames(finalConditions) : 'none selected'}**`,
        '',
        '| Period | ' + header.slice(2),
        '|---|---:|---:|---:|---:|---:|',
        `| Discovery | ${statsCells(finalDiscovery)} |`,
        `| **Test** | **${statsCells(finalTest)}** |`,
        `| Test, excluding trades near unexplained price jumps | ${statsCells(finalTestClean)} |`,
        '',
        `**Verdict:** ${verdict}`,
        '',
        '### By year',
        '',
        '| Year | ' + header.slice(2),
        '|---|---:|---:|---:|---:|---:|',
        ...yearly.map(item => `| ${item.year}${item.year >= TEST_START.slice(0, 4) ? ' (test)' : ''} | ${statsCells(item.stats)} |`),
        '',
        'Research output, not investment advice. A positive test result justifies a frozen forward test on new sessions; it does not guarantee future results.',
        '',
    ];
    mkdirSync('reports', { recursive: true });
    const path = join('reports', 'five-percent-study.md');
    writeFileSync(path, lines.join('\n'));
    console.log(`[5%] Setup: ${conditionNames(finalConditions) || 'none'}`);
    console.log(`[5%] Test: n=${finalTest.n} hit=${pct(finalTest.targetPct)} avg=${r(finalTest.avgNetR)} ±${finalTest.ciNetR.toFixed(3)}. Report: ${path}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[5%] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
