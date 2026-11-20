import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../prismaClient';
import { getDhanApiFromEnv } from '../dhanClient';
import { Candle } from '../types';

/**
 * Early-session research, step 1: a data pilot. Fetches one year of Dhan
 * 5-minute candles for 50 stocks spread across the top-500 liquidity ranks
 * and checks them against the official NSE daily candles before any study
 * uses intraday data.
 *   npm run data:intraday-pilot              (fetch + quality report)
 *   npm run data:intraday-pilot -- --check   (quality report only)
 */

export const PILOT = { stocks: 50, universe: 500, days: 365, chunkDays: 89, requestGapMs: 250 } as const;
const SESSION_BARS = 75; // 09:15 → 15:25 starts, 5 minutes each

/** Every k-th name of a liquidity-ranked list, so the pilot covers rank 1 to ~500. */
export function pickSpread<T>(ranked: T[], count: number): T[] {
    if (ranked.length <= count) return [...ranked];
    const step = ranked.length / count;
    return Array.from({ length: count }, (_, i) => ranked[Math.floor(i * step)]);
}

/** Split [from, to) into windows no longer than chunkDays (Dhan caps minute data at 90 days a request). */
export function chunkRange(from: Date, to: Date, chunkDays: number): Array<[Date, Date]> {
    const chunks: Array<[Date, Date]> = [];
    for (let start = from.getTime(); start < to.getTime(); start += chunkDays * 86_400_000) {
        chunks.push([new Date(start), new Date(Math.min(to.getTime(), start + chunkDays * 86_400_000))]);
    }
    return chunks;
}

/** IST session date and HH:MM of an instant. */
export function istParts(instant: Date): { date: string; time: string } {
    const ist = new Date(instant.getTime() + 5.5 * 3_600_000).toISOString();
    return { date: ist.slice(0, 10), time: ist.slice(11, 16) };
}

export interface DailyRef { open: number; high: number; low: number; close: number; volume: number }
export interface DayQuality {
    bars: number;
    startsAt0915: boolean;
    volumeRatio: number | null;
    openGapPct: number | null;
    closeGapPct: number | null;
    rangeInsideDaily: boolean | null;
}

