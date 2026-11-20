import prisma from '../prismaClient';
import { Condition, OutcomeStats } from './fivePercentStudy';

/** Shared inputs and formatting for the point-in-time research studies. */

export const UNIVERSE_SIZE = 500;
export const TEST_START = '2024-01-01';
export const MIN_DISCOVERY_TRADES = 300;

export function dateKey(value: Date): string {
    return value.toISOString().slice(0, 10);
}

export async function loadUniverse(): Promise<Map<string, Set<string>>> {
    const rows = await prisma.$queryRaw<Array<{ symbol: string; d: Date }>>`
        WITH t AS (
            SELECT c.symbol, c."tradingDate" AS d, c.series,
                   AVG(c."turnoverCr") OVER w AS t20,
                   COUNT(c."turnoverCr") OVER w AS cnt
            FROM "DailyCandle" c
            JOIN "MarketInstrument" m ON m.symbol = c.symbol
            WHERE c."isFinal" = true AND m.isin LIKE 'INE%'
            WINDOW w AS (PARTITION BY c.symbol ORDER BY c."tradingDate" ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)
        ),
        -- Only normal (EQ) days are eligible; trade-to-trade days count toward turnover history only.
        r AS (SELECT symbol, d, RANK() OVER (PARTITION BY d ORDER BY t20 DESC) AS rk FROM t WHERE cnt = 20 AND series = 'EQ')
        SELECT symbol, d FROM r WHERE rk <= ${UNIVERSE_SIZE}`;
    const bySymbol = new Map<string, Set<string>>();
    for (const row of rows) {
        const dates = bySymbol.get(row.symbol) ?? new Set<string>();
        dates.add(dateKey(row.d));
        bySymbol.set(row.symbol, dates);
    }
    return bySymbol;
}

export async function loadNiftyContext(): Promise<Map<string, { green: boolean; return63: number }>> {
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

export function pct(value: number): string {
    return `${value.toFixed(1)}%`;
}

export function r(value: number): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(3)}R`;
}

export function statsCells(stats: OutcomeStats): string {
    if (!stats.n) return '0 | — | — | — | —';
    return `${stats.n.toLocaleString('en-IN')} | ${pct(stats.targetPct)} | ${pct(stats.stopPct)} | ${pct(stats.expiredPct)} | ${r(stats.avgNetR)} ± ${stats.ciNetR.toFixed(3)}`;
}

export function conditionNames(conditions: Condition[]): string {
    return conditions.map(condition => condition.label).join(' + ');
}

