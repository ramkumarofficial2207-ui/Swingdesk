import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import prisma from './prismaClient';
import { getDhanApiFromEnv } from './dhanClient';
import { loadIndustries } from './research/studyRunner';
import { istParts, storeIntradayCandles } from './research/intradayPilot';

/**
 * Early-session scan (research only). At 09:45 IST, using completed 5-minute
 * candles only, list stocks with unusual opening volume whose sector is
 * bunched among the top gainers and that broke their opening range.
 * Rules are ChatGPT's draft, frozen here, with exits moved to 15:10 because
 * F&O stocks have no continuous bars after 15:10 since 2026-08-03
 * (reports/intraday-pilot-findings.md). Not validated: every result is
 * labelled research only until the history test passes.
 */
export const EARLY_RULES = {
    version: 'early-session-v1',
    universe: 500,
    signalBars: ['09:15', '09:20', '09:25', '09:30', '09:35', '09:40'], // complete by 09:45
    openingRangeBars: ['09:15', '09:20', '09:25'], // 09:15–09:30
    baselineSessions: 20,
    minRelativeVolume: 2.0,
    topGainers: 30,
    minSectorInTop: 4,
    minSectorOverrepresentation: 3,
    maxChasePct: 0.3,
    maxStopPct: 1.25,
    targetR: 1.5,
    exitTime: '15:10',
} as const;

export interface Bar { time: string; open: number; high: number; low: number; close: number; volume: number }
export interface StockSession { symbol: string; sector: string; bars: Bar[]; baselineVolume: number | null }

export interface EarlySetup {
    symbol: string;
    sector: string;
    relativeVolume: number;
    returnPct: number;
    price945: number;
    openingRangeHigh: number;
    maxEntry: number;
    stop: number;
    stopPct: number;
    target: number;
    targetPct: number;
}

export interface SectorCluster { sector: string; inTop: number; universeShare: number; topShare: number }

export interface EarlySessionResult {
    version: string;
    date: string;
    generatedAt: string;
    mode: 'LIVE' | 'REPLAY';
    universe: number;
    withData: number;
    clusters: SectorCluster[];
    setups: EarlySetup[];
    /** Passed volume + sector + breakout but the stop was too wide. */
    skippedWideStop: Array<{ symbol: string; stopPct: number }>;
    note?: string;
}

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Apply the frozen rules to one session. Pure: no database, no clock. */
export function scoreEarlySession(sessions: StockSession[], rules = EARLY_RULES): Pick<EarlySessionResult, 'withData' | 'clusters' | 'setups' | 'skippedWideStop'> {
    const ready = sessions.flatMap(session => {
        const byTime = new Map(session.bars.map(bar => [bar.time, bar]));
        const window = rules.signalBars.map(time => byTime.get(time));
        if (window.some(bar => !bar)) return [];
        const bars = window as Bar[];
        const range = rules.openingRangeBars.map(time => byTime.get(time)!);
        const volume = bars.reduce((sum, bar) => sum + bar.volume, 0);
        return [{
            session,
            returnPct: (bars.at(-1)!.close / bars[0].open - 1) * 100,
            relativeVolume: session.baselineVolume && session.baselineVolume > 0 ? volume / session.baselineVolume : null,
            price945: bars.at(-1)!.close,
            openingRangeHigh: Math.max(...range.map(bar => bar.high)),
            openingRangeLow: Math.min(...range.map(bar => bar.low)),
        }];
    });
    const sectorTotal = new Map<string, number>();
    for (const row of ready) sectorTotal.set(row.session.sector, (sectorTotal.get(row.session.sector) ?? 0) + 1);
    const top = [...ready].sort((a, b) => b.returnPct - a.returnPct || a.session.symbol.localeCompare(b.session.symbol)).slice(0, rules.topGainers);
    const topCount = new Map<string, number>();
    for (const row of top) topCount.set(row.session.sector, (topCount.get(row.session.sector) ?? 0) + 1);
    const clusters: SectorCluster[] = [...topCount]
        .filter(([sector]) => sector !== 'Unknown')
        .map(([sector, inTop]) => ({
            sector,
            inTop,
            universeShare: (sectorTotal.get(sector) ?? 0) / Math.max(1, ready.length),
            topShare: inTop / Math.max(1, top.length),
        }))
        .filter(cluster => cluster.inTop >= rules.minSectorInTop && cluster.topShare >= rules.minSectorOverrepresentation * cluster.universeShare)
        .sort((a, b) => b.inTop - a.inTop);
    const clustered = new Set(clusters.map(cluster => cluster.sector));

    const setups: EarlySetup[] = [];
    const skippedWideStop: EarlySessionResult['skippedWideStop'] = [];
    for (const row of ready) {
        if (!clustered.has(row.session.sector)) continue;
        if (row.relativeVolume === null || row.relativeVolume < rules.minRelativeVolume) continue;
        if (!(row.price945 > row.openingRangeHigh)) continue;
        const maxEntry = row.price945 * (1 + rules.maxChasePct / 100);
        const stopPct = (1 - row.openingRangeLow / row.price945) * 100;
        if (stopPct > rules.maxStopPct) { skippedWideStop.push({ symbol: row.session.symbol, stopPct: round(stopPct) }); continue; }
        const target = row.price945 + rules.targetR * (row.price945 - row.openingRangeLow);
        setups.push({
            symbol: row.session.symbol,
            sector: row.session.sector,
            relativeVolume: round(row.relativeVolume),
            returnPct: round(row.returnPct),
            price945: round(row.price945),
            openingRangeHigh: round(row.openingRangeHigh),
            maxEntry: round(maxEntry),
            stop: round(row.openingRangeLow),
            stopPct: round(stopPct),
            target: round(target),
            targetPct: round((target / row.price945 - 1) * 100),
        });
    }
    setups.sort((a, b) => b.relativeVolume - a.relativeVolume);
    return { withData: ready.length, clusters, setups, skippedWideStop };
}

