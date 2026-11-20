import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import prisma from './prismaClient';
import { fetchToday, istToday } from './earlySession';
import { istParts } from './research/intradayPilot';
import { loadIndustries } from './research/studyRunner';

/**
 * Trading desk (docs/TRADING_DESK_ARCHITECTURE.md): market regime gate,
 * morning confirmation, catalysts and exit advice. Rules only; every value
 * below is v1 and untested until the regime backtest runs.
 */
export const DESK_RULES = {
    version: 'desk-v1',
    universe: 500,
    greenBreadthPct: 50,
    redBreadthPct: 35,
    maxStopPct: 2.5,
    maxChasePct: 0.3,
    firstTargetPct: 5,
    timeStopSessions: 7,
    drawdownBrakePct: 5,
    brakeDays: 7,
    resultsWindowSessions: 5,
} as const;

export type RegimeState = 'GREEN' | 'AMBER' | 'RED';
export interface RegimeDay {
    date: string;
    state: RegimeState;
    breadthPct: number;
    stocks: number;
    nifty: number;
    niftySma50: number;
    niftySma200: number;
}

/** Classify one day. Pure. */
export function classifyRegime(input: { breadthPct: number; nifty: number; niftySma50: number; niftySma200: number }, rules = DESK_RULES): { state: RegimeState; reasons: string[] } {
    const reasons: string[] = [];
    const above50 = input.nifty > input.niftySma50;
    const above200 = input.nifty > input.niftySma200;
    reasons.push(`NIFTY ${above50 ? 'above' : 'below'} its 50-day average, ${above200 ? 'above' : 'below'} its 200-day average`);
    reasons.push(`${input.breadthPct.toFixed(0)}% of the top ${rules.universe} stocks above their 50-day average`);
    if (!above200 || input.breadthPct < rules.redBreadthPct) return { state: 'RED', reasons };
    if (above50 && input.breadthPct >= rules.greenBreadthPct) return { state: 'GREEN', reasons };
    return { state: 'AMBER', reasons };
}

let regimeCache: { key: string; days: RegimeDay[] } | null = null;

/** Daily regime history from NSE daily candles (point-in-time top 500 by 20-day turnover, EQ only). */
export async function regimeHistory(from = '2021-01-01'): Promise<RegimeDay[]> {
    const latest = await prisma.dailyCandle.findFirst({ where: { symbol: 'NIFTY_50' }, orderBy: { tradingDate: 'desc' }, select: { tradingDate: true } });
    const key = `${from}|${latest?.tradingDate.toISOString()}`;
    if (regimeCache?.key === key) return regimeCache.days;
    const start = new Date(new Date(`${from}T00:00:00Z`).getTime() - 120 * 86_400_000);
    const breadth = await prisma.$queryRaw<Array<{ d: Date; breadth: number; stocks: number }>>(Prisma.sql`
        WITH c AS (
            SELECT c.symbol, c."tradingDate" AS d, c.series, c.close,
                   AVG(c.close) OVER w50 AS sma50, COUNT(*) OVER w50 AS n50,
                   AVG(c."turnoverCr") OVER w20 AS t20
            FROM "DailyCandle" c JOIN "MarketInstrument" m ON m.symbol = c.symbol
            WHERE c."isFinal" = true AND m.isin LIKE 'INE%' AND c."tradingDate" >= ${start}
            WINDOW w50 AS (PARTITION BY c.symbol ORDER BY c."tradingDate" ROWS BETWEEN 49 PRECEDING AND CURRENT ROW),
                   w20 AS (PARTITION BY c.symbol ORDER BY c."tradingDate" ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)
        ),
        r AS (SELECT d, close > sma50 AS above, RANK() OVER (PARTITION BY d ORDER BY t20 DESC) AS rk FROM c WHERE n50 = 50 AND series = 'EQ')
        SELECT d, (100.0 * AVG(CASE WHEN above THEN 1 ELSE 0 END))::float8 AS breadth, COUNT(*)::int AS stocks
        FROM r WHERE rk <= ${DESK_RULES.universe} AND d >= ${new Date(`${from}T00:00:00Z`)}
        GROUP BY d ORDER BY d`);
    const nifty = await prisma.dailyCandle.findMany({ where: { symbol: 'NIFTY_50', isFinal: true }, orderBy: { tradingDate: 'asc' }, select: { tradingDate: true, close: true } });
    const niftyBy = new Map<string, { close: number; sma50: number; sma200: number }>();
    for (let i = 199; i < nifty.length; i += 1) {
        const avg = (n: number) => nifty.slice(i - n + 1, i + 1).reduce((s, r) => s + r.close, 0) / n;
        niftyBy.set(nifty[i].tradingDate.toISOString().slice(0, 10), { close: nifty[i].close, sma50: avg(50), sma200: avg(200) });
    }
    const days: RegimeDay[] = breadth.flatMap(row => {
        const date = row.d.toISOString().slice(0, 10);
        const n = niftyBy.get(date);
        if (!n || row.stocks < 300) return [];
        const { state } = classifyRegime({ breadthPct: row.breadth, nifty: n.close, niftySma50: n.sma50, niftySma200: n.sma200 });
        return [{ date, state, breadthPct: Math.round(row.breadth * 10) / 10, stocks: row.stocks, nifty: n.close, niftySma50: Math.round(n.sma50 * 100) / 100, niftySma200: Math.round(n.sma200 * 100) / 100 }];
    });
    regimeCache = { key, days };
    return days;
}

