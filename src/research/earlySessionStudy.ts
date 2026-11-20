import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../prismaClient';
import { Bar, EARLY_RULES, earlyFeatures, earlyLevels, EarlyFeatures, StockSession } from '../earlySession';
import { HarnessTrade, TradeStats, tradeStats } from './harness';
import { istParts } from './intradayPilot';
import { loadIndustries, recordTrial } from './studyRunner';
import { loadUniverse } from './studyData';

/**
 * Early-session study (reports/early-session-plan.md), Track A: the app's
 * frozen v1 rules replayed on stored 5-minute bars, with three control groups.
 *   npm run research:early-session                  (discovery period only)
 *   npm run research:early-session -- --run-test    (the one-time test run)
 */

export const STUDY = {
    discoveryStart: '2023-12-20',
    testStart: '2025-01-01',
    costPct: 0.2,
    entryTime: '09:50',
    exitTime: '15:10',
    maxTradesPerDay: 5,
    maxPerSector: 2,
    riskPerTradePct: 0.5,
    maxPositionPct: 20,
    minDayCoverage: 0.8,
    testYears: ['2025', '2026'],
} as const;

export interface IntradayLevels { maxEntry: number; stop: number; target: number }
export interface IntradayTrade {
    symbol: string; sector: string; date: string; entry: number; exit: number;
    outcome: 'TARGET' | 'STOP' | 'TIME'; netPct: number; stopPct: number;
}

/**
 * One long intraday trade from the 09:50 open. No trade if the 09:50 bar is
 * missing, opens above the maximum entry, or at/below the stop. A bar that
 * opens beyond a level exits at its open; a bar touching both counts as the
 * stop; otherwise exit at the 15:10 open (or the last close before it).
 */
export function simulateIntradayTrade(bars: Bar[], levels: IntradayLevels, costPct: number = STUDY.costPct): Omit<IntradayTrade, 'symbol' | 'sector' | 'date'> | null {
    const sorted = [...bars].sort((a, b) => a.time.localeCompare(b.time));
    const first = sorted.findIndex(bar => bar.time === STUDY.entryTime);
    if (first < 0) return null;
    const entry = sorted[first].open;
    if (!(entry > levels.stop) || entry > levels.maxEntry) return null;
    const done = (outcome: IntradayTrade['outcome'], exit: number) => ({
        entry, exit, outcome, netPct: (exit / entry - 1) * 100 - costPct, stopPct: (1 - levels.stop / entry) * 100,
    });
    let lastClose = entry;
    for (let k = first; k < sorted.length; k += 1) {
        const bar = sorted[k];
        if (bar.time >= STUDY.exitTime) return done('TIME', bar.open);
        if (k > first && bar.open <= levels.stop) return done('STOP', bar.open);
        if (k > first && bar.open >= levels.target) return done('TARGET', bar.open);
        if (bar.low <= levels.stop) return done('STOP', levels.stop);
        if (bar.high >= levels.target) return done('TARGET', levels.target);
        lastClose = bar.close;
    }
    return done('TIME', lastClose);
}

/** At most maxTradesPerDay a day and maxPerSector per sector, highest relative volume first. */
export function pickDaily<T extends { sector: string; relativeVolume: number; symbol: string }>(candidates: T[], maxTrades: number = STUDY.maxTradesPerDay, maxPerSector: number = STUDY.maxPerSector): T[] {
    const perSector = new Map<string, number>();
    const picked: T[] = [];
    for (const candidate of [...candidates].sort((a, b) => b.relativeVolume - a.relativeVolume || a.symbol.localeCompare(b.symbol))) {
        if (picked.length >= maxTrades) break;
        if ((perSector.get(candidate.sector) ?? 0) >= maxPerSector) continue;
        picked.push(candidate);
        perSector.set(candidate.sector, (perSector.get(candidate.sector) ?? 0) + 1);
    }
    return picked;
}

/** Daily-compounded equity with each trade sized at riskPerTradePct of equity at its stop, capped at maxPositionPct. */
export function intradayPortfolio(trades: IntradayTrade[]): { totalReturnPct: number; maxDrawdownPct: number; days: number } {
    const byDay = new Map<string, IntradayTrade[]>();
    for (const trade of trades) byDay.set(trade.date, [...(byDay.get(trade.date) ?? []), trade]);
    let equity = 1;
    let peak = 1;
    let maxDrawdown = 0;
    for (const date of [...byDay.keys()].sort()) {
        const dayReturn = byDay.get(date)!.reduce((sum, trade) => {
            const weight = Math.min(STUDY.riskPerTradePct / Math.max(trade.stopPct, 0.01), STUDY.maxPositionPct / 100);
            return sum + weight * trade.netPct / 100;
        }, 0);
        equity *= 1 + dayReturn;
        peak = Math.max(peak, equity);
        maxDrawdown = Math.max(maxDrawdown, (1 - equity / peak) * 100);
    }
    return { totalReturnPct: (equity - 1) * 100, maxDrawdownPct: maxDrawdown, days: byDay.size };
}