/** Point-in-time universe for a session: top N by 20-day turnover as of the previous session, EQ only. */
async function universeFor(date: string, size: number): Promise<string[]> {
    const rows = await prisma.$queryRaw<Array<{ symbol: string }>>(Prisma.sql`
        WITH prev AS (SELECT MAX("tradingDate") AS d FROM "DailyCandle" WHERE symbol = 'NIFTY_50' AND "tradingDate" < ${new Date(`${date}T00:00:00Z`)}),
        t AS (
            SELECT c.symbol, c."tradingDate" AS d, c.series, AVG(c."turnoverCr") OVER w AS t20, COUNT(c."turnoverCr") OVER w AS cnt
            FROM "DailyCandle" c JOIN "MarketInstrument" m ON m.symbol = c.symbol
            WHERE c."isFinal" = true AND m.isin LIKE 'INE%' AND c."tradingDate" > (SELECT d FROM prev) - INTERVAL '45 days' AND c."tradingDate" <= (SELECT d FROM prev)
            WINDOW w AS (PARTITION BY c.symbol ORDER BY c."tradingDate" ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)
        )
        SELECT symbol FROM t WHERE d = (SELECT d FROM prev) AND cnt = 20 AND series = 'EQ' ORDER BY t20 DESC LIMIT ${size}`);
    return rows.map(row => row.symbol);
}

/** Today's (or a past day's) bars plus the 20-session median 09:15–09:45 volume for each symbol. */
async function loadSessions(date: string, symbols: string[]): Promise<StockSession[]> {
    const industries = loadIndustries();
    const day = new Date(`${date}T00:00:00Z`);
    const bars = await prisma.intradayCandle.findMany({
        where: { symbol: { in: symbols }, tradingDate: day },
        orderBy: { startTime: 'asc' },
    });
    const baseline = await prisma.$queryRaw<Array<{ symbol: string; median: number | null }>>(Prisma.sql`
        WITH sessions AS (
            SELECT symbol, "tradingDate" AS d, SUM(volume)::float8 AS v, COUNT(*) AS n
            FROM "IntradayCandle"
            WHERE symbol IN (${Prisma.join(symbols)}) AND "tradingDate" < ${day} AND "tradingDate" >= ${day}::date - INTERVAL '45 days'
              AND to_char("startTime" AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') IN (${Prisma.join([...EARLY_RULES.signalBars])})
              AND EXTRACT(ISODOW FROM "tradingDate") < 6
            GROUP BY symbol, "tradingDate"
        ),
        ranked AS (SELECT symbol, v, ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY d DESC) AS r FROM sessions WHERE n = ${EARLY_RULES.signalBars.length})
        SELECT symbol, percentile_cont(0.5) WITHIN GROUP (ORDER BY v) AS median
        FROM ranked WHERE r <= ${EARLY_RULES.baselineSessions}
        GROUP BY symbol HAVING COUNT(*) >= ${Math.ceil(EARLY_RULES.baselineSessions * 0.75)}`);
    const medianBy = new Map(baseline.map(row => [row.symbol, row.median]));
    const barsBy = new Map<string, Bar[]>();
    for (const bar of bars) {
        const list = barsBy.get(bar.symbol) ?? [];
        list.push({ time: istParts(bar.startTime).time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: Number(bar.volume) });
        barsBy.set(bar.symbol, list);
    }
    return symbols.map(symbol => ({ symbol, sector: industries.get(symbol) ?? 'Unknown', bars: barsBy.get(symbol) ?? [], baselineVolume: medianBy.get(symbol) ?? null }));
}