export async function currentRegime(): Promise<{ today: (RegimeDay & { reasons: string[] }) | null; history: Array<Pick<RegimeDay, 'date' | 'state' | 'breadthPct'>> }> {
    // The app needs about a year; the full 2021+ history is for backtests.
    const days = await regimeHistory(new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10));
    const last = days.at(-1);
    return {
        today: last ? { ...last, reasons: classifyRegime({ breadthPct: last.breadthPct, nifty: last.nifty, niftySma50: last.niftySma50, niftySma200: last.niftySma200 }).reasons } : null,
        history: days.map(d => ({ date: d.date, state: d.state, breadthPct: d.breadthPct })),
    };
}

// ── Catalysts ────────────────────────────────────────────────────────────────

export interface Catalyst { symbol: string; sector: string; resultsDate: string | null; sector5dPct: number | null; sectorRank: number | null; sectorCount: number }

/** Results in the next few sessions and the stock's sector 5-day strength rank. */
export async function catalystsFor(symbols: string[]): Promise<Catalyst[]> {
    if (!symbols.length) return [];
    const industries = loadIndustries();
    const today = new Date(`${istToday().date}T00:00:00Z`);
    const horizon = new Date(today.getTime() + (DESK_RULES.resultsWindowSessions + 3) * 86_400_000);
    const results = await prisma.resultsEvent.findMany({ where: { symbol: { in: symbols }, meetingDate: { gte: today, lte: horizon } }, orderBy: { meetingDate: 'asc' } }).catch(() => []);
    const resultsBy = new Map<string, string>();
    for (const r of results) if (!resultsBy.has(r.symbol)) resultsBy.set(r.symbol, r.meetingDate.toISOString().slice(0, 10));

    // Sector 5-session return: average of top-500 stocks with an industry label.
    const rows = await prisma.$queryRaw<Array<{ symbol: string; r5: number }>>(Prisma.sql`
        WITH d AS (SELECT DISTINCT "tradingDate" FROM "DailyCandle" WHERE symbol = 'NIFTY_50' ORDER BY "tradingDate" DESC LIMIT 6),
        lim AS (SELECT MIN("tradingDate") AS first, MAX("tradingDate") AS last FROM d),
        c AS (
            SELECT c.symbol,
                   MAX(CASE WHEN c."tradingDate" = (SELECT last FROM lim) THEN c.close END) AS last_close,
                   MAX(CASE WHEN c."tradingDate" = (SELECT first FROM lim) THEN c.close END) AS first_close,
                   MAX(CASE WHEN c."tradingDate" = (SELECT last FROM lim) THEN c."turnoverCr" END) AS turnover
            FROM "DailyCandle" c WHERE c."tradingDate" IN (SELECT "tradingDate" FROM d) AND c.series = 'EQ'
            GROUP BY c.symbol
        )
        SELECT symbol, (100.0 * (last_close / first_close - 1))::float8 AS r5 FROM c
        WHERE last_close > 0 AND first_close > 0 ORDER BY turnover DESC NULLS LAST LIMIT ${DESK_RULES.universe}`);
    const bySector = new Map<string, number[]>();
    for (const row of rows) {
        const sector = industries.get(row.symbol);
        if (!sector || sector === 'Unknown') continue;
        bySector.set(sector, [...(bySector.get(sector) ?? []), row.r5]);
    }
    const ranked = [...bySector].filter(([, list]) => list.length >= 3)
        .map(([sector, list]) => ({ sector, avg: list.reduce((s, v) => s + v, 0) / list.length }))
        .sort((a, b) => b.avg - a.avg);
    const rankBy = new Map(ranked.map((s, i) => [s.sector, { rank: i + 1, avg: s.avg }]));
    return symbols.map(symbol => {
        const sector = industries.get(symbol) ?? 'Unknown';
        const rank = rankBy.get(sector);
        return { symbol, sector, resultsDate: resultsBy.get(symbol) ?? null, sector5dPct: rank ? Math.round(rank.avg * 100) / 100 : null, sectorRank: rank?.rank ?? null, sectorCount: ranked.length };
    });
}

