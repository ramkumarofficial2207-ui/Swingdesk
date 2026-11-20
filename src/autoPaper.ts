import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import prisma from './prismaClient';
import { loadAdjustedDailySeries, loadCorporateActions } from './adjustedCandles';
import { PriceBar } from './corporateActions';
import { ExitPlan, simulateTrade } from './research/harness';
import { computeSeriesIndicators, momentumReturn, SeriesIndicators, topThreshold } from './research/momentumPullback';
import { trendRidePullback } from './research/cards/trendRide';
import { loadIndustries } from './research/studyRunner';
import { factorAfter } from './paperTracker';

/**
 * Automatic paper trading (never places orders).
 *
 * Each evening, after the finalized NSE candles are in:
 *   1. advance every open auto paper trade with the new candles,
 *   2. pick the top 3 stocks of each strategy for the latest session,
 *   3. write reports/auto-paper.md (scorecard per strategy).
 *
 * Trade rules for every strategy: buy at the next session's open (skip if it
 * opens more than 3% above the signal close), target +5%, stop −2.5%, exit at
 * the close of session 15. A day touching both levels counts as the stop.
 * 0.4% round-trip costs.
 *
 *   npm run paper:auto                 (latest finalized session)
 *   npm run paper:auto -- --date=2026-11-19
 */

export const AUTO_RULES = { perStrategy: 3, targetPct: 5, stopPct: 2.5, horizon: 15, maxGapUpPct: 3, costBps: 40, verdictTrades: 30, breakEvenHitRate: 40 } as const;
export const AUTO_EXIT: ExitPlan = { stopPct: AUTO_RULES.stopPct, targetPct: AUTO_RULES.targetPct, horizon: AUTO_RULES.horizon, maxGapUpPct: AUTO_RULES.maxGapUpPct };
export type Strategy = 'TREND_PULLBACK' | 'SECTOR_MOMENTUM' | 'DELIVERY_OI';
export const STRATEGIES: Record<Strategy, string> = {
    TREND_PULLBACK: 'Top 10% 6-month strength, uptrend, 3–8% pullback to the 20-day average, NIFTY trending up',
    SECTOR_MOMENTUM: 'Industry with ≥ 4 stocks in the day’s top 30 gainers; its most-traded names above the 50-day average',
    DELIVERY_OI: 'Up ≥ 1% with delivery % ≥ 1.5× its 20-day average and futures OI up ≥ 3% (long build-up), above the 50-day average',
};

/** Everything a picker needs about one stock at the signal close. */
export interface StockSnapshot {
    symbol: string;
    industry: string;
    bars: PriceBar[];
    ind: SeriesIndicators;
    /** Index of the signal session in bars. */
    i: number;
    strength: number | null;
    turnover20: number;
    deliveryPct: number | null;
    avgDeliveryPct20: number | null;
    /** Futures OI change today as a % of yesterday's OI; null if not an F&O stock. */
    futOiChangePct: number | null;
}

export interface Pick {
    strategy: Strategy;
    symbol: string;
    score: number;
    reason: string;
}

const pct = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
const todayPct = (s: StockSnapshot) => (s.i > 0 ? (s.bars[s.i].close / s.bars[s.i - 1].close - 1) * 100 : 0);
const top = (list: Pick[]) => list.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol)).slice(0, AUTO_RULES.perStrategy);

export function pickTrendPullback(stocks: StockSnapshot[], marketTrendUp: boolean): Pick[] {
    if (!marketTrendUp) return [];
    const threshold = topThreshold(stocks.flatMap(s => (s.strength === null ? [] : [s.strength])), 0.1);
    return top(stocks.flatMap(s => {
        if (s.strength === null || s.strength < threshold) return [];
        const check = trendRidePullback(s.bars, s.ind, s.i);
        return check.passes ? [{ strategy: 'TREND_PULLBACK' as const, symbol: s.symbol, score: s.strength, reason: `6-month ${pct(100 * s.strength)}, ATR ${check.atrPct.toFixed(1)}%, pulled back to the 20-day average` }] : [];
    }));
}

