import 'dotenv/config';
import axios from 'axios';
import prisma from './prismaClient';

/**
 * Global market and commodity daily closes (SETUP_DISCOVERY_ROADMAP.md Phase 2).
 *   npm run data:global            (backfill from 2019-09 and top up; idempotent)
 *
 * Source: Yahoo chart API (the endpoint the app already uses for prices).
 * Bars are dated in each series' exchange time zone. The current day's bar is
 * skipped because it is still trading.
 */

export const GLOBAL_SERIES = [
    { series: 'COPPER', ticker: 'HG=F', label: 'COMEX copper futures' },
    { series: 'BRENT', ticker: 'BZ=F', label: 'Brent crude futures' },
    { series: 'USDINR', ticker: 'INR=X', label: 'US dollar in rupees' },
    { series: 'NASDAQ', ticker: '^IXIC', label: 'Nasdaq Composite' },
    { series: 'SP500', ticker: '^GSPC', label: 'S&P 500' },
    { series: 'GOLD', ticker: 'GC=F', label: 'COMEX gold futures' },
] as const;

export interface GlobalBar { date: string; open: number | null; high: number | null; low: number | null; close: number }

/** Date of a UTC timestamp in an IANA time zone, as YYYY-MM-DD. */
export function localDate(epochSeconds: number, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(epochSeconds * 1000));
}

/** Parse a Yahoo chart response into completed daily bars (drops nulls and today's still-trading bar). */
export function parseChart(payload: any, now = new Date()): GlobalBar[] {
    const result = payload?.chart?.result?.[0];
    if (!result?.timestamp) return [];
    const zone: string = result.meta?.exchangeTimezoneName || 'UTC';
    const quote = result.indicators?.quote?.[0] ?? {};
    const today = localDate(Math.floor(now.getTime() / 1000), zone);
    const byDate = new Map<string, GlobalBar>();
    result.timestamp.forEach((ts: number, k: number) => {
        const close = quote.close?.[k];
        if (close == null || !(close > 0)) return;
        const date = localDate(ts, zone);
        if (date >= today) return;
        byDate.set(date, { date, open: quote.open?.[k] ?? null, high: quote.high?.[k] ?? null, low: quote.low?.[k] ?? null, close });
    });
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchSeries(ticker: string, fromEpoch: number): Promise<GlobalBar[]> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${fromEpoch}&period2=${Math.floor(Date.now() / 1000)}&interval=1d&includePrePost=false`;
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, timeout: 20_000 });
    return parseChart(data);
}

export async function backfillGlobalMarkets(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const { series, ticker } of GLOBAL_SERIES) {
        const bars = await fetchSeries(ticker, Math.floor(Date.UTC(2019, 8, 1) / 1000));
        for (let k = 0; k < bars.length; k += 500) {
            const chunk = bars.slice(k, k + 500);
            await prisma.$transaction(chunk.map(bar => prisma.globalMarketDaily.upsert({
                where: { series_date: { series, date: new Date(`${bar.date}T00:00:00Z`) } },
                create: { series, ticker, date: new Date(`${bar.date}T00:00:00Z`), open: bar.open, high: bar.high, low: bar.low, close: bar.close },
                update: { open: bar.open, high: bar.high, low: bar.low, close: bar.close },
            })));
        }
        counts[series] = bars.length;
        console.log(`[Global] ${series} (${ticker}): ${bars.length} bars ${bars[0]?.date ?? '—'} → ${bars.at(-1)?.date ?? '—'}`);
    }
    return counts;
}

/** Load one series as date-sorted closes. */
export async function loadGlobalSeries(series: string): Promise<GlobalBar[]> {
    const rows = await prisma.globalMarketDaily.findMany({ where: { series }, orderBy: { date: 'asc' } });
    return rows.map(row => ({ date: row.date.toISOString().slice(0, 10), open: row.open, high: row.high, low: row.low, close: row.close }));
}

if (require.main === module) {
    backfillGlobalMarkets()
        .catch(error => { console.error('[Global] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