// ── Morning confirmation ─────────────────────────────────────────────────────

export interface Confirmation {
    symbol: string;
    status: 'CONFIRMED' | 'NOT_TRIGGERED' | 'STOP_TOO_WIDE' | 'NO_DATA';
    price945: number | null;
    previousHigh: number | null;
    dayLow: number | null;
    maxEntry: number | null;
    stop: number | null;
    stopPct: number | null;
    target: number | null;
    rewardRisk: number | null;
}

/** Evening-watchlist check at 09:45: above yesterday's high, stop under today's low within the limit. Pure. */
export function confirmAt945(symbol: string, bars: Array<{ time: string; high: number; low: number; close: number }>, previousHigh: number | null, rules = DESK_RULES): Confirmation {
    const empty = { price945: null, previousHigh, dayLow: null, maxEntry: null, stop: null, stopPct: null, target: null, rewardRisk: null };
    const window = bars.filter(b => b.time >= '09:15' && b.time <= '09:40').sort((a, b) => a.time.localeCompare(b.time));
    if (window.length < 6 || !previousHigh) return { symbol, status: 'NO_DATA', ...empty };
    const price945 = window.at(-1)!.close;
    const dayLow = Math.min(...window.map(b => b.low));
    const stopPct = (1 - dayLow / price945) * 100;
    const target = price945 * (1 + rules.firstTargetPct / 100);
    const base = { symbol, price945, previousHigh, dayLow, maxEntry: price945 * (1 + rules.maxChasePct / 100), stop: dayLow, stopPct, target, rewardRisk: stopPct > 0 ? rules.firstTargetPct / stopPct : null };
    if (!(price945 > previousHigh)) return { ...base, status: 'NOT_TRIGGERED' };
    if (stopPct > rules.maxStopPct) return { ...base, status: 'STOP_TOO_WIDE' };
    return { ...base, status: 'CONFIRMED' };
}

const CONFIRM_DIR = join(process.cwd(), 'data', 'morning-confirm');

/** Check the evening watchlist at 09:45 (live fetch from Dhan) or replay a stored day. */
export async function runMorningConfirmation(symbols: string[], options: { date?: string } = {}): Promise<{ date: string; generatedAt: string; regime: RegimeState | null; results: Confirmation[] }> {
    const unique = [...new Set(symbols.map(s => s.toUpperCase()))].slice(0, 60);
    const now = istToday();
    const date = options.date ?? now.date;
    if (date === now.date) {
        if (now.time < '09:45') throw new Error('Morning confirmation runs from 09:45 IST, once the 09:40 candle has closed.');
        await fetchToday(date, unique);
    }
    const day = new Date(`${date}T00:00:00Z`);
    const [bars, prev] = await Promise.all([
        prisma.intradayCandle.findMany({ where: { symbol: { in: unique }, tradingDate: day }, select: { symbol: true, startTime: true, high: true, low: true, close: true } }),
        prisma.$queryRaw<Array<{ symbol: string; high: number }>>(Prisma.sql`
            SELECT DISTINCT ON (symbol) symbol, high FROM "DailyCandle"
            WHERE symbol IN (${Prisma.join(unique)}) AND "tradingDate" < ${day} AND "isFinal" = true
            ORDER BY symbol, "tradingDate" DESC`),
    ]);
    const prevBy = new Map(prev.map(p => [p.symbol, p.high]));
    const barsBy = new Map<string, Array<{ time: string; high: number; low: number; close: number }>>();
    for (const b of bars) barsBy.set(b.symbol, [...(barsBy.get(b.symbol) ?? []), { time: istParts(b.startTime).time, high: b.high, low: b.low, close: b.close }]);
    const regime = await regimeHistory(new Date(new Date(`${date}T00:00:00Z`).getTime() - 400 * 86_400_000).toISOString().slice(0, 10)).then(days => days.filter(d => d.date < date).at(-1)?.state ?? null).catch(() => null);
    const results = unique.map(symbol => confirmAt945(symbol, barsBy.get(symbol) ?? [], prevBy.get(symbol) ?? null))
        .sort((a, b) => ['CONFIRMED', 'STOP_TOO_WIDE', 'NOT_TRIGGERED', 'NO_DATA'].indexOf(a.status) - ['CONFIRMED', 'STOP_TOO_WIDE', 'NOT_TRIGGERED', 'NO_DATA'].indexOf(b.status));
    const out = { date, generatedAt: new Date().toISOString(), regime, results };
    if (!existsSync(CONFIRM_DIR)) mkdirSync(CONFIRM_DIR, { recursive: true });
    writeFileSync(join(CONFIRM_DIR, `${date}.json`), JSON.stringify(out, null, 2));
    return out;
}

