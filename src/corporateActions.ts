/**
 * Split / bonus / consolidation handling for historical daily prices.
 *
 * NSE daily files are raw: a 1:1 bonus shows as a 50% one-day "crash".
 * Raw candles stay unchanged in the database; these pure functions apply
 * adjustment on read and audit whatever large jumps remain unexplained.
 */

export interface CorporateActionEvent {
    /** First trading date on which the new share count applies (YYYY-MM-DD, IST). */
    exDate: string;
    /** Multiplier for every price before exDate (0.5 for a 2:1 split or 1:1 bonus). */
    priceFactor: number;
}

export interface PriceBar {
    date: string; // YYYY-MM-DD
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface PriceJump {
    date: string;
    previousDate: string;
    previousClose: number;
    close: number;
    /** close / previousClose */
    ratio: number;
}

/** Default size of a one-day move treated as suspicious for a daily bar. */
export const SUSPICIOUS_JUMP_PCT = 25;

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

/**
 * Cumulative price factor for each bar: the product of all event factors whose
 * ex-date is after the bar. Prices are multiplied and volume divided by it,
 * so the series is expressed in today's share count.
 */
export function adjustBars<T extends PriceBar>(bars: T[], events: CorporateActionEvent[]): T[] {
    const valid = events
        .filter(event => Number.isFinite(event.priceFactor) && event.priceFactor > 0 && event.priceFactor !== 1)
        .sort((left, right) => left.exDate.localeCompare(right.exDate));
    if (!valid.length) return bars.map(bar => ({ ...bar }));
    return bars.map(bar => {
        let factor = 1;
        for (const event of valid) if (bar.date < event.exDate) factor *= event.priceFactor;
        if (factor === 1) return { ...bar };
        return {
            ...bar,
            open: bar.open * factor,
            high: bar.high * factor,
            low: bar.low * factor,
            close: bar.close * factor,
            volume: bar.volume / factor,
        };
    });
}

/**
 * One-day moves larger than thresholdPct between consecutive trading days.
 * When a trading calendar is supplied, pairs separated by missing sessions
 * are skipped: a data gap is not a price jump.
 */
export function findSuspiciousJumps(
    bars: PriceBar[],
    thresholdPct = SUSPICIOUS_JUMP_PCT,
    previousTradingDate?: (date: string) => string | undefined,
): PriceJump[] {
    const sorted = [...bars].sort((left, right) => left.date.localeCompare(right.date));
    const jumps: PriceJump[] = [];
    for (let index = 1; index < sorted.length; index += 1) {
        const previous = sorted[index - 1];
        const current = sorted[index];
        if (!(previous.close > 0) || !(current.close > 0)) continue;
        if (previousTradingDate && previousTradingDate(current.date) !== previous.date) continue;
        const ratio = current.close / previous.close;
        if (Math.abs(ratio - 1) * 100 > thresholdPct) {
            jumps.push({ date: current.date, previousDate: previous.date, previousClose: previous.close, close: current.close, ratio });
        }
    }
    return jumps;
}

/**
 * Jumps that remain after adjustment. Anything left is either a genuine
 * extreme move or a corporate action we have no record of; research code
 * should exclude windows around these dates rather than trust them.
 */
export function auditAdjustedJumps(
    rawBars: PriceBar[],
    events: CorporateActionEvent[],
    thresholdPct = SUSPICIOUS_JUMP_PCT,
    previousTradingDate?: (date: string) => string | undefined,
): { rawJumps: PriceJump[]; unexplained: PriceJump[] } {
    const rawJumps = findSuspiciousJumps(rawBars, thresholdPct, previousTradingDate);
    if (!rawJumps.length) return { rawJumps, unexplained: [] };
    const unexplained = findSuspiciousJumps(adjustBars(rawBars, events), thresholdPct, previousTradingDate);
    return { rawJumps, unexplained };
}

export function classifyPriceFactor(priceFactor: number): { kind: 'SPLIT' | 'CONSOLIDATION'; ratio: string } {
    if (priceFactor < 1) {
        const newPerOld = 1 / priceFactor;
        return { kind: 'SPLIT', ratio: `${formatRatioPart(newPerOld)}:1` };
    }
    return { kind: 'CONSOLIDATION', ratio: `1:${formatRatioPart(priceFactor)}` };
}

function formatRatioPart(value: number): string {
    return Number.isInteger(+value.toFixed(4)) ? String(Math.round(value)) : value.toFixed(4).replace(/0+$/, '');
}

/** Calendar date in India for a Unix timestamp in seconds. */
export function istDateFromUnixSeconds(seconds: number): string {
    return new Date(seconds * 1000 + IST_OFFSET_MS).toISOString().slice(0, 10);
}

interface YahooSplit {
    date?: number;
    numerator?: number;
    denominator?: number;
}

/**
 * Parse split events from a Yahoo chart response (`events=split`). Yahoo
 * reports Indian bonus issues as splits, e.g. a 1:1 bonus as 2:1.
 */
export function parseYahooSplits(payload: unknown): CorporateActionEvent[] {
    const result = (payload as { chart?: { result?: Array<{ events?: { splits?: Record<string, YahooSplit> } }> } })
        ?.chart?.result?.[0];
    const splits = result?.events?.splits;
    if (!splits) return [];
    const events: CorporateActionEvent[] = [];
    for (const split of Object.values(splits)) {
        const numerator = Number(split.numerator);
        const denominator = Number(split.denominator);
        const date = Number(split.date);
        if (!(numerator > 0) || !(denominator > 0) || !Number.isFinite(date) || numerator === denominator) continue;
        events.push({ exDate: istDateFromUnixSeconds(date), priceFactor: denominator / numerator });
    }
    return events.sort((left, right) => left.exDate.localeCompare(right.exDate));
}

/**
 * Third-party event dates can be a session away from NSE's ex-date. Snap each
 * event to the raw jump within maxDays whose size matches its factor
 * (within 20%). Events with no matching jump keep their reported date.
 */
export function reconcileEventDates(
    events: CorporateActionEvent[],
    rawJumps: PriceJump[],
    maxDays = 5,
): CorporateActionEvent[] {
    const used = new Set<string>();
    return events.map(event => {
        const eventTime = Date.parse(`${event.exDate}T00:00:00Z`);
        let best: PriceJump | undefined;
        let bestDistance = Infinity;
        for (const jump of rawJumps) {
            if (used.has(jump.date)) continue;
            const distance = Math.abs(Date.parse(`${jump.date}T00:00:00Z`) - eventTime) / 86_400_000;
            const sizeMatches = Math.abs(jump.ratio / event.priceFactor - 1) <= 0.2;
            if (distance <= maxDays && sizeMatches && distance < bestDistance) {
                best = jump;
                bestDistance = distance;
            }
        }
        if (!best) return event;
        used.add(best.date);
        return { ...event, exDate: best.date };
    });
}

/** Build a previous-trading-date lookup from the set of dates the market traded. */
export function previousTradingDateLookup(tradingDates: string[]): (date: string) => string | undefined {
    const sorted = [...new Set(tradingDates)].sort();
    const previous = new Map<string, string>();
    for (let index = 1; index < sorted.length; index += 1) previous.set(sorted[index], sorted[index - 1]);
    return date => previous.get(date);
}
