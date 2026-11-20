import 'dotenv/config';
import prisma from './prismaClient';
import { checkFreshness } from './dataFreshness';
import { backfillGlobalMarkets } from './globalMarketBackfill';
import { syncInstitutionalFlowFromOfficialReport } from './institutionalFlowService';
import { syncNseDailyBlockDeals, syncNseDailyBulkDeals } from './services/institutionalService';
import { check, frozenDates, isFrozen, make } from './research/forwardCheck';
import { backfillFno } from './fnoBhavcopy';
import { runAutoPaper } from './autoPaper';

/**
 * Nightly research step, run after the finalized post-market scan
 * (SETUP_DISCOVERY_ROADMAP.md Phase 0). Never places orders.
 *  0. Tops up global market and commodity closes, today's bulk and block
 *     deals, and the FII/DII flow report.
 *  1. Data freshness: logs every stale feed.
 *  2. Forward check: freezes this close's rule-based lists (never overwrites)
 *     and re-scores the frozen lists from the last 10 signal dates.
 *  3. F&O open interest top-up, then auto paper trading (src/autoPaper.ts).
 *
 *   npm run nightly:research
 */
export async function runNightlyResearch(): Promise<void> {
    await backfillGlobalMarkets().catch(error => console.warn('[Nightly] Global market top-up failed:', error?.message ?? error));
    // The 16:10 institutional cron in index.ts is disabled in personal mode, which
    // is why deals and flows stopped on 2026-07-31. Run the same syncs here.
    for (const [name, sync] of [['Bulk deals', syncNseDailyBulkDeals], ['Block deals', syncNseDailyBlockDeals]] as const) {
        const result = await sync().catch((error: any) => ({ success: false, count: 0, message: error?.message ?? String(error) }));
        if (!result.success) console.warn(`[Nightly] ${name} sync failed: ${result.message}`);
    }
    await syncInstitutionalFlowFromOfficialReport().catch(error => console.warn('[Nightly] FII/DII flow sync failed:', error?.message ?? error));
    const feeds = await checkFreshness();
    for (const feed of feeds.filter(item => item.status !== 'OK')) {
        console.warn(`[Nightly] ${feed.status} feed: ${feed.feed} (latest ${feed.latest ?? 'none'}, lag ${feed.lagWeekdays ?? '—'} weekdays, max ${feed.maxLagWeekdays})`);
    }
    const candles = feeds.find(item => item.feed.startsWith('Daily candles'));
    if (!candles?.latest || candles.status !== 'OK') {
        console.warn('[Nightly] Daily candles are not current; skipping the forward check.');
        return;
    }
    if (!isFrozen(candles.latest)) await make(candles.latest);
    for (const date of frozenDates().filter(date => date < candles.latest!).slice(-10)) await check(date);
    console.log(`[Nightly] Forward checks updated through ${candles.latest}.`);
    // F&O open interest for the last two weeks (skips days already stored), then auto paper trading.
    const since = new Date(`${candles.latest}T00:00:00.000Z`);
    since.setUTCDate(since.getUTCDate() - 14);
    const fno = await backfillFno(since.toISOString().slice(0, 10), candles.latest).catch((error: any) => ({ loaded: 0, holidays: 0, failed: [String(error?.message ?? error)] }));
    if (fno.failed.length) console.warn(`[Nightly] F&O top-up failures: ${fno.failed.join('; ')}`);
    await runAutoPaper(candles.latest).catch(error => console.warn('[Nightly] Auto paper trading failed:', error?.message ?? error));
}

if (require.main === module) {
    runNightlyResearch()
        .catch(error => { console.error('[Nightly] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