/** Compare one stock-day of 5-minute bars (sorted) with the official daily candle. */
export function dayQuality(bars: Array<{ time: string; open: number; high: number; low: number; close: number; volume: number }>, daily: DailyRef | undefined): DayQuality {
    const pct = (a: number, b: number) => (a / b - 1) * 100;
    const high = Math.max(...bars.map(b => b.high));
    const low = Math.min(...bars.map(b => b.low));
    const volume = bars.reduce((s, b) => s + b.volume, 0);
    return {
        bars: bars.length,
        startsAt0915: bars[0]?.time === '09:15',
        volumeRatio: daily && daily.volume > 0 ? volume / daily.volume : null,
        openGapPct: daily ? pct(bars[0].open, daily.open) : null,
        closeGapPct: daily ? pct(bars.at(-1)!.close, daily.close) : null,
        // NSE's daily high/low come from the same trades, so 5-minute extremes should sit inside them (0.1% tolerance).
        rangeInsideDaily: daily ? high <= daily.high * 1.001 && low >= daily.low * 0.999 : null,
    };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function pilotSymbols(): Promise<Array<{ symbol: string; rank: number }>> {
    const rows = await prisma.$queryRaw<Array<{ symbol: string; rk: bigint }>>(Prisma.sql`
        WITH latest AS (SELECT MAX("tradingDate") AS d FROM "DailyCandle" WHERE symbol = 'NIFTY_50'),
        t AS (
            SELECT c.symbol, c."tradingDate" AS d, c.series,
                   AVG(c."turnoverCr") OVER w AS t20, COUNT(c."turnoverCr") OVER w AS cnt
            FROM "DailyCandle" c JOIN "MarketInstrument" m ON m.symbol = c.symbol
            WHERE c."isFinal" = true AND m.isin LIKE 'INE%' AND c."tradingDate" > (SELECT d FROM latest) - INTERVAL '60 days'
            WINDOW w AS (PARTITION BY c.symbol ORDER BY c."tradingDate" ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)
        )
        SELECT symbol, RANK() OVER (ORDER BY t20 DESC) AS rk
        FROM t WHERE d = (SELECT d FROM latest) AND cnt = 20 AND series = 'EQ'
        ORDER BY t20 DESC LIMIT ${PILOT.universe}`);
    return pickSpread(rows.map(r => ({ symbol: r.symbol, rank: Number(r.rk) })), PILOT.stocks);
}

async function fetchSymbol(symbol: string, from: Date, to: Date): Promise<{ bars: number; error?: string }> {
    const api = getDhanApiFromEnv();
    if (!api) throw new Error('Dhan is not configured (DHAN_CLIENT_ID / access token).');
    let total = 0;
    for (const [start, end] of chunkRange(from, to, PILOT.chunkDays)) {
        let candles: Candle[] = [];
        for (let attempt = 0; ; attempt += 1) {
            try {
                candles = await api.getHistoricalDataRange(symbol, '5m', start, end);
                break;
            } catch (error: any) {
                const status = error?.response?.status;
                const message = String(error?.message ?? error);
                if (/401|authentication/i.test(message)) throw new Error('Dhan authentication failed (401): refresh DHAN_ACCESS_TOKEN.');
                if ((status === 429 || status >= 500 || !status) && attempt < 4) { await sleep(1_000 * 2 ** attempt); continue; }
                return { bars: total, error: `${start.toISOString().slice(0, 10)}: ${status ?? ''} ${message}`.slice(0, 200) };
            }
        }
        await sleep(PILOT.requestGapMs);
        if (!candles.length) continue;
        for (let i = 0; i < candles.length; i += 500) {
            const batch = candles.slice(i, i + 500);
            await prisma.$executeRaw(Prisma.sql`
                INSERT INTO "IntradayCandle" ("symbol", "startTime", "tradingDate", "open", "high", "low", "close", "volume")
                VALUES ${Prisma.join(batch.map(c => {
                    const start = new Date(c.timestamp ?? c.date);
                    return Prisma.sql`(${symbol}, ${start}, ${new Date(`${istParts(start).date}T00:00:00Z`)}, ${c.open}, ${c.high}, ${c.low}, ${c.close}, ${BigInt(Math.round(c.volume))})`;
                }))}
                ON CONFLICT ("symbol", "startTime") DO UPDATE SET
                    "open" = EXCLUDED."open", "high" = EXCLUDED."high", "low" = EXCLUDED."low",
                    "close" = EXCLUDED."close", "volume" = EXCLUDED."volume", "tradingDate" = EXCLUDED."tradingDate"`);
        }
        total += candles.length;
    }
    return { bars: total };
}

const median = (xs: number[]) => {
    if (!xs.length) return NaN;
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const share = (xs: boolean[]) => (xs.length ? (100 * xs.filter(Boolean).length) / xs.length : NaN);

async function qualityReport(symbols: Array<{ symbol: string; rank: number }>, fetchLog: Map<string, { bars: number; error?: string }>, from: Date): Promise<string> {
    const rows: string[] = [];
    const all: DayQuality[] = [];
    let missingDays = 0;
    let dailyDays = 0;
    for (const { symbol, rank } of symbols) {
        const [intraday, daily] = await Promise.all([
            prisma.intradayCandle.findMany({ where: { symbol, tradingDate: { gte: from } }, orderBy: { startTime: 'asc' } }),
            prisma.dailyCandle.findMany({ where: { symbol, isFinal: true, tradingDate: { gte: from } }, select: { tradingDate: true, open: true, high: true, low: true, close: true, volume: true, series: true } }),
        ]);
        const dailyBy = new Map(daily.map(d => [d.tradingDate.toISOString().slice(0, 10), { open: d.open, high: d.high, low: d.low, close: d.close, volume: Number(d.volume) }]));
        const byDay = new Map<string, Array<{ time: string; open: number; high: number; low: number; close: number; volume: number }>>();
        for (const c of intraday) {
            const { date, time } = istParts(c.startTime);
            const list = byDay.get(date) ?? [];
            list.push({ time, open: c.open, high: c.high, low: c.low, close: c.close, volume: Number(c.volume) });
            byDay.set(date, list);
        }
        const days = [...byDay].map(([date, bars]) => dayQuality(bars, dailyBy.get(date)));
        all.push(...days);
        const missing = [...dailyBy.keys()].filter(date => !byDay.has(date)).length;
        missingDays += missing;
        dailyDays += dailyBy.size;
        const vol = median(days.map(d => d.volumeRatio).filter((v): v is number => v !== null));
        const full = share(days.map(d => d.bars === SESSION_BARS));
        const error = fetchLog.get(symbol)?.error;
        rows.push(`| ${rank} | ${symbol} | ${dailyBy.size} | ${byDay.size} | ${missing} | ${full.toFixed(0)}% | ${Number.isFinite(vol) ? vol.toFixed(3) : '—'} | ${error ? `⚠️ ${error}` : ''} |`);
    }
    const vols = all.map(d => d.volumeRatio).filter((v): v is number => v !== null);
    const opens = all.map(d => d.openGapPct).filter((v): v is number => v !== null).map(Math.abs);
    const closes = all.map(d => d.closeGapPct).filter((v): v is number => v !== null).map(Math.abs);
    const inside = all.map(d => d.rangeInsideDaily).filter((v): v is boolean => v !== null);
    return [
        '# Intraday data pilot (Dhan 5-minute candles)',
        '',
        `Generated: ${new Date().toISOString()} · ${symbols.length} stocks spread across today's top-${PILOT.universe} liquidity ranks · window from ${from.toISOString().slice(0, 10)} · checked against official NSE daily candles.`,
        '',
        '## Summary',
        '',
        '| Check | Result |',
        '|---|---:|',
        `| Stock-days with intraday data | ${all.length.toLocaleString('en-IN')} |`,
        `| NSE trading days with no intraday data | ${missingDays} of ${dailyDays} (${dailyDays ? ((100 * missingDays) / dailyDays).toFixed(1) : '—'}%) |`,
        `| Days with all ${SESSION_BARS} bars | ${share(all.map(d => d.bars === SESSION_BARS)).toFixed(1)}% |`,
        `| Days whose first bar starts 09:15 IST | ${share(all.map(d => d.startsAt0915)).toFixed(1)}% |`,
        `| Median intraday volume ÷ NSE daily volume | ${median(vols).toFixed(3)} |`,
        `| Days with volume ratio outside 0.9–1.1 | ${share(vols.map(v => v < 0.9 || v > 1.1)).toFixed(1)}% |`,
        `| Median abs gap, first 5-min open vs NSE open | ${median(opens).toFixed(3)}% |`,
        `| Median abs gap, last 5-min close vs NSE close | ${median(closes).toFixed(3)}% (NSE close is a 30-minute average, so a gap is expected) |`,
        `| Days with 5-min high/low inside NSE daily range | ${share(inside).toFixed(1)}% |`,
        '',
        '## Per stock',
        '',
        '| Rank | Symbol | NSE days | Intraday days | Missing | Full days | Median volume ratio | Fetch issue |',
        '|---:|---|---:|---:|---:|---:|---:|---|',
        ...rows,
        '',
        'Known limit: Dhan serves history only for instruments listed today, so stocks that stopped trading are absent (survivorship bias in absolute returns; comparisons against a control group on the same data are unaffected).',
        '',
    ].join('\n');
}

async function main(): Promise<void> {
    const checkOnly = process.argv.includes('--check');
    const to = new Date();
    const from = new Date(to.getTime() - PILOT.days * 86_400_000);
    const symbols = await pilotSymbols();
    console.log(`[Intraday] ${symbols.length} pilot symbols (ranks ${symbols[0]?.rank}–${symbols.at(-1)?.rank}).`);
    const fetchLog = new Map<string, { bars: number; error?: string }>();
    if (!checkOnly) {
        for (const [index, { symbol }] of symbols.entries()) {
            const result = await fetchSymbol(symbol, from, to);
            fetchLog.set(symbol, result);
            console.log(`[Intraday] ${index + 1}/${symbols.length} ${symbol}: ${result.bars} bars${result.error ? ` (${result.error})` : ''}`);
        }
    }
    const report = await qualityReport(symbols, fetchLog, new Date(`${from.toISOString().slice(0, 10)}T00:00:00Z`));
    writeFileSync(join('reports', 'intraday-pilot.md'), report);
    console.log('[Intraday] Report: reports/intraday-pilot.md');
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[Intraday] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
