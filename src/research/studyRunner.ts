import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../prismaClient';
import { loadAdjustedDailySeries } from '../adjustedCandles';
import { PriceBar } from '../corporateActions';
import { Candidate, DEFAULT_RULES, ExitPlan, HarnessRules, HarnessTrade, judge, selectTrades, simulatePortfolio, simulateTrade, TradeStats, tradeStats } from './harness';
import { computeSeriesIndicators, SeriesIndicators } from './momentumPullback';
import { parseCsvLine } from './recentGainers';
import { loadUniverse, TEST_START } from './studyData';

/**
 * Runs a setup card through evaluation harness v3 and writes
 * reports/<id>.md plus an entry in reports/trial-registry.json.
 * See SETUP_DISCOVERY_ROADMAP.md (Parts 2–3).
 */

export interface SignalContext {
    symbol: string;
    industry: string;
    /** NIFTY 50 close above its 50-day average on this date. */
    marketUp: (date: string) => boolean | undefined;
    /** NIFTY 50 close above its 200-day average on this date. */
    marketAbove200: (date: string) => boolean | undefined;
    /** NIFTY 50 close above its 50-day average and that average higher than 10 sessions earlier. */
    marketTrendUp?: (date: string) => boolean | undefined;
    /** Per-bar extra series from the card's `extras` loader, aligned with bars (NaN = missing). */
    extra?: Record<string, number[]>;
}

export interface SetupCard {
    id: string;
    name: string;
    /** Pre-registration document, committed before the run. */
    plan: string;
    thesis: string;
    discoveryStart: string;
    testYears: string[];
    rules?: Partial<HarnessRules>;
    /** Signal at the close of bar i (data up to i only). Return null for no signal. */
    signal: (bars: PriceBar[], ind: SeriesIndicators, i: number, ctx: SignalContext) => { score: number; exit: ExitPlan; meta?: Record<string, number> } | null;
    /** Optional loader for extra per-bar data (e.g. delivery %, open interest), aligned with the adjusted bars. */
    extras?: (symbol: string, bars: PriceBar[]) => Promise<Record<string, number[]>>;
    /** Optional cross-sectional step: adjust or filter a day's candidates (e.g. sector-level rules). */
    perDay?: (date: string, candidates: Candidate[]) => Candidate[];
    /**
     * Optional control group: every universe stock passing `include`, entered at the
     * next open on each signal day with `exit`. Adds two pass rules: average excess
     * and day-clustered excess vs the control must both be > 0 on the test period.
     */
    control?: { label: string; include: (ctx: SignalContext) => boolean; exit: ExitPlan };
}

export interface StudyResult {
    passed: boolean;
    trades: HarnessTrade[];
    discovery: TradeStats;
    test: TradeStats;
    excess: { discovery: { avg: number; dayClustered: number }; test: { avg: number; dayClustered: number } } | null;
}

/** Average of each trade's excess over its signal day's control mean, overall and per day. */
export function excessStats(trades: HarnessTrade[], controlMean: Map<string, number>): { avg: number; dayClustered: number } {
    const rows = trades.filter(trade => controlMean.has(trade.signalDate)).map(trade => ({ date: trade.signalDate, x: trade.netPct - controlMean.get(trade.signalDate)! }));
    if (!rows.length) return { avg: 0, dayClustered: 0 };
    const byDay = new Map<string, number[]>();
    for (const row of rows) { const list = byDay.get(row.date) ?? []; list.push(row.x); byDay.set(row.date, list); }
    const dayMeans = [...byDay.values()].map(list => list.reduce((s, v) => s + v, 0) / list.length);
    return { avg: rows.reduce((s, r) => s + r.x, 0) / rows.length, dayClustered: dayMeans.reduce((s, v) => s + v, 0) / dayMeans.length };
}

