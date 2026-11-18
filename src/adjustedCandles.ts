import prisma from './prismaClient';
import {
    adjustBars,
    auditAdjustedJumps,
    CorporateActionEvent,
    PriceBar,
    previousTradingDateLookup,
    SUSPICIOUS_JUMP_PCT,
} from './corporateActions';

export interface AdjustedDailySeries {
    symbol: string;
    bars: PriceBar[];
    /**
     * Dates of large one-day moves with no recorded corporate action. These are
     * often genuine crashes or rallies, so research code must not silently drop
     * them; doing so would bias results upward. Review them instead.
     */
    unverifiedJumpDates: string[];
}

let calendarCache: { loadedAt: number; lookup: (date: string) => string | undefined } | null = null;
const CALENDAR_TTL_MS = 10 * 60_000;

function dateKey(value: Date): string {
    return value.toISOString().slice(0, 10);
}

/** Previous trading date, derived from the dates on which NIFTY 50 or most stocks traded. */
export async function loadTradingCalendar(): Promise<(date: string) => string | undefined> {
    if (calendarCache && Date.now() - calendarCache.loadedAt < CALENDAR_TTL_MS) return calendarCache.lookup;
    // A date counts as a session only if a broad set of symbols traded; this
    // ignores the handful of backfilled symbols that cover data gaps.
    const rows = await prisma.$queryRaw<Array<{ tradingDate: Date }>>`
        SELECT "tradingDate" FROM "DailyCandle"
        WHERE "isFinal" = true
        GROUP BY "tradingDate"
        HAVING COUNT(*) >= 500
        ORDER BY "tradingDate"`;
    const lookup = previousTradingDateLookup(rows.map(row => dateKey(row.tradingDate)));
    calendarCache = { loadedAt: Date.now(), lookup };
    return lookup;
}

export async function loadCorporateActions(symbol: string): Promise<CorporateActionEvent[]> {
    const rows = await prisma.corporateAction.findMany({
        where: { symbol },
        orderBy: { exDate: 'asc' },
        select: { exDate: true, priceFactor: true, source: true },
    });
    // One event per ex-date; a manual record overrides a provider record.
    const byDate = new Map<string, CorporateActionEvent>();
    for (const row of rows) {
        const key = dateKey(row.exDate);
        if (byDate.has(key) && row.source !== 'MANUAL') continue;
        byDate.set(key, { exDate: key, priceFactor: row.priceFactor });
    }
    return [...byDate.values()];
}

/**
 * Finalized daily candles for one symbol, adjusted for recorded splits and
 * bonuses, with any remaining unexplained jumps listed for review.
 */
export async function loadAdjustedDailySeries(
    symbol: string,
    options: { from?: Date; to?: Date } = {},
): Promise<AdjustedDailySeries> {
    const rows = await prisma.dailyCandle.findMany({
        where: {
            symbol,
            isFinal: true,
            tradingDate: { ...(options.from ? { gte: options.from } : {}), ...(options.to ? { lte: options.to } : {}) },
        },
        orderBy: { tradingDate: 'asc' },
        select: { tradingDate: true, open: true, high: true, low: true, close: true, volume: true },
    });
    const raw: PriceBar[] = rows.map(row => ({
        date: dateKey(row.tradingDate),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: Number(row.volume),
    }));
    const [events, previousTradingDate] = await Promise.all([loadCorporateActions(symbol), loadTradingCalendar()]);
    const { unexplained } = auditAdjustedJumps(raw, events, SUSPICIOUS_JUMP_PCT, previousTradingDate);
    return {
        symbol,
        bars: adjustBars(raw, events),
        unverifiedJumpDates: unexplained.map(jump => jump.date),
    };
}