export function pickSectorMomentum(stocks: StockSnapshot[]): Pick[] {
    const gainers = [...stocks].sort((a, b) => todayPct(b) - todayPct(a) || a.symbol.localeCompare(b.symbol)).slice(0, 30);
    const counts = new Map<string, number>();
    for (const s of gainers) if (s.industry !== 'Unknown') counts.set(s.industry, (counts.get(s.industry) ?? 0) + 1);
    const hot = new Set([...counts].filter(([, n]) => n >= 4).map(([industry]) => industry));
    return top(stocks.flatMap(s => {
        if (!hot.has(s.industry) || !(s.bars[s.i].close > s.ind.sma50[s.i])) return [];
        return [{ strategy: 'SECTOR_MOMENTUM' as const, symbol: s.symbol, score: s.turnover20, reason: `${s.industry}: ${counts.get(s.industry)} stocks in today’s top 30 gainers; ${s.symbol} ${pct(todayPct(s))} today` }];
    }));
}

export function pickDeliveryOi(stocks: StockSnapshot[]): Pick[] {
    return top(stocks.flatMap(s => {
        const bar = s.bars[s.i];
        if (s.deliveryPct === null || !s.avgDeliveryPct20 || s.futOiChangePct === null) return [];
        const ratio = s.deliveryPct / s.avgDeliveryPct20;
        const closeStrong = bar.high > bar.low ? (bar.close - bar.low) / (bar.high - bar.low) >= 0.5 : false;
        const pass = todayPct(s) >= 1 && closeStrong && ratio >= 1.5 && s.futOiChangePct >= 3 && bar.close > s.ind.sma50[s.i];
        return pass ? [{ strategy: 'DELIVERY_OI' as const, symbol: s.symbol, score: ratio, reason: `${pct(todayPct(s))} today, delivery ${s.deliveryPct.toFixed(0)}% (${ratio.toFixed(1)}× normal), futures OI ${pct(s.futOiChangePct)}` }] : [];
    }));
}

export interface TradeProgress {
    state: 'PENDING' | 'OPEN' | 'TARGET' | 'STOP' | 'EXPIRED' | 'SKIPPED_GAP';
    entryIndex?: number;
    entryPrice?: number;
    exitIndex?: number;
    exitPrice?: number;
    netPct?: number;
}

/** Where a paper trade stands given the bars known now (pure). */
export function progressAutoTrade(bars: PriceBar[], signalIndex: number): TradeProgress {
    const entryIndex = signalIndex + 1;
    if (entryIndex >= bars.length) return { state: 'PENDING' };
    if (bars[entryIndex].open > bars[signalIndex].close * (1 + AUTO_RULES.maxGapUpPct / 100)) return { state: 'SKIPPED_GAP' };
    const result = simulateTrade(bars, entryIndex, AUTO_EXIT, AUTO_RULES.costBps);
    if (!result) return { state: 'OPEN', entryIndex, entryPrice: bars[entryIndex].open };
    const state = result.outcome === 'TARGET' ? 'TARGET' : result.outcome === 'STOP' ? 'STOP' : 'EXPIRED';
    return { state, entryIndex, entryPrice: result.entry, exitIndex: result.exitIndex, exitPrice: result.exit, netPct: result.netPct };
}

const utc = (key: string) => new Date(`${key}T00:00:00.000Z`);
const key = (date: Date) => date.toISOString().slice(0, 10);

async function latestSession(): Promise<string> {
    const row = await prisma.dailyCandle.findFirst({ where: { isFinal: true, symbol: 'RELIANCE' }, orderBy: { tradingDate: 'desc' }, select: { tradingDate: true } });
    if (!row) throw new Error('No finalized candles.');
    return key(row.tradingDate);
}

