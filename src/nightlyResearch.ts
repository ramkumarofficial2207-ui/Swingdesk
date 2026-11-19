import 'dotenv/config';
import prisma from './prismaClient';
import { checkFreshness } from './dataFreshness';
import { check, frozenDates, isFrozen, make } from './research/forwardCheck';

/**
 * Nightly research step, run after the finalized post-market scan
 * (SETUP_DISCOVERY_ROADMAP.md Phase 0). Never places orders.
 *  1. Data freshness: logs every stale feed.
 *  2. Forward check: freezes this close's rule-based lists (never overwrites)
 *     and re-scores the frozen lists from the last 10 signal dates.
 *
 *   npm run nightly:research
 */
export async function runNightlyResearch(): Promise<void> {
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
}

if (require.main === module) {
    runNightlyResearch()
        .catch(error => { console.error('[Nightly] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