type Group = 'primary' | 'volumeOnly' | 'sectorOnly' | 'allBreakouts';
const GROUP_LABELS: Record<Group, string> = {
    primary: 'v1 rules (volume + sector + breakout), top 5 a day',
    volumeOnly: 'Control 1: volume + breakout, any sector',
    sectorOnly: 'Control 2: clustered sector + breakout, any volume',
    allBreakouts: 'Control 3: every opening-range breakout',
};

/** Which stocks each group would trade on one day (stop limit applies to all groups). */
export function groupCandidates(ready: EarlyFeatures[], clustered: Set<string>, rules = EARLY_RULES): Record<Group, Array<EarlyFeatures & { levels: ReturnType<typeof earlyLevels> }>> {
    const eligible = ready.flatMap(row => {
        if (!(row.price945 > row.openingRangeHigh)) return [];
        const levels = earlyLevels(row, rules);
        return levels.stopPct > rules.maxStopPct ? [] : [{ ...row, levels }];
    });
    const highVolume = (row: EarlyFeatures) => row.relativeVolume !== null && row.relativeVolume >= rules.minRelativeVolume;
    return {
        primary: eligible.filter(row => highVolume(row) && clustered.has(row.session.sector)),
        volumeOnly: eligible.filter(highVolume),
        sectorOnly: eligible.filter(row => clustered.has(row.session.sector)),
        allBreakouts: eligible,
    };
}

const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