/** Top 500 company shares by 20-session turnover on the given date (same rule as the studies). */
async function universeOn(date: string): Promise<string[]> {
    const rows = await prisma.$queryRaw<Array<{ symbol: string }>>`
        WITH t AS (
            SELECT c.symbol, c."tradingDate" AS d, c.series,
                   AVG(c."turnoverCr") OVER w AS t20, COUNT(c."turnoverCr") OVER w AS cnt
            FROM "DailyCandle" c JOIN "MarketInstrument" m ON m.symbol = c.symbol
            WHERE c."isFinal" = true AND m.isin LIKE 'INE%' AND c."tradingDate" BETWEEN ${date}::date - 45 AND ${date}::date
            WINDOW w AS (PARTITION BY c.symbol ORDER BY c."tradingDate" ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)
        )
        SELECT symbol FROM t WHERE d = ${date}::date AND cnt = 20 AND series = 'EQ' ORDER BY t20 DESC LIMIT 500`;
    return rows.map(row => row.symbol);
}

async function niftyTrendUp(date: string): Promise<boolean> {
    const bars = (await loadAdjustedDailySeries('NIFTY_50', { to: utc(date) })).bars;
    const ind = computeSeriesIndicators(bars);
    const i = bars.length - 1;
    return bars[i]?.date === date && i >= 10 && bars[i].close > ind.sma50[i] && ind.sma50[i] > ind.sma50[i - 10];
}

async function snapshots(date: string): Promise<StockSnapshot[]> {
    const symbols = await universeOn(date);
    if (!symbols.length) throw new Error(`No universe stocks on ${date}.`);
    const industries = loadIndustries();
    const from = new Date(utc(date).getTime() - 420 * 86_400_000);
    const delivery = await prisma.$queryRaw<Array<{ symbol: string; d: Date; p: number | null }>>`
        SELECT symbol, "tradingDate" AS d, "deliveryPct" AS p FROM "DailyCandle"
        WHERE symbol IN (${Prisma.join(symbols)}) AND "isFinal" = true AND "tradingDate" BETWEEN ${date}::date - 40 AND ${date}::date
        ORDER BY symbol, "tradingDate"`;
    const deliveryBy = new Map<string, Array<{ d: string; p: number | null }>>();
    for (const row of delivery) { const list = deliveryBy.get(row.symbol) ?? []; list.push({ d: key(row.d), p: row.p }); deliveryBy.set(row.symbol, list); }
    const fno = await prisma.fnoDaily.findMany({ where: { tradingDate: utc(date), isIndex: false }, select: { symbol: true, futOi: true, futOiChange: true } });
    const oiBy = new Map(fno.map(row => {
        const previous = Number(row.futOi) - Number(row.futOiChange);
        return [row.symbol, previous > 0 ? (100 * Number(row.futOiChange)) / previous : null] as const;
    }));
    const out: StockSnapshot[] = [];
    for (const symbol of symbols) {
        const bars = (await loadAdjustedDailySeries(symbol, { from, to: utc(date) })).bars;
        const i = bars.length - 1;
        if (i < 60 || bars[i].date !== date) continue;
        const rows = deliveryBy.get(symbol) ?? [];
        const today = rows.find(row => row.d === date)?.p ?? null;
        const prior = rows.filter(row => row.d < date && row.p !== null).slice(-20).map(row => row.p!);
        out.push({
            symbol,
            industry: industries.get(symbol) ?? 'Unknown',
            bars,
            ind: computeSeriesIndicators(bars),
            i,
            strength: momentumReturn(bars, i),
            turnover20: bars.slice(i - 19).reduce((sum, bar) => sum + bar.close * bar.volume, 0) / 20,
            deliveryPct: today,
            avgDeliveryPct20: prior.length >= 10 ? prior.reduce((s, v) => s + v, 0) / prior.length : null,
            futOiChangePct: oiBy.get(symbol) ?? null,
        });
    }
    return out;
}

