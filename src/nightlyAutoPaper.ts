import 'dotenv/config';
import prisma from './prismaClient';
import { runEodMarketDataPipeline } from './eodMarketDataService';
import { backfillFno } from './fnoBhavcopy';
import { runAutoPaper, setLastAutoPaperRun } from './autoPaper';
import { refreshRecentResults } from './quarterlyResultsBackfill';

/**
 * Evening job for auto paper trading, independent of the scanner switches:
 *   1. load the latest finalized NSE candles (with delivery %) and NIFTY 50,
 *   2. top up F&O open interest for the last two weeks,
 *   3. advance open paper trades and record the new picks.
 * Single-flight; safe to run repeatedly. Never places orders.
 *
 *   npm run paper:nightly
 */
let running: Promise<string> | null = null;

function istToday(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

async function latestCandleDate(): Promise<string | null> {
    const row = await prisma.dailyCandle.findFirst({ where: { isFinal: true, symbol: 'RELIANCE' }, orderBy: { tradingDate: 'desc' }, select: { tradingDate: true } });
    return row ? row.tradingDate.toISOString().slice(0, 10) : null;
}

async function run(): Promise<string> {
    try {
        const eod = await runEodMarketDataPipeline();
        if (!eod.ready) console.warn('[AutoPaperNightly] Latest EOD candles are not ready yet; using the stored ones.');
    } catch (error: any) {
        console.warn('[AutoPaperNightly] EOD candle refresh failed; using the stored ones:', error?.message ?? error);
    }
    const latest = await latestCandleDate();
    if (!latest) throw new Error('No finalized candles in the database.');
    const since = new Date(`${latest}T00:00:00.000Z`);
    since.setUTCDate(since.getUTCDate() - 14);
    const fno = await backfillFno(since.toISOString().slice(0, 10), istToday());
    if (fno.failed.length) console.warn(`[AutoPaperNightly] F&O failures: ${fno.failed.join('; ')}`);
    // New quarterly results (NSE integrated filings, last 10 days) for the earnings-surprise score.
    let results = '';
    try {
        const r = await refreshRecentResults(10);
        results = `; ${r.added} new quarterly result(s)`;
    } catch (error: any) {
        console.warn('[AutoPaperNightly] Quarterly results refresh failed; using the stored ones:', error?.message ?? error);
    }
    const cards = await runAutoPaper(latest);
    const active = cards.reduce((n, c) => n + c.open + c.pending, 0);
    return `Signals from ${latest} recorded; ${fno.loaded} new F&O day(s)${results}; ${active} trade(s) open or waiting to enter.`;
}

export async function runAutoPaperNightly(): Promise<string> {
    if (running) return running;
    running = run()
        .then(message => { setLastAutoPaperRun(true, message); console.log(`[AutoPaperNightly] ${message}`); return message; })
        .catch(error => { setLastAutoPaperRun(false, String(error?.message ?? error)); throw error; })
        .finally(() => { running = null; });
    return running;
}

export function autoPaperRunning(): boolean {
    return running !== null;
}

if (require.main === module) {
    runAutoPaperNightly()
        .catch(error => { console.error('[AutoPaperNightly] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