async function main(): Promise<void> {
    const runTest = process.argv.includes('--run-test');
    // A lower coverage bar is only for checking the code on partial data; the test run always uses the pre-registered 80%.
    const coverageArg = Number(process.argv.find(arg => arg.startsWith('--min-coverage='))?.split('=')[1]);
    const minCoverage = !runTest && coverageArg > 0 && coverageArg <= 1 ? coverageArg : STUDY.minDayCoverage;
    const industries = loadIndustries();
    const universe = await loadUniverse();
    const calendar = (await prisma.dailyCandle.findMany({ where: { symbol: 'NIFTY_50', tradingDate: { gte: new Date('2023-10-01') } }, orderBy: { tradingDate: 'asc' }, select: { tradingDate: true } }))
        .map(row => row.tradingDate.toISOString().slice(0, 10))
        .filter(date => ![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()));
    const lastDate = runTest ? calendar.at(-1)! : '2024-12-31';
    const dates = calendar.filter(date => date >= STUDY.discoveryStart && date <= lastDate);
    console.log(`[Early] ${dates.length} sessions ${dates[0]} → ${lastDate}${runTest ? ' (INCLUDES TEST PERIOD)' : ' (discovery only)'}`);

    // 09:15–09:45 volume per symbol and session, for the 20-session median baseline.
    const openingRows = await prisma.$queryRaw<Array<{ symbol: string; d: Date; v: number }>>(Prisma.sql`
        SELECT symbol, "tradingDate" AS d, SUM(volume)::float8 AS v
        FROM "IntradayCandle"
        WHERE "tradingDate" <= ${new Date(`${lastDate}T00:00:00Z`)}
          AND to_char("startTime" AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') IN (${Prisma.join([...EARLY_RULES.signalBars])})
          AND EXTRACT(ISODOW FROM "tradingDate") < 6
        GROUP BY symbol, "tradingDate" HAVING COUNT(*) = ${EARLY_RULES.signalBars.length}`);
    const opening = new Map<string, Array<{ date: string; volume: number }>>();
    for (const row of openingRows) {
        const list = opening.get(row.symbol) ?? [];
        list.push({ date: row.d.toISOString().slice(0, 10), volume: row.v });
        opening.set(row.symbol, list);
    }
    for (const list of opening.values()) list.sort((a, b) => a.date.localeCompare(b.date));
    const baselineFor = (symbol: string, date: string): number | null => {
        const prior = (opening.get(symbol) ?? []).filter(item => item.date < date).slice(-EARLY_RULES.baselineSessions);
        return prior.length >= Math.ceil(EARLY_RULES.baselineSessions * 0.75) ? median(prior.map(item => item.volume)) : null;
    };

    const trades: Record<Group, IntradayTrade[]> = { primary: [], volumeOnly: [], sectorOnly: [], allBreakouts: [] };
    let skippedDays = 0;
    for (const [index, date] of dates.entries()) {
        const previous = calendar[calendar.indexOf(date) - 1];
        const symbols = [...universe].filter(([, eligible]) => previous && eligible.has(previous)).map(([symbol]) => symbol);
        if (!symbols.length) { skippedDays += 1; continue; }
        const rows = await prisma.intradayCandle.findMany({ where: { tradingDate: new Date(`${date}T00:00:00Z`), symbol: { in: symbols } }, select: { symbol: true, startTime: true, open: true, high: true, low: true, close: true, volume: true } });
        const barsBy = new Map<string, Bar[]>();
        for (const row of rows) barsBy.set(row.symbol, [...(barsBy.get(row.symbol) ?? []), { time: istParts(row.startTime).time, open: row.open, high: row.high, low: row.low, close: row.close, volume: Number(row.volume) }]);
        const sessions: StockSession[] = symbols.map(symbol => ({ symbol, sector: industries.get(symbol) ?? 'Unknown', bars: barsBy.get(symbol) ?? [], baselineVolume: baselineFor(symbol, date) }));
        const { ready, clustered } = earlyFeatures(sessions);
        if (ready.filter(r => r.relativeVolume !== null).length < symbols.length * minCoverage) { skippedDays += 1; continue; }
        const groups = groupCandidates(ready, clustered);
        for (const group of Object.keys(groups) as Group[]) {
            const list = group === 'primary'
                ? pickDaily(groups.primary.map(row => ({ ...row, symbol: row.session.symbol, sector: row.session.sector, relativeVolume: row.relativeVolume ?? 0 })))
                : groups[group];
            for (const row of list) {
                const result = simulateIntradayTrade(barsBy.get(row.session.symbol) ?? [], row.levels);
                if (result) trades[group].push({ symbol: row.session.symbol, sector: row.session.sector, date, ...result });
            }
        }
        if ((index + 1) % 50 === 0) console.log(`[Early] ${index + 1}/${dates.length} sessions · v1 trades so far ${trades.primary.length}`);
    }

    const asHarness = (list: IntradayTrade[]) => list.map(trade => ({ signalDate: trade.date, netPct: trade.netPct, delayedExit: false }) as unknown as HarnessTrade);
    const stats = (list: IntradayTrade[]) => tradeStats(asHarness(list));
    const split = (list: IntradayTrade[]) => ({ discovery: list.filter(t => t.date < STUDY.testStart), test: list.filter(t => t.date >= STUDY.testStart) });
    const controlMean = (group: Group) => {
        const byDay = new Map<string, number[]>();
        for (const trade of trades[group]) byDay.set(trade.date, [...(byDay.get(trade.date) ?? []), trade.netPct]);
        return new Map([...byDay].map(([date, values]) => [date, values.reduce((s, v) => s + v, 0) / values.length]));
    };
    const excess = (list: IntradayTrade[], group: Group) => {
        const means = controlMean(group);
        const diffs = list.filter(t => means.has(t.date)).map(t => ({ signalDate: t.date, netPct: t.netPct - means.get(t.date)!, delayedExit: false }) as unknown as HarnessTrade);
        return tradeStats(diffs);
    };

    const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(3)}%`;
    const row = (label: string, s: TradeStats) => s.n
        ? `| ${label} | ${s.n.toLocaleString('en-IN')} | ${s.days} | ${s.winRate.toFixed(1)}% | ${fmt(s.avg)} ± ${s.ci.toFixed(3)} | ${fmt(s.dayClustered)} | ${fmt(s.withoutBest5Days)} |`
        : `| ${label} | 0 | — | — | — | — | — |`;
    const head = '| Group | Trades | Days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |\n|---|---:|---:|---:|---:|---:|---:|';
    const periods = runTest ? (['discovery', 'test'] as const) : (['discovery'] as const);
    const primary = split(trades.primary);
    const outcomes = (list: IntradayTrade[]) => (['TARGET', 'STOP', 'TIME'] as const).map(o => `${o.toLowerCase()} ${list.filter(t => t.outcome === o).length}`).join(', ');

    const lines: string[] = [
        `# Early-session study, Track A (v1 rules)${runTest ? '' : ': discovery only'}`,
        '',
        `Generated: ${new Date().toISOString()} · plan: [\`early-session-plan.md\`](early-session-plan.md) · ${dates.length} sessions to ${lastDate}, ${skippedDays} skipped for data coverage below ${minCoverage * 100}% · costs ${STUDY.costPct}% round trip.`,
        '',
    ];
    for (const period of periods) {
        lines.push(`## ${period === 'test' ? '**Test 2025 → 2026**' : 'Discovery 2023-12 → 2024-12'}`, '', head);
        for (const group of Object.keys(trades) as Group[]) lines.push(row(GROUP_LABELS[group], stats(split(trades[group])[period])));
        const p = primary[period];
        const portfolio = intradayPortfolio(p);
        lines.push('', `v1 exits: ${outcomes(p)}. Portfolio (0.5% risk a trade, ≤ 20% a position): total ${fmt(portfolio.totalReturnPct)}, max drawdown ${portfolio.maxDrawdownPct.toFixed(1)}% over ${portfolio.days} trading days.`, '');
        lines.push('| v1 excess vs | Trades | Avg excess | Day-clustered excess |', '|---|---:|---:|---:|');
        for (const group of ['volumeOnly', 'sectorOnly', 'allBreakouts'] as Group[]) {
            const e = excess(p, group);
            lines.push(`| ${GROUP_LABELS[group]} | ${e.n} | ${e.n ? fmt(e.avg) : '—'} | ${e.n ? fmt(e.dayClustered) : '—'} |`);
        }
        lines.push('');
    }
    const years = [...new Set(trades.primary.map(t => t.date.slice(0, 4)))].sort().filter(y => runTest || y < '2025');
    lines.push('## v1 by year', '', head, ...years.map(y => row(y, stats(trades.primary.filter(t => t.date.startsWith(y))))), '');

    if (runTest) {
        const t = stats(primary.test);
        const portfolio = intradayPortfolio(primary.test);
        const excesses = (['volumeOnly', 'sectorOnly', 'allBreakouts'] as Group[]).map(g => excess(primary.test, g));
        const checks = [
            ['At least 100 test trades', String(t.n), t.n >= 100],
            ['Average net above 0', fmt(t.avg), t.avg > 0],
            ['Lower end of 95% range above 0', fmt(t.avg - t.ci), t.avg - t.ci > 0],
            ['Day-clustered average above 0', fmt(t.dayClustered), t.dayClustered > 0],
            ['Positive without the 5 best days', fmt(t.withoutBest5Days), t.withoutBest5Days > 0],
            ...STUDY.testYears.map(y => { const s = stats(primary.test.filter(x => x.date.startsWith(y))); return [`Positive in ${y}`, s.n ? fmt(s.avg) : 'no trades', s.n > 0 && s.avg > 0] as const; }),
            ['Beats all three controls (average excess above 0)', excesses.map(e => (e.n ? fmt(e.avg) : '—')).join(' / '), excesses.every(e => e.n > 0 && e.avg > 0)],
            ['Portfolio max drawdown ≤ 15%', `${portfolio.maxDrawdownPct.toFixed(1)}%`, portfolio.maxDrawdownPct <= 15],
        ] as const;
        const passed = checks.every(c => c[2]);
        lines.splice(4, 0, `## Verdict: ${passed ? '**PASS**' : '**FAIL**'}`, '', '| Rule (test period) | Result | Pass |', '|---|---:|:---:|', ...checks.map(c => `| ${c[0]} | ${c[1]} | ${c[2] ? '✅' : '❌'} |`), '');
        const d = stats(primary.discovery);
        recordTrial({ id: 'early-session-v1', name: 'Early session v1 (volume + sector + opening-range breakout, intraday)', plan: 'early-session-plan.md', ranAt: new Date().toISOString(), kind: 'pre-registered', discovery: { n: d.n, avg: d.avg, dayClustered: d.dayClustered }, test: { n: t.n, avg: t.avg, dayClustered: t.dayClustered }, verdict: passed ? 'PASS' : 'FAIL' });
    }
    lines.push('Known limit: Dhan has no history for stocks that stopped trading, so absolute returns are optimistic; the controls share that bias. Research output, not investment advice.', '');
    const file = runTest ? 'early-session-v1.md' : 'early-session-v1-discovery.md';
    writeFileSync(join('reports', file), lines.join('\n'));
    console.log(`[Early] v1 trades ${trades.primary.length}. Report: reports/${file}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[Early] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