/** Record today's picks; one row per strategy, stock and date (safe to re-run). */
export async function recordPicks(date: string): Promise<Pick[]> {
    const stocks = await snapshots(date);
    if (stocks.length < 100) throw new Error(`Only ${stocks.length} stocks have a finalized candle on ${date}.`);
    const picks = [...pickTrendPullback(stocks, await niftyTrendUp(date)), ...pickSectorMomentum(stocks), ...pickDeliveryOi(stocks)];
    const closeOf = new Map(stocks.map(s => [s.symbol, s.bars[s.i].close]));
    const rank = new Map<string, number>();
    for (const pick of picks) {
        const n = (rank.get(pick.strategy) ?? 0) + 1;
        rank.set(pick.strategy, n);
        await prisma.autoPaperTrade.upsert({
            where: { strategy_symbol_signalDate: { strategy: pick.strategy, symbol: pick.symbol, signalDate: utc(date) } },
            create: { strategy: pick.strategy, symbol: pick.symbol, signalDate: utc(date), rank: n, score: pick.score, reason: pick.reason, signalClose: closeOf.get(pick.symbol)!, state: 'PENDING' },
            update: {},
        });
    }
    return picks;
}

/** Advance every PENDING / OPEN trade with the candles available now. */
export async function advanceTrades(): Promise<{ checked: number; closed: number }> {
    const open = await prisma.autoPaperTrade.findMany({ where: { state: { in: ['PENDING', 'OPEN'] } } });
    let closed = 0;
    for (const trade of open) {
        const signalKey = key(trade.signalDate);
        const [series, events] = await Promise.all([loadAdjustedDailySeries(trade.symbol, { from: trade.signalDate }), loadCorporateActions(trade.symbol)]);
        const bars = series.bars;
        if (bars[0]?.date !== signalKey) continue;
        const factor = factorAfter(events, signalKey); // adjusted prices → signal-day prices
        const progress = progressAutoTrade(bars, 0);
        if (!['PENDING', 'OPEN'].includes(progress.state)) closed += 1;
        await prisma.autoPaperTrade.update({
            where: { id: trade.id },
            data: {
                state: progress.state,
                entryDate: progress.entryIndex !== undefined ? utc(bars[progress.entryIndex].date) : null,
                entryPrice: progress.entryPrice !== undefined ? progress.entryPrice / factor : null,
                exitDate: progress.exitIndex !== undefined ? utc(bars[progress.exitIndex].date) : null,
                exitPrice: progress.exitPrice !== undefined ? progress.exitPrice / factor : null,
                netPct: progress.netPct ?? null,
                sessionsHeld: progress.exitIndex !== undefined && progress.entryIndex !== undefined ? progress.exitIndex - progress.entryIndex + 1 : progress.entryIndex !== undefined ? bars.length - progress.entryIndex : null,
                lastCheckedDate: utc(bars[bars.length - 1].date),
            },
        });
    }
    return { checked: open.length, closed };
}

export interface Scorecard {
    strategy: Strategy;
    closed: number;
    targets: number;
    stops: number;
    expired: number;
    hitRate: number | null;
    avgNetPct: number | null;
    avgSessions: number | null;
    open: number;
    pending: number;
    skipped: number;
    verdict: string;
}

export function scorecard(strategy: Strategy, trades: Array<{ state: string; netPct: number | null; sessionsHeld: number | null }>): Scorecard {
    const closed = trades.filter(t => ['TARGET', 'STOP', 'EXPIRED'].includes(t.state));
    const mean = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);
    const targets = closed.filter(t => t.state === 'TARGET').length;
    const hitRate = closed.length ? (100 * targets) / closed.length : null;
    const avgNetPct = mean(closed.map(t => t.netPct ?? 0));
    const verdict = closed.length < AUTO_RULES.verdictTrades
        ? `Collecting (${closed.length}/${AUTO_RULES.verdictTrades} closed)`
        : avgNetPct! > 0 && hitRate! >= AUTO_RULES.breakEvenHitRate ? 'WORKING on paper' : 'NOT WORKING';
    return {
        strategy, closed: closed.length, targets, stops: closed.filter(t => t.state === 'STOP').length, expired: closed.filter(t => t.state === 'EXPIRED').length,
        hitRate, avgNetPct, avgSessions: mean(closed.map(t => t.sessionsHeld ?? 0)),
        open: trades.filter(t => t.state === 'OPEN').length, pending: trades.filter(t => t.state === 'PENDING').length, skipped: trades.filter(t => t.state === 'SKIPPED_GAP').length,
        verdict,
    };
}