export interface RegistryEntry {
    id: string;
    name: string;
    plan: string;
    ranAt: string;
    kind: 'pre-registered' | 'exploration' | 'harness-check';
    discovery: { n: number; avg: number | null; dayClustered: number | null } | null;
    test: { n: number; avg: number | null; dayClustered: number | null } | null;
    verdict: 'PASS' | 'FAIL' | 'EXPLORATION';
    note?: string;
}

const REGISTRY = join('reports', 'trial-registry.json');

export function readRegistry(): RegistryEntry[] {
    return existsSync(REGISTRY) ? JSON.parse(readFileSync(REGISTRY, 'utf8')) : [];
}

export function recordTrial(entry: RegistryEntry): RegistryEntry[] {
    const list = readRegistry().filter(item => !(item.id === entry.id && item.kind === entry.kind));
    list.push(entry);
    mkdirSync('reports', { recursive: true });
    writeFileSync(REGISTRY, `${JSON.stringify(list, null, 2)}\n`);
    return list;
}

export function loadIndustries(): Map<string, string> {
    const csv = readFileSync(join('data', 'nifty500-constituents.csv'), 'utf8').trim().split(/\r?\n/).map(parseCsvLine);
    const header = csv[0].map(value => value.toLowerCase());
    return new Map(csv.slice(1).map(cols => [cols[header.indexOf('symbol')], cols[header.indexOf('industry')] || 'Unknown']));
}

const fmt = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
const statsRow = (label: string, s: TradeStats) => s.n
    ? `| ${label} | ${s.n.toLocaleString('en-IN')} | ${s.days} | ${s.winRate.toFixed(1)}% | ${fmt(s.avg)} ± ${s.ci.toFixed(2)} | ${fmt(s.dayClustered)} | ${fmt(s.withoutBest5Days)} |`
    : `| ${label} | 0 | — | — | — | — | — |`;
const STATS_HEAD = '| Period | Trades | Signal days | Win rate | Avg net (95% range) | Day-clustered | Without best 5 days |\n|---|---:|---:|---:|---:|---:|---:|';