/** Fetch today's 09:15→now 5-minute bars for the universe from Dhan, a few requests at a time. */
async function fetchToday(date: string, symbols: string[]): Promise<number> {
    const api = getDhanApiFromEnv();
    if (!api) throw new Error('Dhan is not configured. Add a valid DHAN_ACCESS_TOKEN to .env.');
    const from = new Date(`${date}T09:15:00+05:30`);
    const to = new Date(Math.min(Date.now(), new Date(`${date}T15:30:00+05:30`).getTime()));
    let failures = 0;
    const queue = [...symbols];
    const worker = async () => {
        for (let symbol = queue.shift(); symbol; symbol = queue.shift()) {
            try {
                await storeIntradayCandles(symbol, await api.getHistoricalDataRange(symbol, '5m', from, to));
            } catch (error: any) {
                if (/401|authentication|DH-90/i.test(String(error?.message ?? error))) throw new Error('Dhan rejected the request. Refresh DHAN_ACCESS_TOKEN (tokens last 24 hours) and check the Data APIs plan.');
                failures += 1;
            }
            await new Promise(resolve => setTimeout(resolve, 220));
        }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    return failures;
}

const STORE_DIR = join(process.cwd(), 'data', 'early-session');

export function istToday(now = new Date()): { date: string; time: string } {
    return istParts(now);
}

/** Run the scan. Live: fetches today's bars first (only after 09:45 IST). Replay: uses stored bars for a past date. */
export async function runEarlySession(options: { date?: string; now?: Date } = {}): Promise<EarlySessionResult> {
    const today = istToday(options.now);
    const date = options.date ?? today.date;
    const live = date === today.date;
    if (live && today.time < '09:45') throw new Error('The early-session scan runs from 09:45 IST, once the 09:40 candle has closed.');
    const symbols = await universeFor(date, EARLY_RULES.universe);
    if (!symbols.length) throw new Error(`No universe for ${date}: daily candles for the previous session are missing.`);
    let note: string | undefined;
    if (live) {
        const failures = await fetchToday(date, symbols);
        if (failures) note = `${failures} of ${symbols.length} stocks could not be fetched from Dhan.`;
    }
    const scored = scoreEarlySession(await loadSessions(date, symbols));
    const missingBaseline = symbols.length - scored.withData;
    if (!note && missingBaseline > symbols.length * 0.2) note = `${missingBaseline} of ${symbols.length} stocks had no complete 09:15–09:45 data for this date.`;
    const result: EarlySessionResult = {
        version: EARLY_RULES.version,
        date,
        generatedAt: new Date().toISOString(),
        mode: live ? 'LIVE' : 'REPLAY',
        universe: symbols.length,
        ...scored,
        ...(note ? { note } : {}),
    };
    mkdirSync(STORE_DIR, { recursive: true });
    writeFileSync(join(STORE_DIR, `${date}.json`), JSON.stringify(result, null, 2));
    return result;
}

/** The stored result for a date (default: the latest stored one). */
export function loadEarlySession(date?: string): EarlySessionResult | null {
    if (!existsSync(STORE_DIR)) return null;
    const file = date
        ? `${date}.json`
        : readdirSync(STORE_DIR).filter((name: string) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().at(-1);
    if (!file || !existsSync(join(STORE_DIR, file))) return null;
    return JSON.parse(readFileSync(join(STORE_DIR, file), 'utf8'));
}
