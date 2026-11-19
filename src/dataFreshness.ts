import 'dotenv/config';
import prisma from './prismaClient';

/**
 * Data freshness monitor (SETUP_DISCOVERY_ROADMAP.md, lesson C4).
 * Every feed has an allowed lag in weekdays; a feed past it is STALE.
 *
 *   npm run data:freshness        (exit code 1 if any required feed is stale)
 */

export interface FeedStatus {
    feed: string;
    latest: string | null;
    lagWeekdays: number | null;
    maxLagWeekdays: number;
    required: boolean;
    status: 'OK' | 'STALE' | 'EMPTY';
}

/** Weekdays strictly after `from` up to and including `to` (exchange holidays are not excluded, so limits carry slack). */
export function weekdaysBetween(from: string, to: string): number {
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    let count = 0;
    for (let d = new Date(start.getTime() + 86_400_000); d <= end; d = new Date(d.getTime() + 86_400_000)) {
        const day = d.getUTCDay();
        if (day !== 0 && day !== 6) count += 1;
    }
    return count;
}

export function classify(feed: string, latest: string | null, today: string, maxLagWeekdays: number, required: boolean): FeedStatus {
    if (!latest) return { feed, latest, lagWeekdays: null, maxLagWeekdays, required, status: 'EMPTY' };
    const lag = weekdaysBetween(latest, today);
    return { feed, latest, lagWeekdays: lag, maxLagWeekdays, required, status: lag > maxLagWeekdays ? 'STALE' : 'OK' };
}

/** Today's date in India (the exchange's calendar). */
export function indiaToday(now = new Date()): string {
    return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

const day = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);

export async function checkFreshness(today = indiaToday()): Promise<FeedStatus[]> {
    const [candle, eod, results, deal, flowSnapshot, flow] = await Promise.all([
        prisma.dailyCandle.findFirst({ where: { isFinal: true, symbol: 'NIFTY_50' }, orderBy: { tradingDate: 'desc' }, select: { tradingDate: true } }),
        prisma.eodIngestionRun.findFirst({ where: { status: 'READY' }, orderBy: { tradingDate: 'desc' }, select: { tradingDate: true } }),
        prisma.resultsEvent.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
        prisma.institutionalDeal.findFirst({ orderBy: { tradeDate: 'desc' }, select: { tradeDate: true } }),
        prisma.institutionalFlowSnapshot.findFirst({ orderBy: { tradingDate: 'desc' }, select: { tradingDate: true } }),
        prisma.institutionalFlow.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
    ]);
    return [
        classify('Daily candles (final)', day(candle?.tradingDate), today, 1, true),
        classify('EOD ingestion run (READY)', day(eod?.tradingDate), today, 1, true),
        classify('Results calendar (last refresh)', day(results?.createdAt), today, 5, true),
        classify('Bulk/block deals', day(deal?.tradeDate), today, 3, false),
        classify('Institutional flow snapshot', day(flowSnapshot?.tradingDate), today, 3, false),
        classify('FII/DII flows', day(flow?.date), today, 3, false),
    ];
}

async function main(): Promise<void> {
    const today = indiaToday();
    const rows = await checkFreshness(today);
    console.log(`Data freshness on ${today} (lag in weekdays):`);
    for (const row of rows) {
        const flag = row.status === 'OK' ? 'OK   ' : row.status === 'STALE' ? 'STALE' : 'EMPTY';
        console.log(`  ${flag} ${row.feed.padEnd(34)} latest ${row.latest ?? '—'}  lag ${row.lagWeekdays ?? '—'} (max ${row.maxLagWeekdays})${row.required ? '' : '  [not yet required]'}`);
    }
    if (rows.some(row => row.required && row.status !== 'OK')) process.exitCode = 1;
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[Freshness] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