export async function runSetupStudy(card: SetupCard, kind: RegistryEntry['kind'] = 'pre-registered', note?: string): Promise<StudyResult> {
    const rules: HarnessRules = { ...DEFAULT_RULES, ...card.rules };
    const universe = await loadUniverse();
    const industries = loadIndustries();
    const nifty = (await loadAdjustedDailySeries('NIFTY_50')).bars;
    const niftyInd = computeSeriesIndicators(nifty);
    const marketUpByDate = new Map(nifty.map((bar, i) => [bar.date, Number.isFinite(niftyInd.sma50[i]) ? bar.close > niftyInd.sma50[i] : undefined]));
    const above200ByDate = new Map(nifty.map((bar, i) => [bar.date, Number.isFinite(niftyInd.sma200[i]) ? bar.close > niftyInd.sma200[i] : undefined]));
    const marketTrendByDate = new Map(nifty.map((bar, i) => [bar.date, i >= 10 && Number.isFinite(niftyInd.sma50[i - 10])
        ? bar.close > niftyInd.sma50[i] && niftyInd.sma50[i] > niftyInd.sma50[i - 10]
        : undefined]));
    const ctxBase = { marketUp: (date: string) => marketUpByDate.get(date), marketAbove200: (date: string) => above200ByDate.get(date), marketTrendUp: (date: string) => marketTrendByDate.get(date) };

    const barsBySymbol = new Map<string, PriceBar[]>();
    const controlSeries: Array<{ bars: PriceBar[]; at: Map<string, number>; eligible: Set<string> }> = [];
    let candidates: Candidate[] = [];
    for (const [symbol, eligible] of universe) {
        const bars = (await loadAdjustedDailySeries(symbol)).bars;
        if (bars.length < 60) continue;
        const ind = computeSeriesIndicators(bars);
        const industry = industries.get(symbol) ?? 'Unknown';
        if (card.control?.include({ symbol, industry, ...ctxBase })) controlSeries.push({ bars, at: new Map(bars.map((bar, k) => [bar.date, k])), eligible });
        let used = false;
        const extra = card.extras ? await card.extras(symbol, bars) : undefined;
        for (let i = 50; i < bars.length - 1; i += 1) {
            const date = bars[i].date;
            if (date < card.discoveryStart || !eligible.has(date)) continue;
            const hit = card.signal(bars, ind, i, { symbol, industry, ...ctxBase, extra });
            if (!hit) continue;
            candidates.push({ symbol, industry, index: i, score: hit.score, exit: hit.exit, meta: hit.meta });
            used = true;
        }
        if (used) barsBySymbol.set(symbol, bars);
    }
    if (card.perDay) {
        const byDate = new Map<string, Candidate[]>();
        for (const candidate of candidates) {
            const date = barsBySymbol.get(candidate.symbol)![candidate.index].date;
            const list = byDate.get(date) ?? [];
            list.push(candidate);
            byDate.set(date, list);
        }
        candidates = [...byDate].flatMap(([date, list]) => card.perDay!(date, list));
    }

    const trades = selectTrades(candidates, barsBySymbol, rules);
    const discoveryTrades = trades.filter(trade => trade.signalDate < TEST_START);
    const testTrades = trades.filter(trade => trade.signalDate >= TEST_START);
    const discovery = tradeStats(discoveryTrades);
    const test = tradeStats(testTrades);
    const years = [...new Set(trades.map(trade => trade.signalDate.slice(0, 4)))].sort();
    const yearly = years.map(year => ({ year, stats: tradeStats(trades.filter(trade => trade.signalDate.startsWith(year))) }));
    const calendar = nifty.map(bar => bar.date);
    const portfolioTest = simulatePortfolio(testTrades, barsBySymbol, nifty, calendar, rules);
    const portfolioDiscovery = simulatePortfolio(discoveryTrades, barsBySymbol, nifty, calendar, rules);
    const verdict = judge(test, yearly, card.testYears, portfolioTest);
    let excess: StudyResult['excess'] = null;
    let controlLine = '';
    if (card.control) {
        const controlMean = new Map<string, number>();
        const exit = card.control.exit;
        for (const date of new Set(trades.map(trade => trade.signalDate))) {
            const values: number[] = [];
            for (const series of controlSeries) {
                const k = series.at.get(date);
                if (k === undefined || !series.eligible.has(date) || k + 1 >= series.bars.length) continue;
                if (exit.maxGapUpPct !== undefined && series.bars[k + 1].open > series.bars[k].close * (1 + exit.maxGapUpPct / 100)) continue;
                const result = simulateTrade(series.bars, k + 1, exit, rules.costBps);
                if (result) values.push(result.netPct);
            }
            if (values.length) controlMean.set(date, values.reduce((s, v) => s + v, 0) / values.length);
        }
        excess = { discovery: excessStats(discoveryTrades, controlMean), test: excessStats(testTrades, controlMean) };
        verdict.checks.push(
            { rule: `Average excess vs control (${card.control.label}) above 0`, value: fmt(excess.test.avg), pass: excess.test.avg > 0 },
            { rule: 'Day-clustered excess vs control above 0', value: fmt(excess.test.dayClustered), pass: excess.test.dayClustered > 0 },
        );
        verdict.passed = verdict.checks.every(check => check.pass);
        controlLine = `Control group (${card.control.label}): excess per trade, discovery ${fmt(excess.discovery.avg)} (day-clustered ${fmt(excess.discovery.dayClustered)}); test ${fmt(excess.test.avg)} (day-clustered ${fmt(excess.test.dayClustered)}).`;
    }
    const regime = (list: HarnessTrade[], up: boolean) => tradeStats(list.filter(trade => marketUpByDate.get(trade.signalDate) === up));

    const registry = recordTrial({
        id: card.id,
        name: card.name,
        plan: card.plan,
        ranAt: new Date().toISOString(),
        kind,
        discovery: { n: discovery.n, avg: discovery.avg, dayClustered: discovery.dayClustered },
        test: { n: test.n, avg: test.avg, dayClustered: test.dayClustered },
        verdict: verdict.passed ? 'PASS' : 'FAIL',
        note,
    });

    const portfolioRow = (label: string, p: ReturnType<typeof simulatePortfolio>) => p
        ? `| ${label} | ${p.startDate} → ${p.endDate} | ${fmt(p.cagrPct)} | ${p.maxDrawdownPct.toFixed(1)}% | ${fmt(p.benchmarkCagrPct)} | ${p.benchmarkMaxDrawdownPct.toFixed(1)}% |`
        : `| ${label} | — | — | — | — | — |`;
    const lines = [
        `# ${card.name}`,
        '',
        `Generated: ${new Date().toISOString()} · evaluation harness v3 · ${kind}`,
        '',
        `Plan: [\`${card.plan}\`](${card.plan}). Thesis: ${card.thesis}`,
        '',
        `Trader rules: top ${rules.topN} candidates per day by score, at most ${rules.maxPerSector} per industry, at most ${rules.maxPositions} open positions, no re-entry while held, ${rules.costBps / 100}% round-trip costs, exits only on tradeable bars. Portfolio sizing: equity ÷ ${rules.maxPositions} per position, capped at ${rules.riskPerTrade * 100}% of equity at risk when the setup has a stop.`,
        '',
        `Raw candidates: ${candidates.length.toLocaleString('en-IN')}; trades taken: ${trades.length.toLocaleString('en-IN')}; exits delayed by suspension or a locked price: ${trades.filter(trade => trade.delayedExit).length}. Studies logged in the trial registry so far: ${registry.length} (see reports/trial-registry.json; the scanner replay alone covered 21 setup types).`,
        '',
        `## Verdict: ${verdict.passed ? '**PASS**' : '**FAIL**'}${kind === 'harness-check' ? ' (harness check, not a new study)' : ''}`,
        '',
        '| Rule (test period) | Result | Pass |',
        '|---|---:|:---:|',
        ...verdict.checks.map(check => `| ${check.rule} | ${check.value} | ${check.pass ? '✅' : '❌'} |`),
        '',
        '## Trades',
        '',
        STATS_HEAD,
        statsRow('Discovery', discovery),
        statsRow('**Test**', test),
        '',
        ...(controlLine ? [controlLine, ''] : []),
        '## Portfolio',
        '',
        '| Period | Dates | Net CAGR | Max drawdown | NIFTY 50 CAGR | NIFTY 50 max drawdown |',
        '|---|---|---:|---:|---:|---:|',
        portfolioRow('Discovery', portfolioDiscovery),
        portfolioRow('**Test**', portfolioTest),
        '',
        '## By year',
        '',
        STATS_HEAD.replace('Period', 'Year'),
        ...yearly.map(item => statsRow(`${item.year}${card.testYears.includes(item.year) ? ' (test)' : ''}`, item.stats)),
        '',
        '## By market regime (NIFTY 50 vs its 50-day average on the signal day)',
        '',
        STATS_HEAD,
        statsRow('Discovery, market up', regime(discoveryTrades, true)),
        statsRow('Discovery, market down', regime(discoveryTrades, false)),
        statsRow('Test, market up', regime(testTrades, true)),
        statsRow('Test, market down', regime(testTrades, false)),
        '',
        ...(note ? [`Note: ${note}`, ''] : []),
        'Research output, not investment advice.',
        '',
    ];
    writeFileSync(join('reports', `${card.id}.md`), lines.join('\n'));
    console.log(`[Study] ${card.id}: test n=${test.n} avg=${fmt(test.avg)} day=${fmt(test.dayClustered)} → ${verdict.passed ? 'PASS' : 'FAIL'}`);
    return { passed: verdict.passed, trades, discovery, test, excess };
}

export async function runCli(card: SetupCard, kind: RegistryEntry['kind'] = 'pre-registered', note?: string): Promise<void> {
    try {
        await runSetupStudy(card, kind, note);
    } catch (error: any) {
        console.error(`[Study] ${card.id} failed:`, error?.message ?? error);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}