// ── Exit assistant ───────────────────────────────────────────────────────────

export interface ExitAdvice {
    tradeId: string;
    ticker: string;
    action: 'EXIT_STOP' | 'TAKE_HALF' | 'TRAIL' | 'TIME_EXIT' | 'HOLD';
    message: string;
    lastClose: number | null;
    gainPct: number | null;
    rNow: number | null;
    sessionsHeld: number;
    suggestedStop: number;
}

/** Advice for one open position from the latest daily candles. Pure. */
export function adviseExit(trade: { id: string; ticker: string; entryPrice: number; stopLossInit: number; stopLossTrail?: number | null }, lastBars: Array<{ high: number; low: number; close: number }>, sessionsHeld: number, rules = DESK_RULES): ExitAdvice {
    const last = lastBars.at(-1);
    const stop = trade.stopLossTrail && trade.stopLossTrail > trade.stopLossInit ? trade.stopLossTrail : trade.stopLossInit;
    const risk = trade.entryPrice - trade.stopLossInit;
    const base = { tradeId: trade.id, ticker: trade.ticker, lastClose: last?.close ?? null, sessionsHeld, suggestedStop: stop };
    if (!last) return { ...base, action: 'HOLD', message: 'No daily candle since entry yet.', gainPct: null, rNow: null };
    const gainPct = (last.close / trade.entryPrice - 1) * 100;
    const rNow = risk > 0 ? (last.close - trade.entryPrice) / risk : null;
    const maxHigh = Math.max(...lastBars.map(b => b.high));
    const reachedTarget = maxHigh >= trade.entryPrice * (1 + rules.firstTargetPct / 100);
    const withGain = { ...base, gainPct, rNow };
    if (last.low <= stop) return { ...withGain, action: 'EXIT_STOP', message: `Traded at or below the stop (${stop.toFixed(2)}). If your stop order did not fill, exit at the next open.` };
    if (reachedTarget && stop < trade.entryPrice) {
        return { ...withGain, action: 'TAKE_HALF', suggestedStop: trade.entryPrice, message: `Reached +${rules.firstTargetPct}%. Sell half and move the stop to your entry (${trade.entryPrice.toFixed(2)}).` };
    }
    if (reachedTarget) {
        const trail = Math.max(stop, last.low);
        return { ...withGain, action: 'TRAIL', suggestedStop: trail, message: `Trail the rest: stop under the last session's low (${trail.toFixed(2)}).` };
    }
    if (sessionsHeld >= rules.timeStopSessions) return { ...withGain, action: 'TIME_EXIT', message: `${sessionsHeld} sessions without reaching +${rules.firstTargetPct}%. Time stop: exit at the next open.` };
    return { ...withGain, action: 'HOLD', message: `Hold. Stop ${stop.toFixed(2)}; +${rules.firstTargetPct}% target ${(trade.entryPrice * (1 + rules.firstTargetPct / 100)).toFixed(2)}; time stop after ${rules.timeStopSessions} sessions.` };
}

export async function exitAdviceFor(userId: string): Promise<ExitAdvice[]> {
    const open = await prisma.trade.findMany({ where: { userId, status: 'OPEN' } });
    return Promise.all(open.map(async trade => {
        const entryDay = new Date(`${trade.entryDate.toISOString().slice(0, 10)}T00:00:00Z`);
        const bars = await prisma.dailyCandle.findMany({ where: { symbol: trade.ticker, isFinal: true, tradingDate: { gte: entryDay } }, orderBy: { tradingDate: 'asc' }, select: { high: true, low: true, close: true } });
        return adviseExit({ id: trade.id, ticker: trade.ticker, entryPrice: trade.entryPrice, stopLossInit: trade.stopLossInit, stopLossTrail: trade.stopLossTrail }, bars, bars.length);
    }));
}