export async function writeReport(latestPicks: Pick[], date: string): Promise<Scorecard[]> {
    const all = await prisma.autoPaperTrade.findMany({ orderBy: [{ signalDate: 'desc' }, { strategy: 'asc' }, { rank: 'asc' }] });
    const cards = (Object.keys(STRATEGIES) as Strategy[]).map(s => scorecard(s, all.filter(t => t.strategy === s)));
    const f = (v: number | null, digits = 1, suffix = '') => (v === null ? '—' : `${v.toFixed(digits)}${suffix}`);
    const sign = (v: number | null) => (v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
    const lines = [
        '# Auto paper trading',
        '',
        `Updated: ${new Date().toISOString()} · latest signal session ${date} · paper only, no orders are placed.`,
        '',
        `Rules for every strategy: top ${AUTO_RULES.perStrategy} picks per day, buy at the next open (skipped if it opens > ${AUTO_RULES.maxGapUpPct}% above the signal close), target +${AUTO_RULES.targetPct}%, stop −${AUTO_RULES.stopPct}%, exit at the close of session ${AUTO_RULES.horizon}. ${AUTO_RULES.costBps / 100}% costs. With these levels a strategy needs about ${AUTO_RULES.breakEvenHitRate}% of trades hitting the target to make money. Verdict after ${AUTO_RULES.verdictTrades} closed trades.`,
        '',
        '## Scorecard',
        '',
        '| Strategy | Closed | Hit +5% | Stopped | Time exit | Hit rate | Avg net per trade | Avg days held | Open | Waiting to enter | Skipped (gap) | Verdict |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|',
        ...cards.map(c => `| ${c.strategy} | ${c.closed} | ${c.targets} | ${c.stops} | ${c.expired} | ${f(c.hitRate, 1, '%')} | ${sign(c.avgNetPct)} | ${f(c.avgSessions)} | ${c.open} | ${c.pending} | ${c.skipped} | ${c.verdict} |`),
        '',
        ...(Object.entries(STRATEGIES).map(([s, text]) => `- **${s}**: ${text}`)),
        '',
        `## Picks from ${date}`,
        '',
        latestPicks.length ? '| Strategy | Stock | Why |\n|---|---|---|' : 'No stock passed any strategy today.',
        ...latestPicks.map(p => `| ${p.strategy} | ${p.symbol} | ${p.reason} |`),
        '',
        '## All paper trades',
        '',
        '| Signal | Strategy | Stock | State | Entry | Exit | Net | Days |',
        '|---|---|---|---|---:|---:|---:|---:|',
        ...all.map(t => `| ${key(t.signalDate)} | ${t.strategy} | ${t.symbol} | ${t.state} | ${t.entryPrice ? t.entryPrice.toFixed(2) : '—'} | ${t.exitPrice ? t.exitPrice.toFixed(2) : '—'} | ${sign(t.netPct)} | ${t.sessionsHeld ?? '—'} |`),
        '',
        'Paper results, not investment advice.',
        '',
    ];
    mkdirSync('reports', { recursive: true });
    writeFileSync(join('reports', 'auto-paper.md'), lines.join('\n'));
    return cards;
}

export async function runAutoPaper(date?: string): Promise<Scorecard[]> {
    const session = date ?? (await latestSession());
    const { checked, closed } = await advanceTrades();
    const picks = await recordPicks(session);
    const cards = await writeReport(picks, session);
    console.log(`[AutoPaper] ${session}: advanced ${checked} (closed ${closed}); new picks ${picks.length} (${picks.map(p => `${p.strategy}:${p.symbol}`).join(', ') || 'none'})`);
    for (const c of cards) console.log(`[AutoPaper] ${c.strategy}: ${c.verdict}; hit rate ${c.hitRate === null ? '—' : c.hitRate.toFixed(1) + '%'}, avg ${c.avgNetPct === null ? '—' : c.avgNetPct.toFixed(2) + '%'}`);
    return cards;
}

if (require.main === module) {
    const date = process.argv.find(arg => arg.startsWith('--date='))?.slice(7);
    runAutoPaper(date)
        .catch(error => { console.error('[AutoPaper] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
